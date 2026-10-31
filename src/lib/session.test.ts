import { describe, expect, it } from 'vitest'
import type { Card } from '@/domain/types'
import { BREATHER_EVERY, afterGrade, afterUndo, continueAfterBreather, elapsedMinutes, initialSession, reveal, withQueue } from './session'

const NOW = 1_700_000_000_000
let n = 0
const card = (): Card => ({
  id: `c${++n}`, noteId: `n${n}`, type: 'en2zh', due: NOW, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
  learning_steps: 0, reps: 0, lapses: 0, state: 0, createdAt: NOW,
})
const many = (k: number) => Array.from({ length: k }, card)

describe('session', () => {
  it('starts loading, becomes card with a queue, done when empty', () => {
    const s0 = initialSession(NOW)
    expect(s0.phase).toBe('loading')
    expect(withQueue(s0, many(2)).phase).toBe('card')
    expect(withQueue(s0, []).phase).toBe('done')
  })
  it('reveal flips revealed; a new queue resets it', () => {
    const s = reveal(withQueue(initialSession(NOW), many(2)))
    expect(s.revealed).toBe(true)
    expect(withQueue(s, many(1)).revealed).toBe(false)
  })
  it('afterGrade counts reviewed and learned, enables undo, and moves on', () => {
    const s0 = withQueue(initialSession(NOW), many(2))
    const s1 = afterGrade(reveal(s0), { wasNew: true, queue: many(1) })
    expect(s1.stats).toMatchObject({ reviewed: 1, learned: 1 })
    expect(s1.canUndo).toBe(true)
    expect(s1.phase).toBe('card')
    expect(s1.revealed).toBe(false)
    expect(afterGrade(s1, { wasNew: false, queue: [] }).phase).toBe('done')
  })
  it('shows a breather every 20 grades when cards remain, not when the queue is empty', () => {
    let s = withQueue(initialSession(NOW), many(30))
    for (let i = 0; i < BREATHER_EVERY - 1; i += 1) s = afterGrade(s, { wasNew: false, queue: many(5) })
    expect(s.phase).toBe('card')
    s = afterGrade(s, { wasNew: false, queue: many(5) })
    expect(s.phase).toBe('breather')
    expect(s.queue).toHaveLength(5)
    s = continueAfterBreather(s)
    expect(s.phase).toBe('card')
    expect(s.sinceBreather).toBe(0)

    let t = withQueue(initialSession(NOW), many(20))
    for (let i = 0; i < BREATHER_EVERY; i += 1) t = afterGrade(t, { wasNew: false, queue: i === BREATHER_EVERY - 1 ? [] : many(1) })
    expect(t.phase).toBe('done')
  })
  it('afterUndo decrements stats (floored at 0) and disables undo', () => {
    const s0 = afterGrade(withQueue(initialSession(NOW), many(2)), { wasNew: true, queue: many(1) })
    const s1 = afterUndo(s0, { wasNew: true, queue: many(2) })
    expect(s1.stats).toMatchObject({ reviewed: 0, learned: 0 })
    expect(s1.canUndo).toBe(false)
    expect(s1.phase).toBe('card')
    expect(afterUndo(s1, { wasNew: false, queue: many(2) }).stats.reviewed).toBe(0)
  })
  it('elapsedMinutes rounds up to at least 1', () => {
    expect(elapsedMinutes(initialSession(NOW), NOW + 20_000)).toBe(1)
    expect(elapsedMinutes(initialSession(NOW), NOW + 9.6 * 60_000)).toBe(10)
  })
})
