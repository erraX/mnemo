import type { MnemoDB } from './db'
import { DEFAULT_SETTINGS, type Card, type CardType, type Draft, type Example, type Note, type Rating, type ReviewLog, type Settings } from '@/domain/types'
import type { DraftKind } from '@/lib/inbox'
import { diffTypes, filterEnabled } from '@/lib/cardTypes'
import { learningDayStart, nextLearningDayStart } from '@/lib/day'
import { buildQueueParts, countNewIntroduced, type QueueParts } from '@/lib/queue'
import { scheduler as defaultScheduler, type Scheduler } from '@/lib/scheduler'

export interface NoteInput {
  headword: string
  phonetic?: string
  meaning: string
  examples: Example[]
  tags: string[]
  enabledTypes: CardType[]
}

export function headwordKey(s: string): string {
  return s.trim().toLowerCase()
}

function normalizeInput(input: NoteInput): NoteInput {
  return {
    ...input,
    headword: input.headword.trim(),
    phonetic: input.phonetic?.trim() || undefined,
    meaning: input.meaning.trim(),
    examples: input.examples.filter((e) => e.text.trim().length > 0),
    tags: Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean))),
    enabledTypes: filterEnabled(input, input.enabledTypes),
  }
}

export async function createNote(
  db: MnemoDB, raw: NoteInput, now = Date.now(), sched: Scheduler = defaultScheduler, opts: { draftId?: string } = {},
): Promise<Note> {
  const input = normalizeInput(raw)
  const note: Note = {
    id: crypto.randomUUID(),
    headword: input.headword,
    headwordKey: headwordKey(input.headword),
    phonetic: input.phonetic,
    meaning: input.meaning,
    examples: input.examples,
    tags: input.tags,
    enabledTypes: input.enabledTypes,
    createdAt: now,
    updatedAt: now,
  }
  await db.transaction('rw', db.notes, db.cards, db.settings, db.drafts, async () => {
    await db.notes.add(note)
    await db.cards.bulkAdd(input.enabledTypes.map((t) => sched.newCard(note.id, t, now)))
    await updateSettings(db, { lastEnabledTypes: raw.enabledTypes })
    if (opts.draftId) await db.drafts.delete(opts.draftId)
  })
  return note
}

/** 只读：保存前预览哪些卡型会新建 / 删除，供编辑器弹出二次确认 */
export async function planNoteUpdate(db: MnemoDB, id: string, raw: NoteInput): Promise<{ toCreate: CardType[]; toDelete: CardType[] }> {
  const cards = await db.cards.where('noteId').equals(id).toArray()
  return diffTypes(cards.map((c) => c.type), normalizeInput(raw).enabledTypes)
}

/** 删除卡型会连同复习历史一起删，所以每个被删卡型必须出现在 confirmDelete 里，否则不写任何东西 */
export async function updateNote(
  db: MnemoDB, id: string, raw: NoteInput, now = Date.now(), sched: Scheduler = defaultScheduler, confirmDelete: CardType[] = [],
): Promise<{ note: Note; created: CardType[]; deleted: CardType[] }> {
  const input = normalizeInput(raw)
  return db.transaction('rw', db.notes, db.cards, db.reviewLogs, db.settings, async () => {
    const existing = await db.notes.get(id)
    if (!existing) throw new Error(`note ${id} not found`)
    const cards = await db.cards.where('noteId').equals(id).toArray()
    const { toCreate, toDelete } = diffTypes(cards.map((c) => c.type), input.enabledTypes)
    const unconfirmed = toDelete.filter((t) => !confirmDelete.includes(t))
    if (unconfirmed.length) throw new Error(`需要确认删除卡型：${unconfirmed.join(', ')}`)

    // 该记录今天已经出过一张（有兄弟被埋或今日有打分日志）时，新增的卡也埋到明天，否则同一记录今天会出第二张
    // 必须在删除 doomed 卡/日志之前计算，否则查不到刚删掉的日志
    const shownToday = cards.some((c) => c.buriedUntil !== undefined && c.buriedUntil > now)
      || (await db.reviewLogs.where('noteId').equals(id).filter((l) => l.reviewedAt >= learningDayStart(now)).count()) > 0

    const doomed = cards.filter((c) => toDelete.includes(c.type)).map((c) => c.id)
    if (doomed.length) {
      await db.reviewLogs.where('cardId').anyOf(doomed).delete()
      await db.cards.bulkDelete(doomed)
    }
    if (toCreate.length) {
      const bury = shownToday ? { buriedUntil: nextLearningDayStart(now) } : {}
      await db.cards.bulkAdd(toCreate.map((t) => ({ ...sched.newCard(id, t, now), ...bury })))
    }

    const note: Note = {
      ...existing,
      headword: input.headword,
      headwordKey: headwordKey(input.headword),
      phonetic: input.phonetic,
      meaning: input.meaning,
      examples: input.examples,
      tags: input.tags,
      enabledTypes: input.enabledTypes,
      updatedAt: now,
    }
    await db.notes.put(note)
    await updateSettings(db, { lastEnabledTypes: raw.enabledTypes })
    return { note, created: toCreate, deleted: toDelete }
  })
}

export async function deleteNote(db: MnemoDB, id: string): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, db.reviewLogs, async () => {
    await db.reviewLogs.where('noteId').equals(id).delete()
    await db.cards.where('noteId').equals(id).delete()
    await db.notes.delete(id)
  })
}

export async function findDuplicate(db: MnemoDB, headword: string, excludeId?: string): Promise<Note | undefined> {
  const key = headwordKey(headword)
  if (!key) return undefined
  return db.notes.where('headwordKey').equals(key).filter((n) => n.id !== excludeId).first()
}

export async function gradeCard(
  db: MnemoDB, cardId: string, rating: Rating, now = Date.now(), sched: Scheduler = defaultScheduler,
): Promise<{ card: Card; log: ReviewLog }> {
  return db.transaction('rw', db.cards, db.reviewLogs, async () => {
    const card = await db.cards.get(cardId)
    if (!card) throw new Error(`card ${cardId} not found`)
    const { card: next, log } = sched.grade(card, rating, now)

    const until = nextLearningDayStart(now)
    const siblings = await db.cards.where('noteId').equals(card.noteId).filter((c) => c.id !== card.id).toArray()
    const toBury = siblings.filter((s) => !(s.buriedUntil !== undefined && s.buriedUntil >= until)).map((s) => s.id)
    for (const id of toBury) await db.cards.update(id, { buriedUntil: until })

    const full: ReviewLog = { id: crypto.randomUUID(), ...log, buriedSiblingIds: toBury }
    await db.cards.put(next)
    await db.reviewLogs.add(full)
    return { card: next, log: full }
  })
}

export async function undoLastReview(db: MnemoDB, sched: Scheduler = defaultScheduler): Promise<Card | undefined> {
  return db.transaction('rw', db.cards, db.reviewLogs, async () => {
    const last = await db.reviewLogs.orderBy('reviewedAt').last()
    if (!last) return undefined
    const card = await db.cards.get(last.cardId)
    await db.reviewLogs.delete(last.id)
    if (!card) return undefined
    const prev = sched.rollback(card, last)
    await db.cards.put(prev)
    for (const id of last.buriedSiblingIds) await db.cards.update(id, { buriedUntil: undefined })
    return prev
  })
}

export async function getSettings(db: MnemoDB): Promise<Settings> {
  const s = await db.settings.get('settings')
  return s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS }
}

export async function updateSettings(db: MnemoDB, patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next: Settings = { ...(await getSettings(db)), ...patch, id: 'settings' }
    await db.settings.put(next)
    return next
  })
}

export async function addExtraNewToday(db: MnemoDB, count: number, now = Date.now()): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const dayStart = learningDayStart(now)
    const s = await getSettings(db)
    const prev = s.extraNew && s.extraNew.dayStart === dayStart ? s.extraNew.count : 0
    return updateSettings(db, { extraNew: { dayStart, count: prev + count } })
  })
}

/** 查询窗口在学习日结束后再多留一小时：接近 04:00 时提前拉出（learn-ahead）的学习中卡片可能落在边界之后 */
const QUEUE_HORIZON_SLACK_MS = 60 * 60_000

export async function getTodayParts(db: MnemoDB, now = Date.now()): Promise<QueueParts> {
  const settings = await getSettings(db)
  const dayStart = learningDayStart(now)
  const horizon = nextLearningDayStart(now) + QUEUE_HORIZON_SLACK_MS
  const [cards, logs] = await Promise.all([
    db.cards.where('due').below(horizon).toArray(),
    db.reviewLogs.where('reviewedAt').aboveOrEqual(dayStart).toArray(),
  ])
  const extraNewToday = settings.extraNew && settings.extraNew.dayStart === dayStart ? settings.extraNew.count : 0
  return buildQueueParts({
    cards,
    newIntroducedToday: countNewIntroduced(logs, now),
    newCardsPerDay: settings.newCardsPerDay,
    extraNewToday,
    now,
  })
}

export async function getTodayQueue(db: MnemoDB, now = Date.now()): Promise<Card[]> {
  const p = await getTodayParts(db, now)
  return [...p.learning, ...p.review, ...p.fresh]
}

/** 完成页用：今日学习日内的打分次数和其中第一次打分的新卡数 */
export async function getTodayReviewStats(db: MnemoDB, now = Date.now()): Promise<{ reviewed: number; learned: number }> {
  const logs = await db.reviewLogs.where('reviewedAt').aboveOrEqual(learningDayStart(now)).toArray()
  return { reviewed: logs.length, learned: countNewIntroduced(logs, now) }
}

export async function getTodayCounts(db: MnemoDB, now = Date.now()): Promise<{ due: number; fresh: number }> {
  const p = await getTodayParts(db, now)
  return { due: p.learning.length + p.review.length, fresh: p.fresh.length }
}

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
