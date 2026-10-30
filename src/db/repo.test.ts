import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { createScheduler } from '@/lib/scheduler'
import {
  addExtraNewToday, createNote, deleteNote, findDuplicate, getSettings, getTodayCounts, getTodayQueue,
  gradeCard, headwordKey, undoLastReview, updateNote, updateSettings,
} from './repo'

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const NOW = local(2026, 10, 30, 10)
const MIN = 60_000
const sched = createScheduler({ enable_fuzz: false })

const input = {
  headword: 'concern',
  phonetic: '/kənˈsɜːrn/',
  meaning: 'n. 担忧',
  examples: [{ text: 'I have concerns.', source: 'test', blanks: [{ start: 7, end: 15 }] }],
  tags: [],
  enabledTypes: ['zh2en', 'cloze', 'en2zh'] as const,
}

describe('notes and cards', () => {
  it('createNote generates one New card per enabled type', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: [...input.enabledTypes] }, NOW, sched)
    expect(note.headwordKey).toBe('concern')
    const cards = await db.cards.where('noteId').equals(note.id).toArray()
    expect(cards.map((c) => c.type).sort()).toEqual(['cloze', 'en2zh', 'zh2en'])
    expect(cards.every((c) => c.state === 0 && c.due === NOW)).toBe(true)
    expect((await getSettings(db)).lastEnabledTypes).toEqual(['zh2en', 'cloze', 'en2zh'])
  })

  it('createNote silently drops types whose prerequisites fail', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, examples: [], enabledTypes: ['zh2en', 'cloze'] }, NOW, sched)
    expect(note.enabledTypes).toEqual(['zh2en'])
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(1)
  })

  it('updateNote adds and removes cards (and their logs) to match types', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['zh2en', 'en2zh'] }, NOW, sched)
    const zh = (await db.cards.where('noteId').equals(note.id).toArray()).find((c) => c.type === 'zh2en')!
    await gradeCard(db, zh.id, 3, NOW, sched)
    const r = await updateNote(db, note.id, { ...input, enabledTypes: ['cloze', 'en2zh'] }, NOW + MIN, sched)
    expect(r.created).toEqual(['cloze'])
    expect(r.deleted).toEqual(['zh2en'])
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(2)
    expect(await db.reviewLogs.where('cardId').equals(zh.id).count()).toBe(0)
    expect(r.note.updatedAt).toBe(NOW + MIN)
  })

  it('deleteNote cascades to cards and logs', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    const [c] = await db.cards.where('noteId').equals(note.id).toArray()
    await gradeCard(db, c!.id, 3, NOW, sched)
    await deleteNote(db, note.id)
    expect(await db.notes.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
  })

  it('findDuplicate ignores case and surrounding whitespace', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    expect((await findDuplicate(db, '  Concern '))?.id).toBe(note.id)
    expect(await findDuplicate(db, 'Concern', note.id)).toBeUndefined()
    expect(headwordKey('  Foo Bar ')).toBe('foo bar')
  })
})

describe('grading, burying, undo', () => {
  it('grading buries siblings until next 04:00 and records their ids on the log', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: [...input.enabledTypes] }, NOW, sched)
    const cards = await db.cards.where('noteId').equals(note.id).toArray()
    const target = cards.find((c) => c.type === 'zh2en')!
    const { card, log } = await gradeCard(db, target.id, 3, NOW, sched)
    expect(card.state).toBe(1)
    expect(log.buriedSiblingIds.sort()).toEqual(cards.filter((c) => c.id !== target.id).map((c) => c.id).sort())
    const siblings = await db.cards.where('noteId').equals(note.id).filter((c) => c.id !== target.id).toArray()
    expect(siblings.every((c) => c.buriedUntil === local(2026, 10, 31, 4))).toBe(true)
  })

  it('today queue shows only one card per note, then the graded learning card when due', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: [...input.enabledTypes] }, NOW, sched)
    expect(await getTodayQueue(db, NOW)).toHaveLength(3)
    const [first] = await getTodayQueue(db, NOW)
    await gradeCard(db, first!.id, 3, NOW, sched)
    const q = await getTodayQueue(db, NOW)
    expect(q.map((c) => c.noteId)).toEqual([note.id]) // 学习中的那张在 20 分钟内，被提前拉出
    expect(q[0]!.id).toBe(first!.id)
    expect(await getTodayQueue(db, NOW + 10 * MIN)).toHaveLength(1)
  })

  it('undoLastReview restores the card, unburies siblings, and deletes the log', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: [...input.enabledTypes] }, NOW, sched)
    const [first] = await getTodayQueue(db, NOW)
    await gradeCard(db, first!.id, 4, NOW, sched)
    const restored = await undoLastReview(db, sched)
    expect(restored?.id).toBe(first!.id)
    expect(restored?.state).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
    const all = await db.cards.where('noteId').equals(note.id).toArray()
    expect(all.every((c) => c.buriedUntil === undefined)).toBe(true)
    expect(await undoLastReview(db, sched)).toBeUndefined()
  })
})

describe('settings and counts', () => {
  it('getSettings returns defaults and updateSettings merges', async () => {
    const db = createTestDb()
    expect((await getSettings(db)).newCardsPerDay).toBe(20)
    await updateSettings(db, { newCardsPerDay: 5, accent: 'uk' })
    expect(await getSettings(db)).toMatchObject({ newCardsPerDay: 5, accent: 'uk', autoPlayOnReveal: true })
  })

  it('getTodayCounts applies the new-card limit and extra allowance for today only', async () => {
    const db = createTestDb()
    await updateSettings(db, { newCardsPerDay: 1 })
    await createNote(db, { ...input, headword: 'a', enabledTypes: ['en2zh'] }, NOW, sched)
    await createNote(db, { ...input, headword: 'b', enabledTypes: ['en2zh'] }, NOW, sched)
    expect(await getTodayCounts(db, NOW)).toEqual({ due: 0, fresh: 1 })
    await addExtraNewToday(db, 10, NOW)
    expect(await getTodayCounts(db, NOW)).toEqual({ due: 0, fresh: 2 })
    expect(await getTodayCounts(db, local(2026, 10, 31, 9))).toEqual({ due: 0, fresh: 1 })
  })
})
