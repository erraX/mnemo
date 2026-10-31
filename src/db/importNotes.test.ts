import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { createScheduler } from '@/lib/scheduler'
import {
  addDrafts, createNote, getSettings, getTodayCounts, gradeCard, importNotes, previewNoteImport, updateSettings, type NoteInput,
} from './repo'

const NOW = new Date(2026, 9, 31, 12).getTime()
const sched = createScheduler({ enable_fuzz: false })
const input = (headword: string): NoteInput => ({
  headword, meaning: '释义', phonetic: 'ipa',
  examples: [{ text: `A ${headword}.`, blanks: [{ start: 2, end: 2 + headword.length }] }],
  tags: [], enabledTypes: ['zh2en', 'cloze', 'en2zh'],
})

describe('vocabulary import', () => {
  it('previews without writing; appends only unique words and preserves existing data and settings', async () => {
    const db = createTestDb()
    const old = await createNote(db, input('Concern'), NOW - 1000, sched)
    const [card] = await db.cards.where('noteId').equals(old.id).toArray()
    await gradeCard(db, card!.id, 4, NOW - 500, sched)
    await addDrafts(db, [{ raw: 'a draft', kind: 'headword' }], NOW)
    await updateSettings(db, { lastEnabledTypes: ['en2zh'], accent: 'uk', lastBackupAt: NOW - 100 })
    const snapshot = {
      note: await db.notes.get(old.id), cards: await db.cards.toArray(),
      logs: await db.reviewLogs.toArray(), settings: await getSettings(db), drafts: await db.drafts.toArray(),
    }
    const rows = [input('  concern '), input('frontier'), input('FRONTIER'), input('guardrails')]
    const preview = await previewNoteImport(db, rows)
    expect(preview.entries.map((n) => n.headword)).toEqual(['frontier', 'guardrails'])
    expect(preview).toMatchObject({ skipped: 2, cardCount: 6 })
    expect(await db.notes.count()).toBe(1)

    const result = await importNotes(db, rows, NOW, sched)
    expect(result.notes.map((n) => n.headword)).toEqual(['frontier', 'guardrails'])
    expect(result).toMatchObject({ skipped: 2, cardCount: 6 })
    const freshCards = await db.cards.where('noteId').anyOf(result.notes.map((n) => n.id)).toArray()
    expect(freshCards).toHaveLength(6)
    expect(freshCards.every((c) => c.state === 0 && c.due === NOW && c.reps === 0)).toBe(true)
    expect(await db.notes.get(old.id)).toEqual(snapshot.note)
    expect(await db.cards.where('noteId').equals(old.id).toArray()).toEqual(snapshot.cards)
    expect(await db.reviewLogs.toArray()).toEqual(snapshot.logs)
    expect(await getSettings(db)).toEqual(snapshot.settings)
    expect(await db.drafts.toArray()).toEqual(snapshot.drafts)
    expect(await importNotes(db, rows, NOW, sched)).toEqual({ notes: [], skipped: 4, cardCount: 0 })
  })

  it('rechecks duplicates added after preview and serializes concurrent imports', async () => {
    const db = createTestDb()
    const rows = [input('hello'), input('world')]
    expect((await previewNoteImport(db, rows)).entries).toHaveLength(2)
    await createNote(db, input('HELLO'), NOW, sched)
    const results = await Promise.all([importNotes(db, rows, NOW, sched), importNotes(db, rows, NOW, sched)])
    expect(results.map((r) => r.notes.length).sort()).toEqual([0, 1])
    expect(await db.notes.count()).toBe(2)
    expect(await db.cards.count()).toBe(6)
  })

  it('rolls back all writes if card creation fails and leaves old rows intact', async () => {
    const db = createTestDb()
    await createNote(db, input('old'), NOW, sched)
    const oldNotes = await db.notes.toArray()
    const oldCards = await db.cards.toArray()
    let calls = 0
    const broken = {
      ...sched,
      newCard: (...args: Parameters<typeof sched.newCard>) => {
        if (++calls === 4) throw new Error('disk failure')
        return sched.newCard(...args)
      },
    }
    await expect(importNotes(db, [input('one'), input('two')], NOW, broken)).rejects.toThrow('disk failure')
    expect(await db.notes.toArray()).toEqual(oldNotes)
    expect(await db.cards.toArray()).toEqual(oldCards)
  })

  it('respects the daily limit and does not merge inflected words', async () => {
    const db = createTestDb()
    await updateSettings(db, { newCardsPerDay: 1 })
    const rows = [input('guardrail'), input('guardrails'), input('  Hello  ')]
    const result = await importNotes(db, rows, NOW, sched)
    expect(result.notes.map((n) => n.headwordKey)).toEqual(['guardrail', 'guardrails', 'hello'])
    expect(result.notes[2]?.headword).toBe('Hello')
    expect(await getTodayCounts(db, NOW)).toEqual({ due: 0, fresh: 1 })
  })

  it('rejects invalid direct repository input without writing a partial batch', async () => {
    const db = createTestDb()
    await expect(importNotes(db, [input('good'), input('')], NOW, sched)).rejects.toThrow('词头和释义不能为空')
    expect(await db.notes.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
  })
})
