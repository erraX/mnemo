import type { MnemoDB } from './db'
import { CARD_TYPES, type Card, type CardType, type Note } from '@/domain/types'
import { availableTypes } from '@/lib/cardTypes'
import { learningDayStart, nextLearningDayStart } from '@/lib/day'
import { scheduler as defaultScheduler, type Scheduler } from '@/lib/scheduler'

export type TypeChange = 'keep' | 'enable' | 'disable'
export type TypeChanges = Record<CardType, TypeChange>
export type BulkAction = { kind: 'delete' } | { kind: 'types'; changes: TypeChanges }

export interface BulkSummary {
  notes: number
  createdCards: number
  deletedCards: number
  deletedLogs: number
  skippedCards: number
}

export interface BulkPlan {
  readonly noteIds: readonly string[]
  readonly action: BulkAction
  readonly summary: BulkSummary
  /** 覆盖所选记录、卡片和日志；确认后有变化就拒绝写入，不能扩大删除范围。 */
  readonly snapshot: string
}

export const STALE_BULK_PLAN = '所选数据已变化，请重新预览后确认'

function groupCards(cards: Card[]): Map<string, Card[]> {
  const byNote = new Map<string, Card[]>()
  for (const card of cards) {
    const own = byNote.get(card.noteId) ?? []
    own.push(card)
    byNote.set(card.noteId, own)
  }
  return byNote
}

/** 调用者必须在包含 notes/cards/reviewLogs 的事务里运行。 */
async function prepare(db: MnemoDB, ids: readonly string[], action: BulkAction) {
  const noteIds = [...new Set(ids)].sort()
  const [rows, cards, logs] = await Promise.all([
    db.notes.bulkGet(noteIds),
    db.cards.where('noteId').anyOf(noteIds).toArray(),
    db.reviewLogs.where('noteId').anyOf(noteIds).toArray(),
  ])
  const notes = rows.filter((note): note is Note => note !== undefined)
  const byNote = groupCards(cards)
  const toCreate: Array<{ noteId: string; type: CardType }> = []
  const updates: Note[] = []
  const toDelete = action.kind === 'delete'
    ? cards
    : cards.filter((card) => action.changes[card.type] === 'disable')
  let skippedCards = 0

  if (action.kind === 'types') {
    for (const note of notes) {
      const own = byNote.get(note.id) ?? []
      const availability = availableTypes(note)
      const enabled = new Set(note.enabledTypes)
      const createCount = toCreate.length
      for (const type of CARD_TYPES) {
        const change = action.changes[type]
        if (change === 'disable') enabled.delete(type)
        if (change === 'enable') {
          if (own.some((card) => card.type === type)) enabled.add(type)
          else if (availability[type].ok) {
            enabled.add(type)
            toCreate.push({ noteId: note.id, type })
          } else skippedCards += 1
        }
      }
      const enabledTypes = CARD_TYPES.filter((type) => enabled.has(type))
      if (enabledTypes.length !== note.enabledTypes.length || enabledTypes.some((type) => !note.enabledTypes.includes(type))
        || own.some((card) => action.changes[card.type] === 'disable') || toCreate.length !== createCount) {
        updates.push({ ...note, enabledTypes })
      }
    }
  }
  const doomedIds = new Set(toDelete.map((card) => card.id))
  const deletedLogs = action.kind === 'delete' ? logs : logs.filter((log) => doomedIds.has(log.cardId))
  const summary: BulkSummary = {
    notes: notes.length,
    createdCards: toCreate.length,
    deletedCards: toDelete.length,
    deletedLogs: deletedLogs.length,
    skippedCards,
  }
  const plan: BulkPlan = { noteIds, action, summary, snapshot: JSON.stringify([rows, cards, logs]) }
  return { plan, notes, cards, logs, updates, toCreate, toDelete, deletedLogs }
}

/** 一致的只读预览；ID 固定，不在确认后重新扩展搜索或全选范围。 */
export async function planBulkNotes(db: MnemoDB, ids: readonly string[], action: BulkAction): Promise<BulkPlan> {
  return db.transaction('r', db.notes, db.cards, db.reviewLogs, async () =>
    (await prepare(db, ids, structuredClone(action))).plan)
}

/** 整批原子执行；不经过单条编辑，不修改默认卡型或任何设置。 */
export async function applyBulkNotes(
  db: MnemoDB, confirmed: BulkPlan, now = Date.now(), sched: Scheduler = defaultScheduler,
): Promise<BulkSummary> {
  return db.transaction('rw', db.notes, db.cards, db.reviewLogs, async () => {
    const current = await prepare(db, confirmed.noteIds, confirmed.action)
    if (current.plan.snapshot !== confirmed.snapshot) throw new Error(STALE_BULK_PLAN)

    // 删除日志前判断今日是否已学过，卡型替换不能让同一单词今天再次作为新词出现。
    const shownToday = new Set(current.cards.filter((card) => (card.buriedUntil ?? 0) > now).map((card) => card.noteId))
    for (const log of current.logs) if (log.reviewedAt >= learningDayStart(now)) shownToday.add(log.noteId)

    await db.reviewLogs.bulkDelete(current.deletedLogs.map((log) => log.id))
    await db.cards.bulkDelete(current.toDelete.map((card) => card.id))
    if (confirmed.action.kind === 'delete') {
      await db.notes.bulkDelete(current.notes.map((note) => note.id))
    } else {
      await db.notes.bulkPut(current.updates.map((note) => ({ ...note, updatedAt: now })))
      await db.cards.bulkAdd(current.toCreate.map(({ noteId, type }) => ({
        ...sched.newCard(noteId, type, now),
        ...(shownToday.has(noteId) ? { buriedUntil: nextLearningDayStart(now) } : {}),
      })))
    }
    return current.plan.summary
  })
}
