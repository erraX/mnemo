import type { NoteInput } from '@/db/repo'
import { CARD_TYPES, type Blank, type CardType, type DictEntry, type Note } from '@/domain/types'
import { availableTypes, filterEnabled } from './cardTypes'
import { detectBlanks, tokenize } from './cloze'

export interface ExampleDraft {
  id: string
  text: string
  source: string
  blanks: Blank[]
  /** 用户手动点过挖空后不再自动重算 */
  manual: boolean
}

export interface NoteFormState {
  headword: string
  phonetic: string
  meaning: string
  examples: ExampleDraft[]
  tags: string
  types: CardType[]
  touched: { phonetic: boolean; meaning: boolean }
  dict: { status: 'idle' | 'hit' | 'miss'; forms: string[]; lemma?: string }
}

export type NoteFormAction =
  | { type: 'reset'; state: NoteFormState }
  | { type: 'headword'; value: string }
  | { type: 'dictResult'; result: { entry: DictEntry; viaForm: boolean } | undefined }
  | { type: 'acceptLemma' }
  | { type: 'phonetic'; value: string }
  | { type: 'meaning'; value: string }
  | { type: 'tags'; value: string }
  | { type: 'addExample' }
  | { type: 'removeExample'; id: string }
  | { type: 'exampleText'; id: string; value: string }
  | { type: 'exampleSource'; id: string; value: string }
  | { type: 'exampleBlanks'; id: string; blanks: Blank[] }
  | { type: 'toggleType'; cardType: CardType }

const canonical = (types: CardType[]) => CARD_TYPES.filter((t) => types.includes(t))

export function initialForm(defaults: CardType[], note?: Note): NoteFormState {
  if (!note) {
    return {
      headword: '', phonetic: '', meaning: '', examples: [], tags: '',
      types: canonical(defaults), touched: { phonetic: false, meaning: false }, dict: { status: 'idle', forms: [] },
    }
  }
  return {
    headword: note.headword,
    phonetic: note.phonetic ?? '',
    meaning: note.meaning,
    examples: note.examples.map((e) => ({ id: crypto.randomUUID(), text: e.text, source: e.source ?? '', blanks: e.blanks, manual: true })),
    tags: note.tags.join(', '),
    types: canonical(note.enabledTypes),
    touched: { phonetic: true, meaning: true },
    dict: { status: 'idle', forms: [] },
  }
}

function redetect(examples: ExampleDraft[], headword: string, forms: string[]): ExampleDraft[] {
  return examples.map((e) => (e.manual ? e : { ...e, blanks: detectBlanks(e.text, headword, forms) }))
}

/**
 * 手动挖空按字符偏移保存，改文字后要跟着移动：未改动前缀里的保留，后缀里的按长度差平移，
 * 落在改动区间内的丢弃；最后只留下仍与新文本某个词完全重合的。一个都不剩就退回自动检测。
 */
function realignManualBlanks(oldText: string, newText: string, blanks: Blank[]): Blank[] {
  const oldLen = oldText.length
  const newLen = newText.length
  let p = 0
  while (p < oldLen && p < newLen && oldText[p] === newText[p]) p += 1
  let q = 0
  while (q < oldLen - p && q < newLen - p && oldText[oldLen - 1 - q] === newText[newLen - 1 - q]) q += 1
  const delta = newLen - oldLen
  const editedEnd = oldLen - q
  const moved: Blank[] = []
  for (const b of blanks) {
    if (b.end <= p) moved.push(b)
    else if (b.start >= editedEnd) moved.push({ start: b.start + delta, end: b.end + delta })
  }
  const words = tokenize(newText).filter((t) => t.isWord)
  return moved.filter((b) => words.some((t) => t.start === b.start && t.end === b.end))
}

function withExampleText(e: ExampleDraft, value: string, headword: string, forms: string[]): ExampleDraft {
  if (!e.manual) return { ...e, text: value, blanks: detectBlanks(value, headword, forms) }
  const kept = realignManualBlanks(e.text, value, e.blanks)
  if (kept.length > 0) return { ...e, text: value, blanks: kept }
  return { ...e, text: value, blanks: detectBlanks(value, headword, forms), manual: false }
}

export function reduceForm(s: NoteFormState, a: NoteFormAction): NoteFormState {
  switch (a.type) {
    case 'reset':
      return a.state
    case 'headword':
      return { ...s, headword: a.value, dict: { status: 'idle', forms: [] }, examples: redetect(s.examples, a.value, []) }
    case 'dictResult': {
      if (!a.result) return { ...s, dict: { status: 'miss', forms: [] } }
      const { entry, viaForm } = a.result
      return {
        ...s,
        phonetic: s.touched.phonetic ? s.phonetic : entry.phonetic,
        meaning: s.touched.meaning ? s.meaning : entry.translation,
        dict: { status: 'hit', forms: entry.forms, lemma: viaForm ? entry.word : undefined },
        examples: redetect(s.examples, s.headword, entry.forms),
      }
    }
    case 'acceptLemma':
      if (!s.dict.lemma) return s
      return { ...s, headword: s.dict.lemma, dict: { ...s.dict, lemma: undefined }, examples: redetect(s.examples, s.dict.lemma, s.dict.forms) }
    case 'phonetic':
      return { ...s, phonetic: a.value, touched: { ...s.touched, phonetic: true } }
    case 'meaning':
      return { ...s, meaning: a.value, touched: { ...s.touched, meaning: true } }
    case 'tags':
      return { ...s, tags: a.value }
    case 'addExample':
      return { ...s, examples: [...s.examples, { id: crypto.randomUUID(), text: '', source: '', blanks: [], manual: false }] }
    case 'removeExample':
      return { ...s, examples: s.examples.filter((e) => e.id !== a.id) }
    case 'exampleText':
      return { ...s, examples: s.examples.map((e) => (e.id !== a.id ? e : withExampleText(e, a.value, s.headword, s.dict.forms))) }
    case 'exampleSource':
      return { ...s, examples: s.examples.map((e) => (e.id === a.id ? { ...e, source: a.value } : e)) }
    case 'exampleBlanks':
      return { ...s, examples: s.examples.map((e) => (e.id === a.id ? { ...e, blanks: a.blanks, manual: true } : e)) }
    case 'toggleType':
      return { ...s, types: canonical(s.types.includes(a.cardType) ? s.types.filter((t) => t !== a.cardType) : [...s.types, a.cardType]) }
  }
}

export function toNoteInput(s: NoteFormState): NoteInput {
  return {
    headword: s.headword.trim(),
    phonetic: s.phonetic.trim() || undefined,
    meaning: s.meaning.trim(),
    examples: s.examples
      .filter((e) => e.text.trim().length > 0)
      .map((e) => ({ text: e.text, source: e.source.trim() || undefined, blanks: e.blanks })),
    tags: s.tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean),
    enabledTypes: s.types,
  }
}

export function formAvailability(s: NoteFormState) {
  return availableTypes(toNoteInput(s))
}

export function effectiveTypes(s: NoteFormState): CardType[] {
  return filterEnabled(toNoteInput(s), s.types)
}

export function canSave(s: NoteFormState): boolean {
  return s.headword.trim().length > 0 && effectiveTypes(s).length > 0
}

export function saveLabel(s: NoteFormState, mode: 'new' | 'edit'): string {
  return mode === 'edit' ? '保存修改' : `保存 · 生成 ${effectiveTypes(s).length} 张卡`
}
