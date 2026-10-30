import { describe, expect, it } from 'vitest'
import { isSameLearningDay, learningDayStart, nextLearningDayStart } from './day'

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime()

describe('learning day (04:00 boundary)', () => {
  it('03:59 belongs to the previous day', () => {
    expect(learningDayStart(local(2026, 10, 30, 3, 59))).toBe(local(2026, 10, 29, 4))
  })
  it('04:00 starts a new day', () => {
    expect(learningDayStart(local(2026, 10, 30, 4, 0))).toBe(local(2026, 10, 30, 4))
  })
  it('23:00 is still the same day', () => {
    expect(learningDayStart(local(2026, 10, 30, 23))).toBe(local(2026, 10, 30, 4))
  })
  it('next boundary is the following 04:00', () => {
    expect(nextLearningDayStart(local(2026, 10, 30, 23))).toBe(local(2026, 10, 31, 4))
    expect(nextLearningDayStart(local(2026, 10, 30, 2))).toBe(local(2026, 10, 30, 4))
  })
  it('23:00 and next 08:00 are different days; 23:00 and 03:00 are the same', () => {
    expect(isSameLearningDay(local(2026, 10, 30, 23), local(2026, 10, 31, 8))).toBe(false)
    expect(isSameLearningDay(local(2026, 10, 30, 23), local(2026, 10, 31, 3))).toBe(true)
  })
})
