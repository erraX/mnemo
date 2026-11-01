import { describe, expect, it } from 'vitest'
import { dueLabel, formatCnDateTime, minutesBetween } from './format'

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

import type { Card } from '@/domain/types'
import { noteDueSummary } from './format'

describe('formatCnDateTime', () => {
  it('reads as Chinese instead of the locale default', () => {
    expect(formatCnDateTime(local(2026, 10, 30, 14))).toBe('2026 年 10 月 30 日 14:00')
    expect(formatCnDateTime(new Date(2026, 0, 5, 9, 5).getTime())).toBe('2026 年 1 月 5 日 09:05')
  })
})

describe('noteDueSummary', () => {
  const card = (p: Partial<Card>): Card => ({
    id: 'c', noteId: 'n', type: 'en2zh', due: NOW, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
    learning_steps: 0, reps: 0, lapses: 0, state: 2, createdAt: NOW, ...p,
  })
  it('uses the earliest-due card', () => {
    expect(noteDueSummary([], NOW)).toBe('—')
    expect(noteDueSummary([card({ due: local(2026, 11, 3, 9) }), card({ due: local(2026, 11, 1, 9) })], NOW)).toBe('明天')
    expect(noteDueSummary([card({ state: 0, due: NOW - 1000 }), card({ due: local(2026, 11, 3, 9) })], NOW)).toBe('新')
  })
})
