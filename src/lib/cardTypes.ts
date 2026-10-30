import type { CardType, Example, Note } from '@/domain/types'

type NoteLike = Pick<Note, 'headword' | 'meaning' | 'examples'>
export type TypeAvailability = Record<CardType, { ok: boolean; reason?: string }>

export function primaryClozeExample(examples: Example[]): Example | undefined {
  return examples.find((e) => e.text.trim().length > 0 && e.blanks.length > 0)
}

export function availableTypes(note: NoteLike): TypeAvailability {
  const hasHeadword = note.headword.trim().length > 0
  const hasMeaning = note.meaning.trim().length > 0
  const hasCloze = primaryClozeExample(note.examples) !== undefined
  return {
    zh2en: hasMeaning ? { ok: true } : { ok: false, reason: '先填写释义' },
    cloze: hasCloze ? { ok: true } : { ok: false, reason: '先给一条例句并挖一个空' },
    en2zh: hasHeadword ? { ok: true } : { ok: false, reason: '先填写单词或短语' },
  }
}

export function filterEnabled(note: NoteLike, wanted: readonly CardType[]): CardType[] {
  const a = availableTypes(note)
  return wanted.filter((t) => a[t].ok)
}

export function diffTypes(existing: readonly CardType[], wanted: readonly CardType[]) {
  return {
    toCreate: wanted.filter((t) => !existing.includes(t)),
    toDelete: existing.filter((t) => !wanted.includes(t)),
  }
}
