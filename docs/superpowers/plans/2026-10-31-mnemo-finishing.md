# Mnemo 收尾（Plan 3 / 3）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 MVP 剩下的三块界面（收集箱、卡片列表、设置 + 备份/恢复）、把 Plan 2 最终审查暂存的修复做掉，并通过规范第 8 节的完整验收。

**Architecture:** 延续 Plan 1/2：新逻辑先落在纯函数或 `repo.ts`（可测），React 只渲染与转发事件；备份的分享/下载通过可注入的 `ShareDeps` 隔离浏览器 API。所有新屏幕复用 Plan 2 的 UI 原语。

**Tech Stack:** 同 Plan 2（pnpm 11 · Vite 8 · React 19 · TS 7 · Tailwind 4 · Dexie 4 · react-router 7 HashRouter · Vitest 5 + jsdom + @testing-library）。

**Spec:** `docs/superpowers/specs/2026-10-30-mnemo-design.md`（§5.5 收集箱、§5.9 备份、§5.11 屏幕、§8 验收）。Mockup：`docs/mockups/mnemo-mockups.html` 第 2、3 节。Plan 2 最终审查遗留项见本计划 Task 1 与 Task 7。

## Global Constraints

- Plan 1/2 的全部约束继续有效（`/mnemo/` base、DB 名 `mnemo`、ts-fsrs 只在 `scheduler.ts`、04:00 边界、UUID + epoch ms、UI 中文、输入 ≥16px、Conventional Commits、每任务 `pnpm test && pnpm build` 通过）
- 收集箱：多行文本 → `splitPaste` → 每行一条 `Draft`；`headword` 草稿后台查词典显示状态；`sentence` 草稿进编辑器后"点一个词作为要记的词"；草稿在**建卡成功的同一事务**里删除（规范 §5.5；最终审查建议）
- 卡片列表：搜索匹配 headword / 释义 / 例句文本（忽略大小写）；每行显示 headword、释义首行、启用的卡型、最近到期；点开进入 `/note/:id`（规范 §5.11）
- 设置：每日新卡上限（0–200）、口音 `us|uk`、翻面自动朗读、备份到文件、从文件恢复、关于（版本、ECDICT (MIT)、ts-fsrs、数据地址）、诊断入口（规范 §5.11）
- 备份：`exportBackup` → `File`（`backupFilename`）→ `navigator.share({ files })`，不支持则下载；**只有分享/下载成功才 `markBackedUp`**，用户取消不算；恢复：`validateBackup` → `window.confirm`（写明条数、会覆盖）→ `importBackup`（规范 §5.9）
- 口音切换后对全部 headword 重新预热发音缓存；回到在线状态时补预热最近 7 天改动过的记录（Plan 2 最终审查建议）
- 两处规范偏离（本计划决定，写回规范）：草稿与记录的删除用**显式按钮 + 确认**，不做左滑手势；卡片列表不提供行内删除，删除在编辑页

## 文件结构

```
src/db/repo.ts                 + addDrafts / deleteDraft / createNote(..., { draftId }) / searchNotes / allTags；修 shownToday 顺序
src/lib/format.ts              + noteDueSummary
src/lib/backupShare.ts         备份文件、分享/下载（可注入）、读取文件
src/lib/prefetchAll.ts         批量预热发音
src/lib/session.ts             afterUndo 把恢复的卡放回队首
src/app/useOnlinePrefetch.ts   上线时补预热
src/app/version.ts             __APP_VERSION__
src/screens/Inbox.tsx          收集箱
src/screens/Cards.tsx          卡片列表
src/screens/Settings.tsx       设置（替换 SettingsStub）
src/screens/NoteEditor.tsx     + 草稿预填、句子选词、错误提示、未找到态、标签建议、chip 原因
src/screens/Review.tsx         + 前台重查、错误提示、撤销后回队首
src/components/review/CardFront.tsx  PlayButton 44px
src/app/App.tsx                新路由
vite.config.ts                 define __APP_VERSION__
docs/superpowers/specs/...     §5.5 / §5.11 偏离写回；§8 勾选
README.md                      功能一览
```

---

### Task 1: 仓储补齐（草稿、搜索、标签、updateNote 顺序修复）与到期摘要

**Files:**
- Modify: `src/db/repo.ts`, `src/lib/format.ts`
- Test: `src/db/repo.test.ts`（追加）, `src/lib/format.test.ts`（追加）

**Interfaces:**
- Produces（`repo.ts`）：
  - `createNote(db, raw, now?, sched?, opts: { draftId?: string } = {})` — 有 `draftId` 时在同一事务删除该草稿
  - `addDrafts(db, lines: Array<{ raw: string; kind: DraftKind }>, now?): Promise<Draft[]>` — 跳过与现有草稿 `raw` 大小写相同的行
  - `deleteDraft(db, id): Promise<void>`
  - `searchNotes(db, query: string, limit = 300): Promise<Note[]>` — 按 `updatedAt` 倒序
  - `allTags(db): Promise<Array<{ tag: string; count: number }>>` — 按次数降序、再按字母
- Produces（`format.ts`）：`noteDueSummary(cards: Card[], now: number): string` — 没有卡 `—`；否则取 `due` 最小的卡交给 `dueLabel`

- [ ] **Step 1: 写失败测试**

追加到 `src/db/repo.test.ts`（放在文件末尾，复用顶部的 `createTestDb/NOW/sched/input` 等）:
```ts
import { addDrafts, allTags, deleteDraft, searchNotes } from './repo'

describe('drafts', () => {
  it('addDrafts stores lines, skips case-insensitive duplicates of existing drafts, keeps order', async () => {
    const db = createTestDb()
    await addDrafts(db, [{ raw: 'concern', kind: 'headword' }], NOW)
    const added = await addDrafts(db, [{ raw: 'Concern', kind: 'headword' }, { raw: 'I have concerns.', kind: 'sentence' }], NOW + 1)
    expect(added.map((d) => d.raw)).toEqual(['I have concerns.'])
    const all = await db.drafts.orderBy('createdAt').toArray()
    expect(all.map((d) => d.raw)).toEqual(['concern', 'I have concerns.'])
  })
  it('createNote with draftId deletes the draft in the same transaction', async () => {
    const db = createTestDb()
    const [d] = await addDrafts(db, [{ raw: 'concern', kind: 'headword' }], NOW)
    await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched, { draftId: d!.id })
    expect(await db.drafts.count()).toBe(0)
    expect(await db.notes.count()).toBe(1)
  })
  it('deleteDraft removes one draft', async () => {
    const db = createTestDb()
    const [a, b] = await addDrafts(db, [{ raw: 'a', kind: 'headword' }, { raw: 'b', kind: 'headword' }], NOW)
    await deleteDraft(db, a!.id)
    expect((await db.drafts.toArray()).map((d) => d.id)).toEqual([b!.id])
  })
})

describe('searchNotes / allTags', () => {
  it('matches headword, meaning and example text case-insensitively, newest first', async () => {
    const db = createTestDb()
    await createNote(db, { ...input, headword: 'leverage', meaning: '杠杆', examples: [], tags: ['biz'], enabledTypes: ['en2zh'] }, NOW, sched)
    await createNote(db, { ...input, headword: 'concern', meaning: 'n. 担忧', tags: ['cet4', 'biz'], enabledTypes: ['en2zh'] }, NOW + 1, sched)
    expect((await searchNotes(db, '')).map((n) => n.headword)).toEqual(['concern', 'leverage'])
    expect((await searchNotes(db, 'CONC')).map((n) => n.headword)).toEqual(['concern'])
    expect((await searchNotes(db, '杠杆')).map((n) => n.headword)).toEqual(['leverage'])
    expect((await searchNotes(db, 'have concerns')).map((n) => n.headword)).toEqual(['concern'])
    expect(await searchNotes(db, 'zzz')).toEqual([])
    expect(await allTags(db)).toEqual([{ tag: 'biz', count: 2 }, { tag: 'cet4', count: 1 }])
  })
})

describe('updateNote burying when types are swapped in one save', () => {
  it('buries the replacement card even though the graded card and its log are deleted in the same save', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    const [card] = await db.cards.where('noteId').equals(note.id).toArray()
    await gradeCard(db, card!.id, 3, NOW, sched)
    await updateNote(db, note.id, { ...input, enabledTypes: ['zh2en'] }, NOW + MIN, sched, ['en2zh'])
    const [zh] = await db.cards.where('noteId').equals(note.id).toArray()
    expect(zh!.type).toBe('zh2en')
    expect(zh!.buriedUntil).toBe(nextLearningDayStart(NOW))
  })
})
```
在该测试文件顶部补 `import { nextLearningDayStart } from '@/lib/day'`（若尚未导入）。

追加到 `src/lib/format.test.ts`:
```ts
import type { Card } from '@/domain/types'
import { noteDueSummary } from './format'

describe('noteDueSummary', () => {
  const card = (p: Partial<Card>): Card => ({
    id: 'c', noteId: 'n', type: 'en2zh', due: NOW, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
    learning_steps: 0, reps: 0, lapses: 0, state: 2, createdAt: NOW, ...p,
  })
  it('uses the earliest-due card', () => {
    expect(noteDueSummary([], NOW)).toBe('—')
    expect(noteDueSummary([card({ due: local(2026, 11, 3, 9) }), card({ due: local(2026, 11, 1, 9) })], NOW)).toBe('明天')
    expect(noteDueSummary([card({ state: 0, due: NOW - 1000 }), card({ due: local(2026, 11, 3, 9) })], NOW)).toBe('新')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/db/repo.test.ts src/lib/format.test.ts`
Expected: FAIL（导入不存在 / 断言失败）

- [ ] **Step 3: 实现**

`src/lib/format.ts` 追加：
```ts
import type { Card } from '@/domain/types'

/** 卡片列表每行的"最近到期"：取 due 最小的那张卡 */
export function noteDueSummary(cards: Card[], now: number): string {
  if (cards.length === 0) return '—'
  const soonest = cards.reduce((a, b) => (b.due < a.due ? b : a))
  return dueLabel(soonest.due, soonest.state, now)
}
```
（把 `import type { FsrsState }` 合并为 `import type { Card, FsrsState } from '@/domain/types'`。）

`src/db/repo.ts`：
1. 顶部导入补 `type Draft`、`type DraftKind`（`DraftKind` 来自 `@/lib/inbox`）。
2. `createNote` 签名与事务改为：
```ts
export async function createNote(
  db: MnemoDB, raw: NoteInput, now = Date.now(), sched: Scheduler = defaultScheduler, opts: { draftId?: string } = {},
): Promise<Note> {
  const input = normalizeInput(raw)
  const note: Note = { /* 同原来 */ }
  await db.transaction('rw', db.notes, db.cards, db.settings, db.drafts, async () => {
    await db.notes.add(note)
    await db.cards.bulkAdd(input.enabledTypes.map((t) => sched.newCard(note.id, t, now)))
    await updateSettings(db, { lastEnabledTypes: raw.enabledTypes })
    if (opts.draftId) await db.drafts.delete(opts.draftId)
  })
  return note
}
```
3. `updateNote`：把 `shownToday` 的计算移到 `doomed` 删除之前（在 `unconfirmed` 检查之后立即计算，保存到 `const shownToday = ...`，后面 `if (toCreate.length)` 里直接使用）。
4. 新增：
```ts
export async function addDrafts(db: MnemoDB, lines: Array<{ raw: string; kind: DraftKind }>, now = Date.now()): Promise<Draft[]> {
  return db.transaction('rw', db.drafts, async () => {
    const existing = new Set((await db.drafts.toArray()).map((d) => d.raw.toLowerCase()))
    const fresh: Draft[] = []
    lines.forEach((l, i) => {
      const key = l.raw.toLowerCase()
      if (existing.has(key)) return
      existing.add(key)
      fresh.push({ id: crypto.randomUUID(), raw: l.raw, kind: l.kind, createdAt: now + i })
    })
    if (fresh.length) await db.drafts.bulkAdd(fresh)
    return fresh
  })
}

export async function deleteDraft(db: MnemoDB, id: string): Promise<void> {
  await db.drafts.delete(id)
}

export async function searchNotes(db: MnemoDB, query: string, limit = 300): Promise<Note[]> {
  const q = query.trim().toLowerCase()
  const all = await db.notes.orderBy('updatedAt').reverse().toArray()
  const hits = q
    ? all.filter((n) =>
        n.headwordKey.includes(q) || n.meaning.toLowerCase().includes(q) || n.examples.some((e) => e.text.toLowerCase().includes(q)))
    : all
  return hits.slice(0, limit)
}

export async function allTags(db: MnemoDB): Promise<Array<{ tag: string; count: number }>> {
  const counts = new Map<string, number>()
  for (const n of await db.notes.toArray()) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
```

- [ ] **Step 4: 运行测试与构建，提交**

Run: `pnpm vitest run src/db/repo.test.ts src/lib/format.test.ts && pnpm test && pnpm build`
Expected: 新增 6 个用例通过；全量通过；构建通过

```bash
git add src/db/repo.ts src/db/repo.test.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(repo): drafts, note search, tag counts, due summary; bury replacement cards correctly"
```

---

### Task 2: 收集箱界面

**Files:**
- Create: `src/screens/Inbox.tsx`
- Modify: `src/app/App.tsx`（`/inbox` → `<Inbox />`）
- Test: `src/screens/Inbox.test.tsx`

**Interfaces:**
- Consumes: `splitPaste`, `addDrafts`, `deleteDraft`, `lookupWord`, `db`, `SheetHeader`, `Button`
- Produces: 路由组件 `Inbox`；草稿行链接到 `/note/new?draft=<id>`

- [ ] **Step 1: 写失败测试**

`src/screens/Inbox.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { renderWithRouter } from '@/test/render'
import { Inbox } from './Inbox'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.dict.put({ word: 'concern', phonetic: '', translation: 'n. 担忧', forms: ['concerns'] })
})
afterEach(() => vi.restoreAllMocks())

describe('Inbox', () => {
  it('splits pasted lines into drafts with kinds and dictionary status', async () => {
    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })
    fireEvent.change(screen.getByLabelText('粘贴多行文本'), { target: { value: 'concern\nI have some concerns about it.\nticking time bomb' } })
    fireEvent.click(screen.getByRole('button', { name: '加入收集箱' }))
    await waitFor(async () => expect(await db.drafts.count()).toBe(3))
    expect(await screen.findByText('词典已补全 · 缺例句')).toBeTruthy()
    expect(screen.getByText('像是句子 · 点一个词作为要记的词')).toBeTruthy()
    expect(await screen.findByText('词典没有 · 需要自己写释义')).toBeTruthy()
    const link = screen.getByRole('link', { name: /ticking time bomb/ })
    expect(link.getAttribute('href')).toMatch(/#\/note\/new\?draft=/)
    expect((screen.getByLabelText('粘贴多行文本') as HTMLTextAreaElement).value).toBe('')
  })

  it('deletes a draft after confirmation', async () => {
    await db.drafts.add({ id: 'd1', raw: 'leverage', kind: 'headword', createdAt: 1 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })
    fireEvent.click(await screen.findByRole('button', { name: '删除 leverage' }))
    await waitFor(async () => expect(await db.drafts.count()).toBe(0))
    expect(await screen.findByText('收集箱是空的')).toBeTruthy()
  })

  it('paste button reads the clipboard into the textarea', async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn(async () => 'from clipboard') } })
    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })
    fireEvent.click(screen.getByRole('button', { name: '粘贴' }))
    await waitFor(() => expect((screen.getByLabelText('粘贴多行文本') as HTMLTextAreaElement).value).toBe('from clipboard'))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/screens/Inbox.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/screens/Inbox.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { db } from '@/db/db'
import { addDrafts, deleteDraft } from '@/db/repo'
import type { Draft } from '@/domain/types'
import { lookupWord } from '@/lib/dict'
import { splitPaste } from '@/lib/inbox'
import { Button } from '@/components/ui/Button'
import { SheetHeader } from '@/components/ui/SheetHeader'

type DictStatus = 'hit' | 'miss'

function statusLine(d: Draft, dict: DictStatus | undefined): string {
  if (d.kind === 'sentence') return '像是句子 · 点一个词作为要记的词'
  if (dict === 'hit') return '词典已补全 · 缺例句'
  if (dict === 'miss') return '词典没有 · 需要自己写释义'
  return '查询中…'
}

function badge(d: Draft, dict: DictStatus | undefined): { text: string; cls: string } {
  if (d.kind === 'sentence') return { text: '待指定', cls: 'bg-hard-bg text-hard-fg' }
  if (dict === 'hit') return { text: '可直接存', cls: 'bg-good-bg text-good-fg' }
  return { text: '待补全', cls: 'bg-hard-bg text-hard-fg' }
}

export function Inbox() {
  const navigate = useNavigate()
  const drafts = useLiveQuery(() => db.drafts.orderBy('createdAt').toArray(), [], [] as Draft[])
  const [text, setText] = useState('')
  const [dict, setDict] = useState<Record<string, DictStatus>>({})
  const [error, setError] = useState<string | undefined>(undefined)

  // 后台查词典：只查还没结果的 headword 草稿
  useEffect(() => {
    let cancelled = false
    const pending = drafts.filter((d) => d.kind === 'headword' && dict[d.id] === undefined)
    if (pending.length === 0) return
    void Promise.all(pending.map(async (d) => [d.id, (await lookupWord(db, d.raw)) ? 'hit' : 'miss'] as const)).then((pairs) => {
      if (!cancelled) setDict((prev) => ({ ...prev, ...Object.fromEntries(pairs) }))
    })
    return () => { cancelled = true }
  }, [drafts, dict])

  async function paste() {
    try {
      const clip = await navigator.clipboard.readText()
      setText((t) => (t ? `${t}\n${clip}` : clip))
      setError(undefined)
    } catch {
      setError('读取剪贴板失败，请长按文本框手动粘贴')
    }
  }

  async function submit() {
    const lines = splitPaste(text)
    if (lines.length === 0) return
    await addDrafts(db, lines)
    setText('')
  }

  async function remove(d: Draft) {
    if (!window.confirm(`删除草稿「${d.raw}」？`)) return
    await deleteDraft(db, d.id)
  }

  return (
    <div className="min-h-dvh bg-bg pb-10">
      <SheetHeader title="收集箱" onCancel={() => navigate('/')} cancelLabel="返回" action={{ label: '粘贴', onClick: () => void paste() }} />
      <div className="mx-auto flex max-w-md flex-col gap-3 p-3">
        <div className="rounded-(--radius-field) bg-panel p-3">
          <textarea
            aria-label="粘贴多行文本"
            rows={4}
            className="w-full resize-none bg-transparent text-base outline-none placeholder:text-muted"
            placeholder={'一行一条：单词、短语，或整句原文\n从 Mac 复制后可直接在手机上粘贴'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <p className="mt-1 text-xs text-again-fg">{error}</p>}
          <Button className="mt-2 w-full" disabled={splitPaste(text).length === 0} onClick={() => void submit()}>加入收集箱</Button>
        </div>

        {drafts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">收集箱是空的</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {drafts.map((d) => {
              const b = badge(d, dict[d.id])
              return (
                <li key={d.id} className="flex items-center gap-2 rounded-(--radius-field) bg-panel px-3 py-2">
                  <Link to={`/note/new?draft=${d.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{d.raw}</div>
                    <div className="text-xs text-muted">{statusLine(d, dict[d.id])}</div>
                  </Link>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${b.cls}`}>{b.text}</span>
                  <button type="button" aria-label={`删除 ${d.raw}`} className="shrink-0 px-1 text-muted" onClick={() => void remove(d)}>✕</button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
```

`src/app/App.tsx`：`import { Inbox } from '@/screens/Inbox'`，把 `/inbox` 的 `Placeholder` 换成 `<Inbox />`。

- [ ] **Step 4: 运行测试与构建，提交**

Run: `pnpm vitest run src/screens/Inbox.test.tsx && pnpm test && pnpm build`
Expected: 3 个用例通过；全量通过；构建通过

```bash
git add src/screens/Inbox.tsx src/screens/Inbox.test.tsx src/app/App.tsx
git commit -m "feat(inbox): paste multi-line text into drafts with dictionary status"
```

---

### Task 3: 编辑器接草稿（预填、句子选词、原子删除）

**Files:**
- Modify: `src/screens/NoteEditor.tsx`, `src/lib/noteForm.ts`
- Test: `src/screens/NoteEditor.test.tsx`（追加）, `src/lib/noteForm.test.ts`（追加）

**Interfaces:**
- Consumes: `?draft=<id>` 查询参数；`db.drafts.get`；`createNote(..., { draftId })`；`tokenize`
- Produces: `noteForm` 新动作 `{ type: 'prefillDraft'; draft: Draft }`（`headword` 草稿 → 设 headword；`sentence` 草稿 → 加一条例句，`pendingHeadwordPick = true`）和 `{ type: 'pickHeadword'; word: string }`（设 headword、清 `pendingHeadwordPick`、重算挖空）；`NoteFormState.pendingHeadwordPick: boolean`

- [ ] **Step 1: 写失败测试**

追加到 `src/lib/noteForm.test.ts`:
```ts
describe('drafts', () => {
  it('prefillDraft(headword) sets the headword', () => {
    const s = reduceForm(initialForm([...ALL]), { type: 'prefillDraft', draft: { id: 'd', raw: 'concern', kind: 'headword', createdAt: 1 } })
    expect(s.headword).toBe('concern')
    expect(s.pendingHeadwordPick).toBe(false)
  })
  it('prefillDraft(sentence) adds an example and waits for a headword pick; pickHeadword sets it and detects the blank', () => {
    const s1 = reduceForm(initialForm([...ALL]), { type: 'prefillDraft', draft: { id: 'd', raw: 'I have some concerns about it.', kind: 'sentence', createdAt: 1 } })
    expect(s1.examples.map((e) => e.text)).toEqual(['I have some concerns about it.'])
    expect(s1.pendingHeadwordPick).toBe(true)
    expect(s1.headword).toBe('')
    const s2 = reduceForm(s1, { type: 'pickHeadword', word: 'concerns' })
    expect(s2.headword).toBe('concerns')
    expect(s2.pendingHeadwordPick).toBe(false)
    expect(s2.examples[0]!.blanks).toEqual([{ start: 12, end: 20 }])
  })
})
```
（`initialForm` 的默认 `pendingHeadwordPick` 为 `false`；原有 `initialForm from an existing note` 的 `toMatchObject` 不受影响。）

追加到 `src/screens/NoteEditor.test.tsx`:
```tsx
describe('NoteEditor (draft prefill)', () => {
  it('prefills a headword draft and deletes it on save', async () => {
    await db.drafts.add({ id: 'd1', raw: 'concern', kind: 'headword', createdAt: 1 })
    renderWithRouter(<NoteEditor />, { route: '/note/new?draft=d1', path: '/note/new' })
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern'))
    await waitFor(() => expect(screen.getByText('已从词典补全')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /保存 · 生成/ }))
    await waitFor(async () => expect(await db.notes.count()).toBe(1))
    expect(await db.drafts.count()).toBe(0)
  })

  it('a sentence draft asks to pick the headword from its words', async () => {
    await db.drafts.add({ id: 'd2', raw: 'I have some concerns about it.', kind: 'sentence', createdAt: 1 })
    renderWithRouter(<NoteEditor />, { route: '/note/new?draft=d2', path: '/note/new' })
    expect(await screen.findByText('点一个词作为要记的词')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '选 concerns' }))
    expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concerns')
    expect(screen.queryByText('点一个词作为要记的词')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: '改为原形 concern' })).toBeTruthy())
    expect(screen.getByRole('button', { name: 'concerns' }).getAttribute('aria-pressed')).toBe('true')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/noteForm.test.ts src/screens/NoteEditor.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/noteForm.ts`：
- `NoteFormState` 增加 `pendingHeadwordPick: boolean`；`initialForm` 两个分支都设为 `false`。
- `NoteFormAction` 增加 `| { type: 'prefillDraft'; draft: Draft } | { type: 'pickHeadword'; word: string }`（导入 `Draft`）。
- `reduceForm` 增加：
```ts
    case 'prefillDraft':
      if (a.draft.kind === 'headword') return reduceForm(s, { type: 'headword', value: a.draft.raw })
      return {
        ...s,
        pendingHeadwordPick: true,
        examples: [...s.examples, { id: crypto.randomUUID(), text: a.draft.raw, source: '', blanks: [], manual: false }],
      }
    case 'pickHeadword':
      return { ...reduceForm(s, { type: 'headword', value: a.word }), pendingHeadwordPick: false }
```

`src/screens/NoteEditor.tsx`：
- 导入 `useSearchParams` 与 `tokenize`。
- 读取 `const [params] = useSearchParams(); const draftId = params.get('draft') ?? undefined`；`const draft = useLiveQuery(() => (draftId ? db.drafts.get(draftId) : undefined), [draftId])`。
- 在初始化 effect 的 `mode === 'new'` 分支里：先做原来的 types 接管，然后若 `draft` 存在且 `prefilledFor !== draft.id` → `dispatch({ type: 'prefillDraft', draft })`、`setPrefilledFor(draft.id)`、`setHeadwordDirty(true)`。实现上把 `draft` 加入依赖并用 `const [prefilledFor, setPrefilledFor] = useState<string>()` 守卫；注意新建分支的 `loadedFor` 只在 settings 到位后设一次，草稿预填独立守卫，两者顺序：先 types 后 draft。
- 在 headword 字段下方、`form.pendingHeadwordPick` 为真时渲染选词器：
```tsx
          {form.pendingHeadwordPick && form.examples[0] && (
            <div className="mt-2 rounded-(--radius-field) bg-bg p-2">
              <div className="mb-1 text-[10px] text-muted">点一个词作为要记的词</div>
              <p className="leading-8">
                {tokenize(form.examples[0].text).map((t, i) =>
                  t.isWord ? (
                    <button key={i} type="button" aria-label={`选 ${t.text}`} className="rounded-sm px-0.5 underline decoration-dotted underline-offset-4" onClick={() => { setHeadwordDirty(true); dispatch({ type: 'pickHeadword', word: t.text }) }}>
                      {t.text}
                    </button>
                  ) : <span key={i}>{t.text}</span>,
                )}
              </p>
            </div>
          )}
```
- `save()` 新建分支：`await createNote(db, input, Date.now(), undefined, { draftId })`。

- [ ] **Step 4: 运行测试与构建，提交**

Run: `pnpm vitest run src/lib/noteForm.test.ts src/screens/NoteEditor.test.tsx && pnpm test && pnpm build`
Expected: 新增 4 个用例通过；全量通过；构建通过

```bash
git add src/lib/noteForm.ts src/lib/noteForm.test.ts src/screens/NoteEditor.tsx src/screens/NoteEditor.test.tsx
git commit -m "feat(editor): prefill from inbox drafts, pick headword from a sentence, delete draft on save"
```

---

### Task 4: 卡片列表

**Files:**
- Create: `src/screens/Cards.tsx`
- Modify: `src/app/App.tsx`（`/cards` → `<Cards />`）
- Test: `src/screens/Cards.test.tsx`

**Interfaces:**
- Consumes: `searchNotes`, `db.cards`, `noteDueSummary`, `CARD_TYPES`, `CARD_TYPE_LABEL`, `useVisibilityTick`
- Produces: 路由组件 `Cards`；行链接 `/note/:id`；`SEARCH_DEBOUNCE_MS = 200`

- [ ] **Step 1: 写失败测试**

`src/screens/Cards.test.tsx`:
```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote } from '@/db/repo'
import { renderWithRouter } from '@/test/render'
import { Cards } from './Cards'

beforeEach(async () => { await db.delete(); await db.open() })

describe('Cards', () => {
  it('lists notes newest first with meaning, enabled types and due summary; search filters', async () => {
    await createNote(db, { headword: 'leverage', meaning: 'n. 杠杆作用\nv. 利用', examples: [], tags: [], enabledTypes: ['en2zh'] }, Date.now() - 1000)
    await createNote(db, { headword: 'concern', meaning: 'n. 担忧', examples: [{ text: 'I have concerns.', blanks: [{ start: 7, end: 15 }] }], tags: [], enabledTypes: ['zh2en', 'cloze', 'en2zh'] }, Date.now())
    renderWithRouter(<Cards />, { route: '/cards', path: '/cards' })
    const rows = await screen.findAllByRole('link')
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('concern'), expect.stringContaining('leverage')])
    expect(screen.getByText('n. 杠杆作用')).toBeTruthy()           // 只显示首行
    expect(screen.getByText('2 条记录 · 4 张卡')).toBeTruthy()
    expect(screen.getAllByText('新')).toHaveLength(2)
    expect(rows[0]!.getAttribute('href')).toMatch(/#\/note\//)

    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: '杠杆' } })
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1))
    expect(screen.getByText('leverage')).toBeTruthy()
  })

  it('shows an empty state', async () => {
    renderWithRouter(<Cards />, { route: '/cards', path: '/cards' })
    expect(await screen.findByText('还没有记录')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/screens/Cards.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/screens/Cards.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db } from '@/db/db'
import { searchNotes } from '@/db/repo'
import { CARD_TYPES, CARD_TYPE_LABEL, type Card } from '@/domain/types'
import { noteDueSummary } from '@/lib/format'
import { useVisibilityTick } from '@/app/useVisibilityTick'

export const SEARCH_DEBOUNCE_MS = 200

const SHORT: Record<(typeof CARD_TYPES)[number], string> = { zh2en: '中英', cloze: '挖空', en2zh: '英中' }

export function Cards() {
  useVisibilityTick() // 回到前台时重渲染，让到期文案按当前时间重算
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const notes = useLiveQuery(() => searchNotes(db, debounced), [debounced])
  const cards = useLiveQuery(() => db.cards.toArray(), [], [] as Card[])
  const totals = useLiveQuery(async () => ({ notes: await db.notes.count(), cards: await db.cards.count() }), [], { notes: 0, cards: 0 })
  const byNote = new Map<string, Card[]>()
  for (const c of cards) byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c])
  const now = Date.now()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-28" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">卡片</h1>
        <p className="text-sm text-muted">{totals.notes} 条记录 · {totals.cards} 张卡</p>
      </header>
      <input
        aria-label="搜索"
        type="search"
        placeholder="搜索单词、释义、例句"
        className="rounded-[10px] bg-panel px-3 py-2 text-base outline-none placeholder:text-muted"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {notes === undefined ? null : notes.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{debounced ? '没有匹配的记录' : '还没有记录'}</p>
      ) : (
        <ul className="overflow-hidden rounded-(--radius-card) bg-panel">
          {notes.map((n) => {
            const own = byNote.get(n.id) ?? []
            const enabled = new Set(own.map((c) => c.type))
            return (
              <li key={n.id} className="border-b border-line last:border-b-0">
                <Link to={`/note/${n.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{n.headword}</div>
                    <div className="truncate text-xs text-muted">{n.meaning.split('\n')[0]}</div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted">
                    <div className="mb-0.5 flex justify-end gap-1">
                      {CARD_TYPES.map((t) => (
                        <span key={t} title={CARD_TYPE_LABEL[t]} className={`rounded px-1 text-[9px] ${enabled.has(t) ? 'bg-easy-bg text-accent' : 'bg-line text-muted'}`}>{SHORT[t]}</span>
                      ))}
                    </div>
                    <span className={noteDueSummary(own, now) === '新' ? 'text-accent' : ''}>{noteDueSummary(own, now)}</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

`src/app/App.tsx`：`import { Cards } from '@/screens/Cards'`，`/cards` 的 `Placeholder` 换成 `<Cards />`。

- [ ] **Step 4: 运行测试与构建，提交**

Run: `pnpm vitest run src/screens/Cards.test.tsx && pnpm test && pnpm build`
Expected: 2 个用例通过；全量通过；构建通过

```bash
git add src/screens/Cards.tsx src/screens/Cards.test.tsx src/app/App.tsx
git commit -m "feat(cards): searchable note list with types and due summary"
```

---

### Task 5: 备份分享/恢复的可测核心 + 批量预热

**Files:**
- Create: `src/lib/backupShare.ts`, `src/lib/prefetchAll.ts`, `src/app/version.ts`
- Modify: `vite.config.ts`（`define`）, `src/vite-env.d.ts`
- Test: `src/lib/backupShare.test.ts`, `src/lib/prefetchAll.test.ts`

**Interfaces:**
- Produces（`backupShare.ts`）：
  - `backupToFile(data: BackupFile): File` — 名字 `backupFilename(data.exportedAt)`，`type: 'application/json'`
  - `interface ShareDeps { canShareFiles(file: File): boolean; share(file: File): Promise<void>; download(file: File): void }`
  - `deliverBackup(file: File, deps: ShareDeps): Promise<'shared' | 'downloaded' | 'cancelled'>` — 能分享就分享；`AbortError` → `cancelled`；其他分享错误 → 退回下载；不能分享 → 下载
  - `browserShareDeps(): ShareDeps`
  - `readBackupFile(file: File): Promise<unknown>` — `JSON.parse(await file.text())`，解析失败抛 `Error('不是有效的备份文件')`
- Produces（`prefetchAll.ts`）：`prefetchHeadwords(words: string[], accent: Accent, opts?: { concurrency?: number; fetchImpl?: typeof fetch; onProgress?(done: number, total: number): void }): Promise<void>`
- Produces（`version.ts`）：`APP_VERSION: string`（来自 `__APP_VERSION__`）

- [ ] **Step 1: 写失败测试**

`src/lib/backupShare.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import type { BackupFile } from './backup'
import { backupToFile, deliverBackup, readBackupFile } from './backupShare'

const data: BackupFile = {
  app: 'mnemo', version: 1, exportedAt: new Date(2026, 9, 31, 9, 5).getTime(),
  notes: [], cards: [], reviewLogs: [], drafts: [],
  settings: { id: 'settings', newCardsPerDay: 20, accent: 'us', autoPlayOnReveal: true, lastEnabledTypes: ['en2zh'] },
}

describe('backupToFile / readBackupFile', () => {
  it('round-trips through a JSON file named by export time', async () => {
    const file = backupToFile(data)
    expect(file.name).toBe('mnemo-backup-20261031-0905.json')
    expect(file.type).toBe('application/json')
    expect(await readBackupFile(file)).toEqual(data)
  })
  it('rejects non-JSON files', async () => {
    await expect(readBackupFile(new File(['not json'], 'x.json'))).rejects.toThrow('不是有效的备份文件')
  })
})

describe('deliverBackup', () => {
  const file = backupToFile(data)
  it('shares when files can be shared', async () => {
    const share = vi.fn(async () => undefined)
    const download = vi.fn()
    expect(await deliverBackup(file, { canShareFiles: () => true, share, download })).toBe('shared')
    expect(share).toHaveBeenCalledWith(file)
    expect(download).not.toHaveBeenCalled()
  })
  it('reports cancelled on AbortError without downloading', async () => {
    const err = Object.assign(new Error('cancel'), { name: 'AbortError' })
    const download = vi.fn()
    expect(await deliverBackup(file, { canShareFiles: () => true, share: async () => { throw err }, download })).toBe('cancelled')
    expect(download).not.toHaveBeenCalled()
  })
  it('falls back to download on other share errors or when sharing is unsupported', async () => {
    const download = vi.fn()
    expect(await deliverBackup(file, { canShareFiles: () => true, share: async () => { throw new Error('boom') }, download })).toBe('downloaded')
    expect(await deliverBackup(file, { canShareFiles: () => false, share: async () => undefined, download })).toBe('downloaded')
    expect(download).toHaveBeenCalledTimes(2)
  })
})
```

`src/lib/prefetchAll.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { prefetchHeadwords } from './prefetchAll'

describe('prefetchHeadwords', () => {
  it('fetches every word with bounded concurrency and reports progress', async () => {
    let inFlight = 0
    let peak = 0
    const fetchImpl = vi.fn(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch
    const progress: number[] = []
    await prefetchHeadwords(['a', 'b', 'c', 'd', 'e'], 'uk', { concurrency: 2, fetchImpl, onProgress: (d) => progress.push(d) })
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    expect(peak).toBeLessThanOrEqual(2)
    expect(progress.at(-1)).toBe(5)
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain('type=1')
  })
  it('skips blanks and duplicates and survives failures', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(prefetchHeadwords(['a', ' ', 'a', 'B'], 'us', { fetchImpl })).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/backupShare.test.ts src/lib/prefetchAll.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/backupShare.ts`:
```ts
import { backupFilename, type BackupFile } from './backup'

export function backupToFile(data: BackupFile): File {
  return new File([JSON.stringify(data)], backupFilename(data.exportedAt), { type: 'application/json' })
}

export interface ShareDeps {
  canShareFiles(file: File): boolean
  share(file: File): Promise<void>
  download(file: File): void
}

export type DeliverOutcome = 'shared' | 'downloaded' | 'cancelled'

/** iOS：分享面板 → 存储到文件（iCloud Drive）；桌面或不支持时下载 */
export async function deliverBackup(file: File, deps: ShareDeps): Promise<DeliverOutcome> {
  if (deps.canShareFiles(file)) {
    try {
      await deps.share(file)
      return 'shared'
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'cancelled'
    }
  }
  deps.download(file)
  return 'downloaded'
}

export function browserShareDeps(): ShareDeps {
  return {
    canShareFiles: (file) => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }),
    share: (file) => navigator.share({ files: [file], title: 'Mnemo 备份' }),
    download: (file) => {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
  }
}

export async function readBackupFile(file: File): Promise<unknown> {
  const text = await file.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('不是有效的备份文件')
  }
}
```

`src/lib/prefetchAll.ts`:
```ts
import type { Accent } from '@/domain/types'
import { prefetchAudio } from './audio'

export async function prefetchHeadwords(
  words: string[],
  accent: Accent,
  opts: { concurrency?: number; fetchImpl?: typeof fetch; onProgress?: (done: number, total: number) => void } = {},
): Promise<void> {
  const unique = Array.from(new Set(words.map((w) => w.trim()).filter(Boolean)))
  const concurrency = Math.max(1, opts.concurrency ?? 3)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < unique.length) {
      const word = unique[next]!
      next += 1
      await prefetchAudio(word, accent, opts.fetchImpl)
      done += 1
      opts.onProgress?.(done, unique.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker))
}
```

`src/app/version.ts`:
```ts
export const APP_VERSION: string = __APP_VERSION__
```

`src/vite-env.d.ts` 追加：
```ts
declare const __APP_VERSION__: string
```

`vite.config.ts`：顶部加 `import { readFileSync } from 'node:fs'` 与
```ts
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
```
在 `defineConfig({ ... })` 里加 `define: { __APP_VERSION__: JSON.stringify(pkg.version) },`。

- [ ] **Step 4: 运行测试与构建，提交**

Run: `pnpm vitest run src/lib/backupShare.test.ts src/lib/prefetchAll.test.ts && pnpm test && pnpm build`
Expected: 7 个用例通过；全量通过；构建通过

```bash
git add src/lib/backupShare.ts src/lib/backupShare.test.ts src/lib/prefetchAll.ts src/lib/prefetchAll.test.ts src/app/version.ts src/vite-env.d.ts vite.config.ts
git commit -m "feat: backup share/download core, bulk audio prefetch, app version constant"
```

---

### Task 6: 设置页（含备份/恢复）与上线补预热

**Files:**
- Create: `src/screens/Settings.tsx`, `src/app/useOnlinePrefetch.ts`
- Modify: `src/app/App.tsx`（`/settings` → `<Settings />`；Shell 里调用 `useOnlinePrefetch()`）
- Delete: `src/screens/SettingsStub.tsx`
- Test: `src/screens/Settings.test.tsx`

**Interfaces:**
- Consumes: `getSettings/updateSettings`, `exportBackup/markBackedUp/validateBackup/importBackup`, `backupToFile/deliverBackup/browserShareDeps/readBackupFile`, `prefetchHeadwords`, `APP_VERSION`, `DICT_VERSION`, `db.dict.count()`, `isProductionOrigin`
- Produces: 路由组件 `Settings`（可注入 `shareDeps` prop 供测试，默认 `browserShareDeps()`）；`useOnlinePrefetch()`

- [ ] **Step 1: 写失败测试**

`src/screens/Settings.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote, getSettings } from '@/db/repo'
import { backupToFile } from '@/lib/backupShare'
import { exportBackup } from '@/lib/backup'
import { renderWithRouter } from '@/test/render'
import { Settings } from './Settings'

vi.mock('@/lib/prefetchAll', () => ({ prefetchHeadwords: vi.fn(async () => undefined) }))

beforeEach(async () => { await db.delete(); await db.open() })
afterEach(() => vi.restoreAllMocks())

describe('Settings', () => {
  it('changes new-cards-per-day with the stepper, accent and autoplay', async () => {
    renderWithRouter(<Settings />, { route: '/settings', path: '/settings' })
    fireEvent.click(await screen.findByRole('button', { name: '增加每日新卡' }))
    await waitFor(async () => expect((await getSettings(db)).newCardsPerDay).toBe(25))
    fireEvent.click(screen.getByRole('button', { name: '英音' }))
    await waitFor(async () => expect((await getSettings(db)).accent).toBe('uk'))
    fireEvent.click(screen.getByRole('switch', { name: '翻面自动朗读' }))
    await waitFor(async () => expect((await getSettings(db)).autoPlayOnReveal).toBe(false))
  })

  it('backs up via share and only then records lastBackupAt; cancel does not', async () => {
    await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    const share = vi.fn(async () => undefined)
    const deps = { canShareFiles: () => true, share, download: vi.fn() }
    renderWithRouter(<Settings shareDeps={deps} />, { route: '/settings', path: '/settings' })
    fireEvent.click(await screen.findByRole('button', { name: /备份到文件/ }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    await waitFor(async () => expect((await getSettings(db)).lastBackupAt).toBeTypeOf('number'))
    expect(await screen.findByText('已备份')).toBeTruthy()

    await db.settings.update('settings', { lastBackupAt: undefined })
    share.mockRejectedValueOnce(Object.assign(new Error('cancel'), { name: 'AbortError' }))
    fireEvent.click(screen.getByRole('button', { name: /备份到文件/ }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2))
    expect((await getSettings(db)).lastBackupAt).toBeUndefined()
  })

  it('restores from a valid file after confirmation and rejects invalid files', async () => {
    await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    const file = backupToFile(await exportBackup(db))
    await db.delete(); await db.open()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithRouter(<Settings />, { route: '/settings', path: '/settings' })
    const input = (await screen.findByLabelText('从文件恢复')) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(async () => expect(await db.notes.count()).toBe(1))
    expect(await screen.findByText('已恢复 1 条记录')).toBeTruthy()

    fireEvent.change(input, { target: { files: [new File(['{}'], 'x.json', { type: 'application/json' })] } })
    expect(await screen.findByText('不是 Mnemo 的备份文件')).toBeTruthy()
  })

  it('shows about info', async () => {
    renderWithRouter(<Settings />, { route: '/settings', path: '/settings' })
    expect(await screen.findByText('ECDICT (MIT)')).toBeTruthy()
    expect(screen.getByText(/ts-fsrs/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Spike 1/ })).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/screens/Settings.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/app/useOnlinePrefetch.ts`:
```ts
import { useEffect } from 'react'
import { db } from '@/db/db'
import { getSettings } from '@/db/repo'
import { prefetchHeadwords } from '@/lib/prefetchAll'

const WEEK = 7 * 86_400_000

/** 回到在线状态（或启动时在线）补预热最近一周改动过的记录的发音 */
export function useOnlinePrefetch(): void {
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!navigator.onLine) return
      const [settings, notes] = await Promise.all([getSettings(db), db.notes.where('updatedAt').above(Date.now() - WEEK).toArray()])
      if (cancelled || notes.length === 0) return
      await prefetchHeadwords(notes.map((n) => n.headword), settings.accent)
    }
    void run()
    const onOnline = () => void run()
    window.addEventListener('online', onOnline)
    return () => { cancelled = true; window.removeEventListener('online', onOnline) }
  }, [])
}
```

`src/screens/Settings.tsx`:
```tsx
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db } from '@/db/db'
import { getSettings, updateSettings } from '@/db/repo'
import { DEFAULT_SETTINGS, type Accent } from '@/domain/types'
import { DICT_VERSION } from '@/generated/dict-version'
import { exportBackup, importBackup, markBackedUp, validateBackup } from '@/lib/backup'
import { backupToFile, browserShareDeps, deliverBackup, readBackupFile, type ShareDeps } from '@/lib/backupShare'
import { prefetchHeadwords } from '@/lib/prefetchAll'
import { APP_VERSION } from '@/app/version'

const MIN_NEW = 0
const MAX_NEW = 200

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3 text-[15px] last:border-b-0">
      <span>{label}</span>
      <div className="flex items-center gap-2 text-sm text-muted">{children}</div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 px-1 text-[11px] uppercase tracking-wider text-muted">{title}</div>
      <div className="overflow-hidden rounded-(--radius-card) bg-panel">{children}</div>
    </section>
  )
}

function daysAgo(ts: number | undefined, now = Date.now()): string {
  if (ts === undefined) return '从未'
  const d = Math.floor((now - ts) / 86_400_000)
  return d === 0 ? '今天' : d === 1 ? '昨天' : `${d} 天前`
}

export function Settings({ shareDeps }: { shareDeps?: ShareDeps }) {
  const settings = useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS)
  const dictCount = useLiveQuery(() => db.dict.count(), [], 0)
  const [msg, setMsg] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [prefetching, setPrefetching] = useState<string | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)

  const setNew = (n: number) => void updateSettings(db, { newCardsPerDay: Math.min(MAX_NEW, Math.max(MIN_NEW, n)) })

  async function setAccent(accent: Accent) {
    if (accent === settings.accent) return
    await updateSettings(db, { accent })
    const words = (await db.notes.toArray()).map((n) => n.headword)
    if (words.length === 0) return
    setPrefetching(`正在重新缓存发音 0 / ${words.length}`)
    await prefetchHeadwords(words, accent, { onProgress: (d, t) => setPrefetching(`正在重新缓存发音 ${d} / ${t}`) })
    setPrefetching(undefined)
  }

  async function backup() {
    if (busy) return
    setBusy(true)
    setMsg(undefined)
    try {
      const file = backupToFile(await exportBackup(db))
      const outcome = await deliverBackup(file, shareDeps ?? browserShareDeps())
      if (outcome === 'cancelled') { setMsg('已取消'); return }
      await markBackedUp(db)
      setMsg('已备份')
    } catch {
      setMsg('备份失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return
    setMsg(undefined)
    try {
      const data = await readBackupFile(file)
      if (!validateBackup(data)) { setMsg('不是 Mnemo 的备份文件'); return }
      if (!window.confirm(`将用备份（${data.notes.length} 条记录，${new Date(data.exportedAt).toLocaleString()}）覆盖当前全部数据，确定吗？`)) return
      await importBackup(db, data)
      setMsg(`已恢复 ${data.notes.length} 条记录`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '恢复失败')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pb-28" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <h1 className="text-[30px] font-bold leading-tight tracking-tight">设置</h1>

      <Group title="学习">
        <Row label="每日新卡上限">
          <button type="button" aria-label="减少每日新卡" className="h-8 w-8 rounded-full bg-bg text-ink" onClick={() => setNew(settings.newCardsPerDay - 5)}>−</button>
          <span className="w-8 text-center text-ink">{settings.newCardsPerDay}</span>
          <button type="button" aria-label="增加每日新卡" className="h-8 w-8 rounded-full bg-bg text-ink" onClick={() => setNew(settings.newCardsPerDay + 5)}>+</button>
        </Row>
      </Group>

      <Group title="发音">
        <Row label="口音">
          <div className="flex rounded-lg bg-bg p-0.5 text-xs">
            {(['us', 'uk'] as const).map((a) => (
              <button key={a} type="button" aria-pressed={settings.accent === a} className={`rounded-md px-3 py-1 ${settings.accent === a ? 'bg-panel font-semibold text-ink shadow-sm' : ''}`} onClick={() => void setAccent(a)}>
                {a === 'us' ? '美音' : '英音'}
              </button>
            ))}
          </div>
        </Row>
        <Row label="翻面自动朗读">
          <button
            type="button"
            role="switch"
            aria-label="翻面自动朗读"
            aria-checked={settings.autoPlayOnReveal}
            className={`relative h-6 w-10 rounded-full transition-colors ${settings.autoPlayOnReveal ? 'bg-good-fg' : 'bg-line'}`}
            onClick={() => void updateSettings(db, { autoPlayOnReveal: !settings.autoPlayOnReveal })}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${settings.autoPlayOnReveal ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </Row>
        {prefetching && <div className="px-4 py-2 text-xs text-muted">{prefetching}</div>}
      </Group>

      <Group title="数据">
        <button type="button" className="flex w-full items-center justify-between border-b border-line px-4 py-3 text-[15px]" disabled={busy} onClick={() => void backup()}>
          <span>备份到文件</span>
          <span className="text-sm text-muted">{daysAgo(settings.lastBackupAt)} ›</span>
        </button>
        <label className="flex w-full items-center justify-between px-4 py-3 text-[15px]">
          <span>从文件恢复</span>
          <span className="text-sm text-muted">›</span>
          <input ref={fileRef} aria-label="从文件恢复" type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void restore(e.target.files?.[0])} />
        </label>
        {msg && <div className="px-4 py-2 text-xs text-muted" role="status">{msg}</div>}
        <p className="px-4 pb-3 text-xs text-muted">备份会打开系统分享面板，选「存储到文件」放进 iCloud Drive。恢复会覆盖当前全部数据。</p>
      </Group>

      <Group title="关于">
        <Row label="版本"><span>{APP_VERSION}</span></Row>
        <Row label="词典"><span>ECDICT (MIT)</span><span>· {dictCount} 条 · {DICT_VERSION}</span></Row>
        <Row label="算法"><span>ts-fsrs 5.4</span></Row>
        <Row label="数据地址"><span className="text-xs">{typeof location === 'undefined' ? '' : location.origin}</span></Row>
      </Group>

      <Group title="诊断">
        <Link to="/spike/audio" className="flex items-center justify-between border-b border-line px-4 py-3 text-[15px]"><span>Spike 1 · 有道音频离线缓存</span><span className="text-line">›</span></Link>
        <Link to="/spike/tts" className="flex items-center justify-between px-4 py-3 text-[15px]"><span>Spike 2 · 系统 TTS</span><span className="text-line">›</span></Link>
      </Group>
    </div>
  )
}
```
（文件顶部加 `import type React from 'react'` 或把 `React.ReactNode` 改为 `import type { ReactNode } from 'react'` 后使用 `ReactNode`，二选一，保持 tsc 通过。）

`src/app/App.tsx`：`import { Settings } from '@/screens/Settings'`、`import { useOnlinePrefetch } from './useOnlinePrefetch'`；`/settings` 换成 `<Settings />`；`Shell` 内调用 `useOnlinePrefetch()`；删除 `SettingsStub` 的导入。然后 `git rm src/screens/SettingsStub.tsx`。

- [ ] **Step 4: 运行测试与构建，提交**

Run: `pnpm vitest run src/screens/Settings.test.tsx && pnpm test && pnpm build`
Expected: 4 个用例通过；全量通过；构建通过（`SettingsStub` 已无引用）

```bash
git add src/screens/Settings.tsx src/screens/Settings.test.tsx src/app/useOnlinePrefetch.ts src/app/App.tsx
git rm -q src/screens/SettingsStub.tsx
git commit -m "feat(settings): learning, audio, backup/restore and about; prefetch audio on accent change and when online"
```

---

### Task 7: 打磨与 Plan 2 遗留项

**Files:**
- Modify: `src/lib/session.ts`, `src/lib/session.test.ts`, `src/screens/Review.tsx`, `src/screens/Review.test.tsx`, `src/screens/NoteEditor.tsx`, `src/screens/NoteEditor.test.tsx`, `src/components/review/CardFront.tsx`, `src/components/ClozeEditor.tsx`, `src/lib/audio.ts`

**Interfaces:**
- `afterUndo(state, { wasNew, queue, restoredId? })` — 若 `restoredId` 在队列中，把它放到队首
- `NoteEditor`：未找到记录时渲染 `记录不存在` + `返回`；保存/删除失败时在底部显示 `操作失败：<message>`；标签建议 chips（`allTags`，最多 8 个，排除已输入的）；所有前提不满足的卡型都显示原因行；例句删除按钮 `aria-label="删除例句 N"`
- `Review`：`useVisibilityTick` 触发时若未翻面则重查队列；`gradeCard`/`undoLastReview` 抛错 → toast `操作失败，请重试`；初始加载失败 → `加载失败` + `重试`

- [ ] **Step 1: 写失败测试**

`src/lib/session.test.ts` 追加（放在 `describe('session')` 内）:
```ts
  it('afterUndo moves the restored card to the front when present', () => {
    const [a, b, c] = many(3) as [Card, Card, Card]
    const s0 = afterGrade(withQueue(initialSession(NOW), [a, b, c]), { wasNew: false, queue: [b, c] })
    const s1 = afterUndo(s0, { wasNew: false, queue: [b, c, a], restoredId: a.id })
    expect(s1.queue.map((x) => x.id)).toEqual([a.id, b.id, c.id])
    expect(afterUndo(s0, { wasNew: false, queue: [b, c], restoredId: 'missing' }).queue.map((x) => x.id)).toEqual([b.id, c.id])
  })
```

`src/screens/Review.test.tsx` 追加:
```tsx
import * as repo from '@/db/repo'

describe('Review errors', () => {
  it('shows a toast when grading fails and keeps the card', async () => {
    await createNote(db, { headword: 'concern', meaning: 'n. 担忧', examples: [], tags: [], enabledTypes: ['en2zh'] })
    vi.spyOn(repo, 'gradeCard').mockRejectedValueOnce(new Error('boom'))
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    fireEvent.click(await screen.findByRole('button', { name: '看答案' }))
    fireEvent.click(await screen.findByRole('button', { name: /简单/ }))
    expect(await screen.findByText('操作失败，请重试')).toBeTruthy()
    expect(screen.getByRole('button', { name: /简单/ })).toBeTruthy()
    expect(await db.reviewLogs.count()).toBe(0)
  })
})
```

`src/screens/NoteEditor.test.tsx` 追加:
```tsx
describe('NoteEditor (polish)', () => {
  it('shows a not-found state for an unknown id', async () => {
    renderWithRouter(<NoteEditor />, { route: '/note/nope', path: '/note/:id' })
    expect(await screen.findByText('记录不存在')).toBeTruthy()
    expect(screen.queryByLabelText('单词 / 短语')).toBeNull()
  })
  it('suggests existing tags and appends on tap', async () => {
    await createNote(db, { headword: 'leverage', meaning: 'x', examples: [], tags: ['biz', 'cet4'], enabledTypes: ['en2zh'] })
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.click(await screen.findByRole('button', { name: '添加标签 biz' }))
    expect((screen.getByLabelText('标签') as HTMLInputElement).value).toBe('biz')
    fireEvent.click(screen.getByRole('button', { name: '添加标签 cet4' }))
    expect((screen.getByLabelText('标签') as HTMLInputElement).value).toBe('biz, cet4')
    expect(screen.queryByRole('button', { name: '添加标签 biz' })).toBeNull()
  })
  it('explains every unavailable card type, selected or not', async () => {
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    await screen.findByLabelText('单词 / 短语')
    expect(screen.getByText(/例句挖空：先给一条例句并挖一个空/)).toBeTruthy()
    expect(screen.getByText(/英 → 中：先填写单词或短语/)).toBeTruthy()
  })
  it('shows an inline error when saving fails', async () => {
    vi.spyOn(repo, 'createNote').mockRejectedValueOnce(new Error('disk full'))
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.change(await screen.findByLabelText('单词 / 短语'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /保存 · 生成/ }))
    expect(await screen.findByText('操作失败：disk full')).toBeTruthy()
  })
})
```
（文件顶部补 `import * as repo from '@/db/repo'`。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/session.test.ts src/screens/Review.test.tsx src/screens/NoteEditor.test.tsx`
Expected: 新用例 FAIL

- [ ] **Step 3: 实现**

`src/lib/session.ts` `afterUndo`:
```ts
export function afterUndo(s: SessionState, { wasNew, queue, restoredId }: { wasNew: boolean; queue: Card[]; restoredId?: string }): SessionState {
  const stats = { ...s.stats, reviewed: Math.max(0, s.stats.reviewed - 1), learned: Math.max(0, s.stats.learned - (wasNew ? 1 : 0)) }
  const restored = restoredId ? queue.find((c) => c.id === restoredId) : undefined
  const ordered = restored ? [restored, ...queue.filter((c) => c.id !== restoredId)] : queue
  return withQueue({ ...s, stats, sinceBreather: Math.max(0, s.sinceBreather - 1), canUndo: false }, ordered)
}
```

`src/screens/Review.tsx`：
- `import { useVisibilityTick } from '@/app/useVisibilityTick'`；`const tick = useVisibilityTick()`；新增 effect：`tick > 0 && session.phase !== 'loading' && !session.revealed` 时 `requery().then(q => setSession(s => withQueue(s, q)))`。
- 初始加载：`.catch(() => setLoadError(true))`；`loading` 分支在 `loadError` 时渲染 `加载失败` + `<Button onClick={retry}>重试</Button>`。
- `onGrade` / `onUndo`：`try { … } catch { setToast('操作失败，请重试') } finally { setBusy(false) }`；撤销时传 `restoredId: restored?.id`。

`src/screens/NoteEditor.tsx`：
- 记录查询改为 `const noteState = useLiveQuery(async () => ({ note: id ? await db.notes.get(id) : undefined }), [id])`；`const note = noteState?.note`；当 `mode === 'edit' && noteState && !noteState.note` 时提前返回：
```tsx
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="text-xl font-semibold">记录不存在</div>
        <Button variant="secondary" className="mt-4" onClick={goBack}>返回</Button>
      </div>
    </div>
```
（注意：早返回必须放在所有 hook 调用之后。）
- `const [error, setError] = useState<string>()`；`save`/`remove` 用 `try { … } catch (e) { setError(`操作失败：${e instanceof Error ? e.message : String(e)}`) }`；在保存按钮下方渲染 `{error && <p className="text-xs text-again-fg">{error}</p>}`。
- 标签建议：`const tags = useLiveQuery(() => allTags(db), [], [])`；在标签字段下渲染：
```tsx
          {tags.filter((t) => !form.tags.split(/[,，\s]+/).includes(t.tag)).slice(0, 8).map((t) => (
            <button key={t.tag} type="button" aria-label={`添加标签 ${t.tag}`} className="mr-1 mt-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted" onClick={() => dispatch({ type: 'tags', value: form.tags.trim() ? `${form.tags.replace(/[,，\s]+$/, '')}, ${t.tag}` : t.tag })}>
              {t.tag}
            </button>
          ))}
```
- 卡型原因行：过滤条件改为 `!availability[t].ok`（不再要求已选中）。
- 例句删除按钮加 `aria-label={`删除例句 ${i + 1}`}`。

`src/components/review/CardFront.tsx` `PlayButton`：`h-11 w-11 text-sm`（44px）。
`src/components/ClozeEditor.tsx`：`<p className="text-base leading-10">`，按钮加 `py-1`。
`src/lib/audio.ts`：删除不再读取的模块级 `cleanup` 变量及其赋值（保留 `abortCurrent`）。

- [ ] **Step 4: 运行测试与构建，提交**

Run: `pnpm test && pnpm build`
Expected: 全量通过（新增 6 个用例），构建通过

```bash
git add src/lib/session.ts src/lib/session.test.ts src/screens src/components src/lib/audio.ts
git commit -m "fix: restored card first after undo, foreground re-query, error states, tag suggestions, visible chip reasons, 44px play button"
```

---

### Task 8: 文档、规范写回与真机验收

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-mnemo-design.md`, `README.md`

- [ ] **Step 1: 规范写回**

在 `docs/superpowers/specs/2026-10-30-mnemo-design.md`：
- §5.5 把 `- 左滑删除草稿。首页显示收集箱待处理数量。` 改为 `- 草稿用行尾「✕」按钮删除（二次确认），不做左滑手势。首页显示收集箱待处理数量。`
- §5.11 卡片行的 `点开编辑，左滑删除` 改为 `点开编辑；删除在编辑页底部`
- §5.4 第 7 条后追加一句：`（实现：标签字段下显示最多 8 个已有标签供点选）`
- §5.7 末尾追加：`口音切换后后台对全部记录重新预热；应用回到在线状态时补预热最近 7 天改动过的记录。`
- §8 验收清单下方新增小节 `### 验收记录`，表格列：日期 / 设备 / 项 / 结果，先填入已由自动化测试覆盖的项（标 "自动化"），真机项留空待作者填写。

- [ ] **Step 2: README**

在 `README.md` 的"开发"之前插入：
```markdown
## 功能

- 建卡：输入单词或短语，自动补音标和中文释义（ECDICT）；粘原句自动挖空，点词可改；一条记录可生成「中→英」「例句挖空」「英→中」三种卡
- 复习：FSRS 排期（ts-fsrs），四档打分带预计间隔，撤销，翻面自动朗读；每 20 张一个歇脚页
- 收集箱：多行粘贴 → 草稿 → 逐条建卡；整句草稿点词选要记的词
- 发音：有道在线 TTS + Service Worker 离线缓存，失败降级系统 TTS
- 备份：导出 JSON 到系统分享面板（存 iCloud Drive），从文件恢复
- 离线：PWA，加到主屏后无网可用

## 已知限制

- 有道发音是非官方接口，随时可能失效（会自动降级系统 TTS）
- 数据只在当前地址的浏览器里；换设备靠备份文件
- 没有多设备同步、牌组、统计
```

- [ ] **Step 3: 提交并推送（合并后由控制器完成）**

```bash
git add docs/superpowers/specs/2026-10-30-mnemo-design.md README.md
git commit -m "docs: write back inbox/list deviations, add features and acceptance log"
```

- [ ] **Step 4: 真机验收（作者，发布后）**

对照规范 §8，本计划新增的项：
- [ ] 收集箱：Mac 复制多行 → iPhone 粘贴 → 草稿状态正确 → 逐条建卡；整句草稿点词选词
- [ ] 卡片列表：搜索、点开编辑、删除
- [ ] 设置：改每日新卡上限后首页数字变化；切换口音后复习发音变化（离线也有，因为已重新预热）；关闭自动朗读生效
- [ ] 备份：分享面板 → 存储到文件 → iCloud Drive；清空数据后（设置里恢复会覆盖）从文件恢复，卡片与排期一致
- [ ] 没备份过时首页出现"还没有备份过"；备份后消失
- [ ] 回到前台后首页数字刷新；深色模式全部页面可读；安全区、输入不缩放

---

## 自检记录（写计划时完成）

**规范覆盖（本计划负责）**

| 规范条目 | 任务 |
|---|---|
| 5.5 收集箱全部行为（粘贴、拆行、状态、点开建卡、句子选词、删除、首页数量） | Task 1, 2, 3（首页数量 Plan 1 已有） |
| 5.4 第 7 条标签建议；第 2 条查重已做 | Task 7 |
| 5.9 分享面板导出、成功后 `lastBackupAt`、文件选择恢复、覆盖确认 | Task 5, 6 |
| 5.11 卡片列表（搜索、行内容、点开编辑）、设置页四组 + 诊断 | Task 4, 6 |
| 5.7 口音切换重新预热（审查建议） | Task 5, 6 |
| 5.6 遗留：撤销后回队首、前台重查、错误提示 | Task 7 |
| Plan 2 暂存：`updateNote` 顺序 | Task 1 |
| 8 验收 | Task 8 |

**类型一致性**：`addDrafts/deleteDraft/searchNotes/allTags/createNote(opts)` 在 Task 1 定义，Task 2/3/4/7 消费；`ShareDeps` 在 Task 5 定义，Task 6 的 `Settings` 以 prop 注入（测试）或 `browserShareDeps()`（默认）；`prefetchHeadwords` 在 Task 5 定义，Task 6 的设置页与 `useOnlinePrefetch` 消费；`afterUndo` 的 `restoredId` 在 Task 7 的 session 与 Review 两处一致；`noteDueSummary` 在 Task 1 定义、Task 4 消费；`NoteFormState.pendingHeadwordPick` 与 `prefillDraft/pickHeadword` 在 Task 3 的 reducer 与编辑器两处一致。
