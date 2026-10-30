import { describe, expect, it } from 'vitest'
import type { Card, ReviewLog } from '@/domain/types'
import { buildQueue, buildQueueParts, countNewIntroduced } from './queue'

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const NOW = local(2026, 10, 30, 8) // 08:00
const MIN = 60_000

let seq = 0
function card(p: Partial<Card>): Card {
  seq += 1
  return {
    id: `c${seq}`, noteId: `n${seq}`, type: 'zh2en', due: NOW, stability: 0, difficulty: 0,
    elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, createdAt: NOW - seq, ...p,
  }
}
const input = (cards: Card[], extra: Partial<Parameters<typeof buildQueue>[0]> = {}) => ({
  cards, newIntroducedToday: 0, newCardsPerDay: 20, extraNewToday: 0, now: NOW, ...extra,
})

describe('buildQueueParts', () => {
  it('learning cards are due by exact timestamp', () => {
    const due = card({ state: 1, due: NOW - MIN })
    const later = card({ state: 1, due: NOW + 30 * MIN })
    const { learning } = buildQueueParts(input([due, later]))
    expect(learning.map((c) => c.id)).toEqual([due.id])
  })

  it('review cards are due by learning day (graded 23:00 yesterday, interval 1 day, shows at 08:00)', () => {
    const r = card({ state: 2, due: local(2026, 10, 30, 23) })
    const tomorrow = card({ state: 2, due: local(2026, 10, 31, 5) })
    const { review } = buildQueueParts(input([r, tomorrow]))
    expect(review.map((c) => c.id)).toEqual([r.id])
  })

  it('new cards respect the daily limit minus already introduced, plus extra', () => {
    const fresh = [card({}), card({}), card({}), card({})]
    expect(buildQueueParts(input(fresh, { newCardsPerDay: 2 })).fresh).toHaveLength(2)
    expect(buildQueueParts(input(fresh, { newCardsPerDay: 2, newIntroducedToday: 1 })).fresh).toHaveLength(1)
    expect(buildQueueParts(input(fresh, { newCardsPerDay: 2, newIntroducedToday: 2, extraNewToday: 10 })).fresh).toHaveLength(4)
  })

  it('new cards come oldest first', () => {
    const older = card({ createdAt: NOW - 1000 })
    const newer = card({ createdAt: NOW - 10 })
    expect(buildQueueParts(input([newer, older])).fresh.map((c) => c.id)).toEqual([older.id, newer.id])
  })

  it('buried cards are excluded until buriedUntil passes', () => {
    const buried = card({ state: 2, due: NOW - MIN, buriedUntil: NOW + MIN })
    const unburied = card({ state: 2, due: NOW - MIN, buriedUntil: NOW - 1 })
    expect(buildQueue(input([buried, unburied])).map((c) => c.id)).toEqual([unburied.id])
  })

  it('order is learning → review → new, each by due / createdAt', () => {
    const n = card({})
    const r = card({ state: 2, due: NOW - 3 * MIN })
    const l = card({ state: 3, due: NOW - MIN })
    expect(buildQueue(input([n, r, l])).map((c) => c.id)).toEqual([l.id, r.id, n.id])
  })

  it('shows only one new card per note: the oldest by createdAt', () => {
    const a1 = card({ noteId: 'nA', createdAt: NOW - 300 })
    const a2 = card({ noteId: 'nA', createdAt: NOW - 900 })
    const a3 = card({ noteId: 'nA', createdAt: NOW - 600 })
    expect(buildQueueParts(input([a1, a2, a3])).fresh.map((c) => c.id)).toEqual([a2.id])
  })

  it('a review card hides its sibling new card for the day', () => {
    const r = card({ noteId: 'nA', state: 2, due: NOW - MIN })
    const n = card({ noteId: 'nA' })
    const p = buildQueueParts(input([r, n]))
    expect(p.review.map((c) => c.id)).toEqual([r.id])
    expect(p.fresh).toEqual([])
  })

  it('sibling dedupe does not consume the new-card limit', () => {
    const a1 = card({ noteId: 'nA', createdAt: NOW - 300 })
    const a2 = card({ noteId: 'nA', createdAt: NOW - 900 })
    const a3 = card({ noteId: 'nA', createdAt: NOW - 600 })
    const b = card({ noteId: 'nB', createdAt: NOW - 100 })
    expect(buildQueueParts(input([a1, a2, a3, b], { newCardsPerDay: 1 })).fresh.map((c) => c.id)).toEqual([a2.id])
    expect(buildQueueParts(input([a1, a2, a3, b], { newCardsPerDay: 2 })).fresh.map((c) => c.id)).toEqual([a2.id, b.id])
  })

  it('when nothing else is due, learning cards within 20 minutes are pulled forward', () => {
    const soon = card({ state: 1, due: NOW + 5 * MIN })
    const far = card({ state: 1, due: NOW + 25 * MIN })
    expect(buildQueue(input([soon, far])).map((c) => c.id)).toEqual([soon.id])
  })
})

describe('countNewIntroduced', () => {
  const log = (p: Partial<ReviewLog>): ReviewLog => ({
    id: 'l', cardId: 'c', noteId: 'n', rating: 3, reviewedAt: NOW, state: 0, due: 0, stability: 0, difficulty: 0,
    elapsed_days: 0, last_elapsed_days: 0, scheduled_days: 0, learning_steps: 0, buriedSiblingIds: [], ...p,
  })
  it('counts logs from today whose pre-state was New', () => {
    const logs = [
      log({ state: 0, reviewedAt: NOW - MIN }),
      log({ state: 1, reviewedAt: NOW - MIN }),
      log({ state: 0, reviewedAt: local(2026, 10, 30, 3) }), // 昨天（04:00 前）
    ]
    expect(countNewIntroduced(logs, NOW)).toBe(1)
  })
})
