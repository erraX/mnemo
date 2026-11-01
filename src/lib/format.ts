import type { Card, FsrsState } from '@/domain/types'
import { learningDayStart } from './day'

const DAY = 86_400_000

export function minutesBetween(a: number, b: number): number {
  return Math.max(1, Math.round(Math.abs(b - a) / 60_000))
}

/** 卡片列表每行的"最近到期"：取 due 最小的那张卡 */
export function noteDueSummary(cards: Card[], now: number): string {
  if (cards.length === 0) return '—'
  const soonest = cards.reduce((a, b) => (b.due < a.due ? b : a))
  return dueLabel(soonest.due, soonest.state, now)
}

/** 卡片列表 / 背面用的到期文案 */
export function dueLabel(due: number, state: FsrsState, now: number): string {
  if (state === 0) return '新'
  if (state === 1 || state === 3) {
    if (due <= now) return '现在'
    if (due - now < 60 * 60_000) return `${minutesBetween(now, due)} 分钟后`
  }
  const dayDiff = Math.round((learningDayStart(due) - learningDayStart(now)) / DAY)
  if (dayDiff < 0) return '已过期'
  if (dayDiff === 0) return '今天'
  if (dayDiff === 1) return '明天'
  if (dayDiff < 60) return `${dayDiff} 天后`
  return `${Math.round(dayDiff / 30)} 个月后`
}

/** 中文的日期时间：2026 年 10 月 30 日 14:03（不用 toLocaleString 的地区格式） */
export function formatCnDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
