import type { Card, ReviewLog } from '@/domain/types'
import { learningDayStart, nextLearningDayStart } from './day'

export const LEARN_AHEAD_MS = 20 * 60_000

export interface QueueInput {
  cards: Card[]
  newIntroducedToday: number
  newCardsPerDay: number
  extraNewToday: number
  now: number
}

export interface QueueParts {
  learning: Card[]
  review: Card[]
  fresh: Card[]
}

const byDue = (a: Card, b: Card) => a.due - b.due
const isLearning = (c: Card) => c.state === 1 || c.state === 3

export function countNewIntroduced(logs: ReviewLog[], now: number): number {
  const start = learningDayStart(now)
  return logs.filter((l) => l.reviewedAt >= start && l.state === 0).length
}

export function buildQueueParts(i: QueueInput): QueueParts {
  const dayEnd = nextLearningDayStart(i.now)
  const visible = i.cards.filter((c) => !(c.buriedUntil !== undefined && c.buriedUntil > i.now))

  // 同一记录每天只出一张卡：按 学习中 → 复习 → 新卡 的优先级，后出现的同记录卡被跳过
  const seen = new Set<string>()
  const firstPerNote = (cards: Card[]) => cards.filter((c) => {
    if (seen.has(c.noteId)) return false
    seen.add(c.noteId)
    return true
  })

  const learning = firstPerNote(visible.filter((c) => isLearning(c) && c.due <= i.now).sort(byDue))
  const review = firstPerNote(visible.filter((c) => c.state === 2 && c.due < dayEnd).sort(byDue))

  const limit = Math.max(0, i.newCardsPerDay + i.extraNewToday - i.newIntroducedToday)
  const fresh = firstPerNote(
    visible.filter((c) => c.state === 0).sort((a, b) => a.createdAt - b.createdAt),
  ).slice(0, limit)

  if (learning.length === 0 && review.length === 0 && fresh.length === 0) {
    const ahead = visible.filter((c) => isLearning(c) && c.due > i.now && c.due <= i.now + LEARN_AHEAD_MS).sort(byDue)
    return { learning: ahead, review, fresh }
  }
  return { learning, review, fresh }
}

export function buildQueue(i: QueueInput): Card[] {
  const p = buildQueueParts(i)
  return [...p.learning, ...p.review, ...p.fresh]
}
