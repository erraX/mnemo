import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card as FsrsCard,
  type Grade,
  type ReviewLog as FsrsLog,
} from 'ts-fsrs'
import type { Card, CardType, FsrsState, Rating, ReviewLog } from '@/domain/types'

export type PendingLog = Omit<ReviewLog, 'id' | 'buriedSiblingIds'>

export interface Scheduler {
  newCard(noteId: string, type: CardType, now: number): Card
  grade(card: Card, rating: Rating, now: number): { card: Card; log: PendingLog }
  rollback(card: Card, log: ReviewLog | PendingLog): Card
  previewIntervals(card: Card, now: number): Record<Rating, string>
}

type StoredFsrsFields = Pick<
  Card,
  'due' | 'stability' | 'difficulty' | 'elapsed_days' | 'scheduled_days' | 'learning_steps' | 'reps' | 'lapses' | 'state' | 'last_review'
>

function toStored(c: FsrsCard): StoredFsrsFields {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as FsrsState,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  }
}

function toFsrs(c: Card): FsrsCard {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review === undefined ? undefined : new Date(c.last_review),
  }
}

function toFsrsLog(log: ReviewLog | PendingLog): FsrsLog {
  return {
    rating: log.rating,
    state: log.state,
    due: new Date(log.due),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: new Date(log.reviewedAt),
  }
}

export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.round(hours / 24)
  if (days < 60) return `${days} 天`
  return `${Math.round(days / 30)} 个月`
}

export function createScheduler(overrides: { enable_fuzz?: boolean } = {}): Scheduler {
  const f = fsrs(
    generatorParameters({
      enable_fuzz: overrides.enable_fuzz ?? true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m'],
    }),
  )

  return {
    newCard(noteId, type, now) {
      return { id: crypto.randomUUID(), noteId, type, createdAt: now, ...toStored(createEmptyCard(new Date(now))) }
    },

    grade(card, rating, now) {
      const { card: next, log } = f.next(toFsrs(card), new Date(now), rating as Grade)
      const { buriedUntil: _dropped, ...rest } = card
      void _dropped
      return {
        card: { ...rest, ...toStored(next) },
        log: {
          cardId: card.id,
          noteId: card.noteId,
          rating,
          reviewedAt: now,
          state: log.state as FsrsState,
          due: log.due.getTime(),
          stability: log.stability,
          difficulty: log.difficulty,
          elapsed_days: log.elapsed_days,
          last_elapsed_days: log.last_elapsed_days,
          scheduled_days: log.scheduled_days,
          learning_steps: log.learning_steps,
          prevDue: card.due,
        },
      }
    },

    rollback(card, log) {
      const prev = f.rollback(toFsrs(card), toFsrsLog(log))
      return { ...card, ...toStored(prev), due: log.prevDue ?? prev.due.getTime() }
    },

    previewIntervals(card, now) {
      const rec = f.repeat(toFsrs(card), new Date(now))
      const label = (r: Rating) => formatInterval(rec[r as Grade].card.due.getTime() - now)
      return { 1: label(1), 2: label(2), 3: label(3), 4: label(4) }
    },
  }
}

/** 生产用实例：fuzz 开启 */
export const scheduler: Scheduler = createScheduler()
