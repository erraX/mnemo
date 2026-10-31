import { describe, expect, it } from 'vitest'
import { dueLabel, minutesBetween } from './format'

const local = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime()
const NOW = local(2026, 10, 31, 10)

describe('dueLabel', () => {
  it('labels new, today, tomorrow, N days, months, overdue', () => {
    expect(dueLabel(NOW, 0, NOW)).toBe('新')
    expect(dueLabel(local(2026, 10, 31, 23), 2, NOW)).toBe('今天')
    expect(dueLabel(local(2026, 11, 1, 9), 2, NOW)).toBe('明天')
    expect(dueLabel(local(2026, 11, 3, 9), 2, NOW)).toBe('3 天后')
    expect(dueLabel(local(2027, 1, 15, 9), 2, NOW)).toBe('3 个月后')
    expect(dueLabel(local(2026, 10, 29, 9), 2, NOW)).toBe('已过期')
  })
  it('learning cards due within the hour show minutes', () => {
    expect(dueLabel(NOW + 10 * 60_000, 1, NOW)).toBe('10 分钟后')
  })
})

describe('minutesBetween', () => {
  it('rounds and floors at 1', () => {
    expect(minutesBetween(NOW, NOW + 90_000)).toBe(2)
    expect(minutesBetween(NOW, NOW + 10_000)).toBe(1)
  })
})
