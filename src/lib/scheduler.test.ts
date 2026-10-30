import { describe, expect, it } from 'vitest'
import { createScheduler, formatInterval } from './scheduler'

const T0 = new Date(2026, 9, 30, 10, 0, 0).getTime()
const MIN = 60_000
const DAY = 24 * 60 * MIN

describe('formatInterval', () => {
  it('formats minutes, hours, days, months', () => {
    expect(formatInterval(30_000)).toBe('1 分钟')
    expect(formatInterval(10 * MIN)).toBe('10 分钟')
    expect(formatInterval(3 * 60 * MIN)).toBe('3 小时')
    expect(formatInterval(5 * DAY)).toBe('5 天')
    expect(formatInterval(90 * DAY)).toBe('3 个月')
  })
})

describe('scheduler (fuzz off for determinism)', () => {
  const s = createScheduler({ enable_fuzz: false })

  it('creates a New card due now', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    expect(c).toMatchObject({ noteId: 'n1', type: 'zh2en', state: 0, reps: 0, lapses: 0, due: T0, createdAt: T0 })
    expect(c.id).toMatch(/[0-9a-f-]{36}/)
  })

  it('Good on a New card enters Learning with the 10m step', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    const { card, log } = s.grade(c, 3, T0)
    expect(card.state).toBe(1)
    expect(card.due).toBe(T0 + 10 * MIN)
    expect(card.reps).toBe(1)
    expect(log).toMatchObject({ cardId: c.id, noteId: 'n1', rating: 3, reviewedAt: T0, state: 0 })
  })

  it('Good again after the step graduates to Review with a multi-day interval', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    const first = s.grade(c, 3, T0).card
    const second = s.grade(first, 3, T0 + DAY).card
    expect(second.state).toBe(2)
    expect(second.scheduled_days).toBeGreaterThanOrEqual(1)
  })

  it('rollback restores the previous card exactly', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    const { card, log } = s.grade(c, 4, T0)
    const back = s.rollback(card, { ...log, id: 'l1', buriedSiblingIds: [] })
    expect(back).toEqual({ ...c, last_review: undefined })
  })

  it('rollback from Review restores the Learning card exactly', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    const learning = s.grade(c, 3, T0).card
    const { card: review, log } = s.grade(learning, 3, T0 + DAY)
    expect(review.state).toBe(2)
    expect(s.rollback(review, { ...log, id: 'l2', buriedSiblingIds: [] })).toEqual(learning)
  })

  it('previewIntervals returns four labels ordered by rating', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    const p = s.previewIntervals(c, T0)
    expect(p[1]).toBe('1 分钟')
    expect(p[2]).toMatch(/分钟/)
    expect(p[3]).toBe('10 分钟')
    expect(p[4]).toMatch(/天/)
  })

  it('clears buriedUntil when the card itself is graded', () => {
    const c = { ...s.newCard('n1', 'zh2en', T0), buriedUntil: T0 + DAY }
    expect(s.grade(c, 3, T0).card.buriedUntil).toBeUndefined()
  })
})
