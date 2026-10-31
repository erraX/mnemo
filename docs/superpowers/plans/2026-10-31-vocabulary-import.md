# Vocabulary Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Vocably CSV/TSV inside Mnemo, with a safe preview and duplicate-skipping append semantics.

**Architecture:** Browser-side format adapter parses to `NoteInput[]`; the repository owns preview/deduplication and a single atomic write transaction. A separate import screen reads files and confirms that transaction; Settings only links to it. Existing backup restore remains separate.

**Tech Stack:** React 19, TypeScript, Dexie 4, csv-parse 7 browser/esm/sync, ts-fsrs 5.4, Vitest/jsdom.

**Spec:** `docs/superpowers/specs/2026-10-31-vocabulary-import-design.md`

## Global Constraints

- Import only appends; duplicates (`trim().toLowerCase()`) are skipped without modifications.
- Keep all scheduler calls in `src/lib/scheduler.ts`; use scheduler.newCard via the repository.
- No DB schema changes, no settings writes, no review-history or drafts changes.
- Use original Chinese translation, IPA and individual examples; no dictionary replacement.
- Max file size 5 MiB; max 10,000 data records; parsing/preview never writes to DB.
- UTF-8 BOM, CRLF, quoted newlines, escaped quotes and both comma/Tab supported.
- Unsupported/malformed structure rejects whole file; missing word/meaning becomes a reported invalid record.
- One transaction rechecks duplicates and writes all notes/cards or none; prefetch happens after commit.
- UI Chinese, theme tokens, controls >=44px; do not commit the user's complete CSV.

## Files and interfaces

- `src/lib/vocabularyImport.ts`: format registry, CSV parser, mapping. Exports `parseVocabularyImport(text): ParsedVocabularyImport`, `MAX_IMPORT_BYTES`, `MAX_IMPORT_RECORDS`. Parsed value `{ format: string; entries: NoteInput[]; total: number; invalidRows: number[] }` (data-record ordinals, not physical lines).
- `src/lib/vocabularyImport.test.ts`: synthetic samples only.
- `src/db/repo.ts`: extract a private normalized-note factory shared by createNote/import; exports `previewNoteImport(db, inputs)` → `{ entries: NoteInput[]; skipped: number; cardCount: number }`; `importNotes(db, inputs, now?, sched?)` → `{ notes: Note[]; skipped: number; cardCount: number }`.
- `src/db/importNotes.test.ts`: transactional data-safety and idempotency tests.
- `src/screens/Import.tsx`, `src/screens/Import.test.tsx`: selection, preview, confirmation, results/errors. Uses `db`, parser and repository interfaces above. `prefetchHeadwords` after commit (fire-and-forget with catch).
- `src/screens/Settings.tsx`, `src/screens/Settings.test.tsx`: link `/import` labelled 导入词库.
- `src/app/App.tsx`: register `/import` outside tab routes.
- `package.json`, `pnpm-lock.yaml`: move existing csv-parse 7 to runtime dependencies for browser build.
- `README.md`: supported format and append/restore distinction, export delimiter instructions and omitted fields.

### Task 1: Format parsing and mapping

- [ ] Write failing tests in `src/lib/vocabularyImport.test.ts`. Representative test:

```ts
const text = 'Word/Phrase\tTranslation\tIPA\tExample\nconcern\t担忧\tkən\t"* I have concerns.\n* A concern."'
const parsed = parseVocabularyImport(text)
expect(parsed.total).toBe(1)
expect(parsed.entries[0]?.examples.map(e => e.text)).toEqual(['I have concerns.', 'A concern.'])
expect(parsed.entries[0]?.enabledTypes).toEqual(['zh2en', 'cloze', 'en2zh'])
```

- [ ] `pnpm exec vitest run src/lib/vocabularyImport.test.ts` must fail before implementation.
- [ ] Move dependency with `pnpm add csv-parse@^7.0.3`. Import `parse` from `csv-parse/browser/esm/sync`.
- [ ] Parse delimiter by reading first record with `to: 1` for Tab/comma and recognizing the required header pair. Parse full table with `bom: true`, `skip_empty_lines: true`, strict equal columns. Map headers once, trim values, split Example on newlines, strip `*`, `•` or `-` bullet + whitespace, run `detectBlanks`. Use `filterEnabled(input, CARD_TYPES)` for card types. Record invalid rows (empty word/meaning); reject unsupported headers, bad quotes/widths and >10,000 records with Chinese messages. Registry dispatches by table headers so later adapters reuse the pipeline.
- [ ] Cover CSV quoted comma/quote, BOM/CRLF, phrase blanks, missing optional columns, no valid rows, blank lines, wrong format and row count. Re-run focused tests until green.
- [ ] Commit parser, tests and dependency files: `feat(import): parse Vocably CSV and TSV with quoted examples`.

### Task 2: Atomic append and preview

- [ ] Add failing `src/db/importNotes.test.ts`. Seed/grading an existing `Concern`, preview `[concern, frontier, FRONTIER, guardrails]` must give 2 fresh + 2 skipped. Snapshot notes/cards/logs/settings/drafts before import, confirm original rows unchanged afterward. Re-import same input creates no new rows. Test insertion between preview and confirmation and simultaneous imports of identical words.

```ts
const first = await importNotes(db, inputs, NOW, sched)
expect(first.notes.map(n => n.headword)).toEqual(['frontier', 'guardrails'])
expect((await importNotes(db, inputs, NOW, sched)).notes).toEqual([])
expect(await db.notes.get(existing.id)).toEqual(existing)
```

- [ ] `pnpm exec vitest run src/db/importNotes.test.ts` → FAIL missing exports.
- [ ] Refactor normalized-note construction into `makeNote(input, now)` without changing createNote behavior. `previewNoteImport` reads existing keys, normalizes inputs, validates nonempty headword/meaning, filters duplicate keys in DB and earlier rows, counts enabled card types. `importNotes` wraps preview and note/card generation in `db.transaction('rw', db.notes, db.cards, ...)`; no external async/network calls inside it. Return only actually inserted notes + skipped + cardCount. Use one timestamp with stable input order.
- [ ] Inject a scheduler whose `newCard` throws during the batch and assert notes/cards counts and originals unchanged. Set new-card cap 1 and assert `getTodayCounts` still returns fresh 1 after importing several notes. Re-run focused tests and `src/db/repo.test.ts`.
- [ ] Commit: `feat(import): append notes atomically and skip duplicate headwords`.

### Task 3: File selection, preview and confirmation

- [ ] Add failing `Import.test.tsx` using `renderWithRouter` and real exported-format synthetic File values. After file selection assert format/preview counts and `await db.notes.count() === 0`; only a click on 导入 N 条 creates notes. Assert results with card count, duplicate existing preservation, all-duplicates disabled, parse/read errors do not write, failed transaction can retry, invalid rows displayed, and file size guard.
- [ ] `pnpm exec vitest run src/screens/Import.test.tsx` → FAIL missing screen.
- [ ] Build screen with return-to-settings Link, single hidden file input in a 44px label, `.csv,.tsv,.txt` + text MIME accept list. Read UTF-8 with File.text(); render summary and first five fresh entries. Keep parsed input separate from DB preview; recheck on commit. Busy guards use synchronous refs as well as disabled controls. Clear prior preview on new selection/error and reset file input value. Render read/parse errors as role alert, progress/results as role status. A ref cleanup prevents acting on stale reads after unmount. Confirmation commit completes even if user navigates away; background prefetch never controls success/failure UI.
- [ ] Settings adds `Link to="/import"` with 导入词库 and explanatory 只追加，已有词跳过. Router imports screen and registers `/import`. Settings test asserts link.
- [ ] `pnpm exec vitest run src/screens/Import.test.tsx src/screens/Settings.test.tsx` → PASS. Check production browser route and file flow.
- [ ] Commit: `feat(import): preview and confirm vocabulary imports from Settings`.

### Task 4: Acceptance and docs

- [ ] Use a local-only `pnpm exec tsx` script (outside repo) to call parser on `/Users/mni/Downloads/en-2026-10-21.csv`; assert total/valid 113, compare every headword, translation, IPA and example text to raw CSV, calculate expected card total. Do not commit source data.
- [ ] Document Vocably comma/Tab export, default skip duplicates, new-card schedule, unsupported custom delimiters, ignored fields and distinction from destructive restore in README.
- [ ] Run `pnpm test && pnpm build`, then inspect diff for private data and unrelated changes. Check test fixtures contain only synthetic/minimal examples.
- [ ] Mark plan boxes with results. Commit docs: `docs: explain vocabulary import formats and duplicate handling`.

## Self-review

Spec covered by parser (mapping/limits/errors), repository (skip/atomic/history/settings), UI (safe explicit confirmation), and verification (real file + regression). New format means new adapter, not a new writer. No generic CSV column mapper or backup-as-append mode is implied. Execution is inline because current request asks to continue implementing, not to launch agents. No publish until asked.
