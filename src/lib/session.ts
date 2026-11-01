import type { Card } from '@/domain/types'
import { learningDayStart } from './day'

export const BREATHER_EVERY = 20

export interface SessionStats {
  reviewed: number
  learned: number
  startedAt: number
}

export interface SessionState {
  phase: 'loading' | 'card' | 'breather' | 'done'
  queue: Card[]
  revealed: boolean
  stats: SessionStats
  sinceBreather: number
  canUndo: boolean
}

export function initialSession(now: number): SessionState {
  return { phase: 'loading', queue: [], revealed: false, stats: { reviewed: 0, learned: 0, startedAt: now }, sinceBreather: 0, canUndo: false }
}

export function withQueue(s: SessionState, queue: Card[]): SessionState {
  return { ...s, queue, revealed: false, phase: queue.length === 0 ? 'done' : 'card' }
}

export function reveal(s: SessionState): SessionState {
  return { ...s, revealed: true }
}

export function afterGrade(s: SessionState, { wasNew, queue }: { wasNew: boolean; queue: Card[] }): SessionState {
  const stats = { ...s.stats, reviewed: s.stats.reviewed + 1, learned: s.stats.learned + (wasNew ? 1 : 0) }
  const sinceBreather = s.sinceBreather + 1
  const next = withQueue({ ...s, stats, sinceBreather, canUndo: true }, queue)
  if (sinceBreather >= BREATHER_EVERY && next.phase === 'card') return { ...next, phase: 'breather', sinceBreather: 0 }
  return next
}

export function continueAfterBreather(s: SessionState): SessionState {
  return { ...s, phase: s.queue.length === 0 ? 'done' : 'card', revealed: false }
}

/** 撤销后把被恢复的卡放回队首（若仍在队列中），用户看到的是刚才那张而不是重排后的别张 */
export function afterUndo(s: SessionState, { wasNew, queue, restoredId }: { wasNew: boolean; queue: Card[]; restoredId?: string }): SessionState {
  const stats = {
    ...s.stats,
    reviewed: Math.max(0, s.stats.reviewed - 1),
    learned: Math.max(0, s.stats.learned - (wasNew ? 1 : 0)),
  }
  const restored = restoredId ? queue.find((c) => c.id === restoredId) : undefined
  const ordered = restored ? [restored, ...queue.filter((c) => c.id !== restoredId)] : queue
  return withQueue({ ...s, stats, sinceBreather: Math.max(0, s.sinceBreather - 1), canUndo: false }, ordered)
}

export function elapsedMinutes(s: SessionState, now: number): number {
  return Math.max(1, Math.round((now - s.stats.startedAt) / 60_000))
}

/** 学习时长只算页面在前台的时间：切到别的 app、锁屏、开着标签页去吃午饭都不算 */
export function activeMinutes(startedAt: number, idleMs: number, now: number): number {
  return Math.max(1, Math.round(Math.max(0, now - startedAt - idleMs) / 60_000))
}

export const SESSION_MEMORY_KEY = 'mnemo:review-progress'

export interface SessionMemory {
  dayStart: number
  /** 距离上一次歇脚页已经打过几张：从复习屏点「编辑」再回来不清零 */
  sinceBreather: number
  startedAt: number
}

/** 只认同一个学习日的记忆；跨天、损坏、旧格式一律当没有 */
export function readSessionMemory(raw: string | null, now: number): SessionMemory | undefined {
  if (!raw) return undefined
  try {
    const m = JSON.parse(raw) as Partial<SessionMemory>
    if (typeof m.dayStart !== 'number' || typeof m.sinceBreather !== 'number' || typeof m.startedAt !== 'number') return undefined
    if (m.dayStart !== learningDayStart(now)) return undefined
    return { dayStart: m.dayStart, sinceBreather: Math.max(0, m.sinceBreather), startedAt: m.startedAt }
  } catch {
    return undefined
  }
}

export function writeSessionMemory(s: SessionState): string {
  return JSON.stringify({
    dayStart: learningDayStart(s.stats.startedAt),
    sinceBreather: s.sinceBreather,
    startedAt: s.stats.startedAt,
  } satisfies SessionMemory)
}
