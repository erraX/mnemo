export type CardType = 'zh2en' | 'cloze' | 'en2zh'
export const CARD_TYPES: readonly CardType[] = ['zh2en', 'cloze', 'en2zh']

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  zh2en: '中 → 英',
  cloze: '例句挖空',
  en2zh: '英 → 中',
}

/** 字符偏移区间，[start, end) */
export interface Blank {
  start: number
  end: number
}

export interface Example {
  text: string
  source?: string
  blanks: Blank[]
}

export interface Note {
  id: string
  headword: string
  /** headword.trim().toLowerCase()，用于查重与搜索 */
  headwordKey: string
  phonetic?: string
  meaning: string
  examples: Example[]
  tags: string[]
  enabledTypes: CardType[]
  createdAt: number
  updatedAt: number
}

/** ts-fsrs State：0 New · 1 Learning · 2 Review · 3 Relearning */
export type FsrsState = 0 | 1 | 2 | 3
/** ts-fsrs Rating：1 Again · 2 Hard · 3 Good · 4 Easy */
export type Rating = 1 | 2 | 3 | 4

export interface Card {
  id: string
  noteId: string
  type: CardType
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: FsrsState
  last_review?: number
  /** 被同记录其他卡"埋"到的时刻（下一个学习日 04:00） */
  buriedUntil?: number
  createdAt: number
}

export interface ReviewLog {
  id: string
  cardId: string
  noteId: string
  rating: Rating
  reviewedAt: number
  /** 以下为 ts-fsrs ReviewLog 字段（打分前的卡片状态） */
  state: FsrsState
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  last_elapsed_days: number
  scheduled_days: number
  learning_steps: number
  /** 这次打分埋掉的同记录卡片 id，撤销时解除 */
  buriedSiblingIds: string[]
  /** 打分前的 due，用于精确撤销（ts-fsrs 的 rollback 对非 New 状态会把 due 设成复习时刻） */
  prevDue?: number
}

export interface Draft {
  id: string
  raw: string
  kind: 'headword' | 'sentence'
  createdAt: number
}

export interface DictEntry {
  /** 小写 */
  word: string
  phonetic: string
  /** 中文释义，多行 */
  translation: string
  pos?: string
  tag?: string
  frq?: number
  /** 变形，小写，用于 concerns → concern */
  forms: string[]
}

export type Accent = 'us' | 'uk'

export interface Settings {
  id: 'settings'
  newCardsPerDay: number
  accent: Accent
  autoPlayOnReveal: boolean
  lastEnabledTypes: CardType[]
  lastBackupAt?: number
  dictVersion?: string
  /** "再学 10 张新卡"：某学习日的额外新卡额度 */
  extraNew?: { dayStart: number; count: number }
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  newCardsPerDay: 20,
  accent: 'us',
  autoPlayOnReveal: true,
  lastEnabledTypes: ['zh2en', 'cloze', 'en2zh'],
}
