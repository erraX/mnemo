import { describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/test/db'
import { createNote, getSettings, gradeCard, importNotes, searchNotes, updateNote } from './repo'
import { applyBulkNotes, planBulkNotes, STALE_BULK_PLAN, type TypeChanges } from './bulkNotes'
import { createScheduler } from '@/lib/scheduler'
import { nextLearningDayStart } from '@/lib/day'
import { exportBackup, validateBackup } from '@/lib/backup'

const NOW = new Date(2026, 9, 31, 10).getTime()
const sched = createScheduler({ enable_fuzz: false })
const keep: TypeChanges = { zh2en: 'keep', cloze: 'keep', en2zh: 'keep' }
const input = {
  headword: 'concern', meaning: '担忧', phonetic: '/test/', tags: ['test'],
  examples: [{ text: 'I have concerns.', blanks: [{ start: 7, end: 15 }] }],
  enabledTypes: ['zh2en', 'cloze', 'en2zh'] as ('zh2en' | 'cloze' | 'en2zh')[],
}

describe('bulk notes', () => {
  it('previews without writing, then removes only cloze and its history, preserving other progress and content', async () => {
    const db = createTestDb()
    const note = await createNote(db, input, NOW, sched)
    const other = await createNote(db, { ...input, headword: 'other' }, NOW, sched)
    const cards = await db.cards.where('noteId').equals(note.id).toArray()
    await gradeCard(db, cards.find((card) => card.type === 'cloze')!.id, 3, NOW, sched)
    await gradeCard(db, cards.find((card) => card.type === 'zh2en')!.id, 4, NOW, sched)
    const before = await exportBackup(db, NOW)
    const plan = await planBulkNotes(db, [note.id], { kind: 'types', changes: { ...keep, cloze: 'disable' } })
    expect(plan.summary).toEqual({ notes: 1, createdCards: 0, deletedCards: 1, deletedLogs: 1, skippedCards: 0 })
    expect(await exportBackup(db, NOW)).toEqual(before)
    expect(await applyBulkNotes(db, plan, NOW + 1000, sched)).toEqual(plan.summary)
    expect(await db.notes.get(note.id)).toEqual({ ...note, enabledTypes: ['zh2en', 'en2zh'], updatedAt: NOW + 1000 })
    expect(await db.cards.where('noteId').equals(note.id).toArray()).toEqual(before.cards.filter((card) => card.noteId === note.id && card.type !== 'cloze'))
    expect(await db.reviewLogs.count()).toBe(1)
    expect(await db.notes.get(other.id)).toEqual(other)
    expect(await getSettings(db)).toEqual(before.settings)
  })

  it('enables missing cards, skips unavailable cloze, and leaves existing cards untouched', async () => {
    const db = createTestDb()
    const a = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    const b = await createNote(db, { ...input, headword: 'no example', examples: [], enabledTypes: ['en2zh'] }, NOW, sched)
    const before = await db.cards.toArray()
    await gradeCard(db, before.find((card) => card.noteId === a.id)!.id, 3, NOW, sched)
    const existing = await db.cards.toArray()
    const plan = await planBulkNotes(db, [a.id, b.id], { kind: 'types', changes: { ...keep, cloze: 'enable', en2zh: 'enable' } })
    expect(plan.summary).toMatchObject({ createdCards: 1, deletedCards: 0, skippedCards: 1 })
    await applyBulkNotes(db, plan, NOW + 1000, sched)
    expect(await db.cards.bulkGet(existing.map((card) => card.id))).toEqual(existing)
    const cloze = await db.cards.filter((card) => card.type === 'cloze').first()
    expect(cloze).toMatchObject({ noteId: a.id, state: 0, buriedUntil: nextLearningDayStart(NOW) })
    expect((await db.notes.get(b.id))?.enabledTypes).toEqual(['en2zh'])
  })

  it('still buries replacements when deleting the only card and its review log', async () => {
    const db = createTestDb()
    const a = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    const card = (await db.cards.toArray())[0]!
    await gradeCard(db, card.id, 3, NOW, sched)
    const plan = await planBulkNotes(db, [a.id], { kind: 'types', changes: { ...keep, en2zh: 'disable', zh2en: 'enable' } })
    await applyBulkNotes(db, plan, NOW + 1000, sched)
    expect(await db.cards.toArray()).toEqual([expect.objectContaining({ type: 'zh2en', buriedUntil: nextLearningDayStart(NOW) })])
    expect(await db.reviewLogs.count()).toBe(0)
  })

  it('allows all types off while keeping notes and valid backups; re-enabling makes fresh cards', async () => {
    const db = createTestDb()
    const note = await createNote(db, input, NOW, sched)
    await applyBulkNotes(db, await planBulkNotes(db, [note.id], {
      kind: 'types', changes: { zh2en: 'disable', cloze: 'disable', en2zh: 'disable' },
    }), NOW, sched)
    expect((await db.notes.get(note.id))?.enabledTypes).toEqual([])
    expect(await db.cards.count()).toBe(0)
    expect(validateBackup(await exportBackup(db, NOW))).toBe(true)
    await applyBulkNotes(db, await planBulkNotes(db, [note.id], { kind: 'types', changes: { ...keep, en2zh: 'enable' } }), NOW, sched)
    expect(await db.cards.toArray()).toEqual([expect.objectContaining({ type: 'en2zh', state: 0 })])
  })

  it('deletes selected notes with cards/logs, not other notes, drafts, dictionary or settings; duplicate and missing IDs are safe', async () => {
    const db = createTestDb()
    const a = await createNote(db, input, NOW, sched)
    const b = await createNote(db, { ...input, headword: 'other' }, NOW, sched)
    for (const note of [a, b]) {
      const card = await db.cards.where('noteId').equals(note.id).first()
      await gradeCard(db, card!.id, 3, NOW, sched)
    }
    await db.drafts.add({ id: 'draft', raw: 'draft', kind: 'headword', createdAt: NOW })
    await db.dict.add({ word: 'word', phonetic: '', translation: '词', forms: [] })
    const before = await exportBackup(db, NOW)
    const plan = await planBulkNotes(db, [a.id, a.id, 'missing'], { kind: 'delete' })
    expect(plan.summary).toMatchObject({ notes: 1, deletedCards: 3, deletedLogs: 1 })
    await applyBulkNotes(db, plan, NOW, sched)
    expect(await db.notes.toArray()).toEqual([b])
    expect(await db.cards.toArray()).toEqual(before.cards.filter((card) => card.noteId === b.id))
    expect(await db.reviewLogs.toArray()).toEqual(before.reviewLogs.filter((log) => log.noteId === b.id))
    expect(await db.drafts.toArray()).toEqual(before.drafts)
    expect(await db.dict.count()).toBe(1)
    expect(await getSettings(db)).toEqual(before.settings)
  })

  it.each(['content', 'review', 'new card', 'deleted note'] as const)('rejects stale preview after %s changes', async (change) => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    const plan = await planBulkNotes(db, [note.id], { kind: 'delete' })
    if (change === 'content') await db.notes.update(note.id, { meaning: 'changed' }) // 同毫秒也能检测
    if (change === 'review') await gradeCard(db, (await db.cards.toArray())[0]!.id, 3, NOW, sched)
    if (change === 'new card') await updateNote(db, note.id, input, NOW, sched)
    if (change === 'deleted note') await db.notes.delete(note.id)
    const before = await exportBackup(db, NOW)
    await expect(applyBulkNotes(db, plan, NOW, sched)).rejects.toThrow(STALE_BULK_PLAN)
    expect(await exportBackup(db, NOW)).toEqual(before)
  })

  it('rolls back every write if card creation fails after card/log deletion', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    await gradeCard(db, (await db.cards.toArray())[0]!.id, 3, NOW, sched)
    const before = await exportBackup(db, NOW)
    const plan = await planBulkNotes(db, [note.id], { kind: 'types', changes: { ...keep, en2zh: 'disable', zh2en: 'enable' } })
    const failure = vi.spyOn(db.cards, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'))
    await expect(applyBulkNotes(db, plan, NOW, sched)).rejects.toThrow('disk full')
    failure.mockRestore()
    expect(await exportBackup(db, NOW)).toEqual(before)
  })

  it('does not expand the confirmed selection when new notes arrive', async () => {
    const db = createTestDb()
    const note = await createNote(db, input, NOW, sched)
    const plan = await planBulkNotes(db, [note.id], { kind: 'delete' })
    const later = await createNote(db, { ...input, headword: 'later' }, NOW, sched)
    await applyBulkNotes(db, plan, NOW, sched)
    expect(await db.notes.toArray()).toEqual([later])
    expect(await db.cards.count()).toBe(3)
  })

  it('serializes concurrent confirmations so cards cannot be created twice', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    const plan = await planBulkNotes(db, [note.id], { kind: 'types', changes: { ...keep, cloze: 'enable' } })
    const outcomes = await Promise.allSettled([applyBulkNotes(db, plan, NOW, sched), applyBulkNotes(db, plan, NOW, sched)])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: new Error(STALE_BULK_PLAN) }),
    ])
    expect(await db.cards.count()).toBe(2)
  })

  it('rolls back card and history deletion if deleting notes fails', async () => {
    const db = createTestDb()
    const note = await createNote(db, input, NOW, sched)
    await gradeCard(db, (await db.cards.toArray())[0]!.id, 3, NOW, sched)
    const before = await exportBackup(db, NOW)
    const plan = await planBulkNotes(db, [note.id], { kind: 'delete' })
    const failure = vi.spyOn(db.notes, 'bulkDelete').mockRejectedValueOnce(new Error('delete failed'))
    await expect(applyBulkNotes(db, plan, NOW, sched)).rejects.toThrow('delete failed')
    failure.mockRestore()
    expect(await exportBackup(db, NOW)).toEqual(before)
  })

  it('supports empty and unchanged selections without modifying records', async () => {
    const db = createTestDb()
    const note = await createNote(db, input, NOW, sched)
    const before = await exportBackup(db, NOW)
    for (const ids of [[], [note.id]]) {
      const plan = await planBulkNotes(db, ids, { kind: 'types', changes: keep })
      expect(plan.summary).toMatchObject({ createdCards: 0, deletedCards: 0, deletedLogs: 0 })
      await applyBulkNotes(db, plan, NOW + 1000, sched)
    }
    expect(await exportBackup(db, NOW)).toEqual(before)
  })

  it('deletes more than 300 matching notes using an unlimited search, leaving nonmatches intact', async () => {
    const db = createTestDb()
    await importNotes(db, Array.from({ length: 305 }, (_, i) => ({ ...input, headword: `batch-${i}` })), NOW, sched)
    const other = await createNote(db, { ...input, headword: 'other', examples: [] }, NOW, sched)
    expect(await searchNotes(db, 'batch')).toHaveLength(300)
    const ids = (await searchNotes(db, 'batch', Infinity)).map((note) => note.id)
    expect(ids).toHaveLength(305)
    const plan = await planBulkNotes(db, ids, { kind: 'delete' })
    expect(plan.summary).toMatchObject({ notes: 305, deletedCards: 915 })
    await applyBulkNotes(db, plan, NOW, sched)
    expect(await db.notes.toArray()).toEqual([other])
  })
})
