import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { nextLearningDayStart } from '@/lib/day'
import { createScheduler } from '@/lib/scheduler'
import {
  addDrafts, addExtraNewToday, allTags, createNote, deleteNote, deleteDraft, findDuplicate, getSettings, getTodayCounts, getTodayQueue, getTodayReviewStats,
  gradeCard, headwordKey, planNoteUpdate, searchNotes, undoLastReview, updateNote, updateSettings,
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
    const r = await updateNote(db, note.id, { ...input, enabledTypes: ['cloze', 'en2zh'] }, NOW + MIN, sched, ['zh2en'])
    expect(r.created).toEqual(['cloze'])
    expect(r.deleted).toEqual(['zh2en'])
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(2)
    expect(await db.reviewLogs.where('cardId').equals(zh.id).count()).toBe(0)
    expect(r.note.updatedAt).toBe(NOW + MIN)
  })

  it('updateNote buries cards it adds when the note was already shown today', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    const [en] = await getTodayQueue(db, NOW)
    await gradeCard(db, en!.id, 4, NOW, sched)
    expect(await getTodayQueue(db, NOW + MIN)).toHaveLength(0)

    const r = await updateNote(db, note.id, { ...input, enabledTypes: ['zh2en', 'en2zh'] }, NOW + MIN, sched)
    expect(r.created).toEqual(['zh2en'])
    const zh = (await db.cards.where('noteId').equals(note.id).toArray()).find((c) => c.type === 'zh2en')!
    expect(zh.buriedUntil).toBe(nextLearningDayStart(NOW))
    expect(await getTodayQueue(db, NOW + 2 * MIN)).toHaveLength(0)
    const tomorrow = await getTodayQueue(db, local(2026, 10, 31, 9))
    expect(tomorrow.map((c) => c.id)).toEqual([zh.id])
  })

  it('updateNote refuses to delete card types without confirmation and writes nothing', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['zh2en', 'en2zh'] }, NOW, sched)
    const zh = (await db.cards.where('noteId').equals(note.id).toArray()).find((c) => c.type === 'zh2en')!
    await gradeCard(db, zh.id, 3, NOW, sched)
    const cardsBefore = await db.cards.where('noteId').equals(note.id).toArray()

    await expect(updateNote(db, note.id, { ...input, meaning: '改过', enabledTypes: ['cloze', 'en2zh'] }, NOW + MIN, sched))
      .rejects.toThrow('需要确认删除卡型：zh2en')
    expect(await db.cards.where('noteId').equals(note.id).toArray()).toEqual(cardsBefore)
    expect(await db.reviewLogs.where('cardId').equals(zh.id).count()).toBe(1)
    expect((await db.notes.get(note.id))?.meaning).toBe(input.meaning)
  })

  it('planNoteUpdate reports the card types that would be created and deleted', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['zh2en', 'cloze'] }, NOW, sched)
    // 例句被清空 → cloze 不再可用；新增 en2zh
    expect(await planNoteUpdate(db, note.id, { ...input, examples: [], enabledTypes: ['zh2en', 'cloze', 'en2zh'] }))
      .toEqual({ toCreate: ['en2zh'], toDelete: ['cloze'] })
    expect(await planNoteUpdate(db, note.id, { ...input, enabledTypes: ['zh2en', 'cloze'] }))
      .toEqual({ toCreate: [], toDelete: [] })
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(2)
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
    expect(await getTodayQueue(db, NOW)).toHaveLength(1)
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

  it('getTodayReviewStats counts today\'s logs and first-time grades only', async () => {
    const db = createTestDb()
    const a = await createNote(db, { ...input, headword: 'a', enabledTypes: ['en2zh'] }, NOW - MIN, sched)
    const b = await createNote(db, { ...input, headword: 'b', enabledTypes: ['en2zh'] }, NOW - MIN, sched)
    const [ca] = await db.cards.where('noteId').equals(a.id).toArray()
    const [cb] = await db.cards.where('noteId').equals(b.id).toArray()
    await gradeCard(db, ca!.id, 3, local(2026, 10, 29, 23), sched) // 昨天的学习日
    await gradeCard(db, ca!.id, 3, NOW, sched)                      // 今天，但不是新卡
    await gradeCard(db, cb!.id, 3, NOW, sched)                      // 今天的新卡
    expect(await getTodayReviewStats(db, NOW)).toEqual({ reviewed: 2, learned: 1 })
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
