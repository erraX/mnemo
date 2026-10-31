import { describe, expect, it } from 'vitest'
import type { DictEntry, Note } from '@/domain/types'
import { canSave, effectiveTypes, initialForm, reduceForm, saveLabel, toNoteInput, type NoteFormState } from './noteForm'

const concern: DictEntry = { word: 'concern', phonetic: "kən'sə:n", translation: 'n. 关心, 忧虑\nvt. 与...有关', forms: ['concerns', 'concerned', 'concerning'] }
const ALL = ['zh2en', 'cloze', 'en2zh'] as const

function run(state: NoteFormState, ...actions: Parameters<typeof reduceForm>[1][]) {
  return actions.reduce(reduceForm, state)
}

describe('dictionary fill', () => {
  it('fills phonetic and meaning on hit, but never overwrites user edits', () => {
    const s0 = initialForm([...ALL])
    const s1 = run(s0, { type: 'headword', value: 'concern' }, { type: 'dictResult', result: { entry: concern, viaForm: false } })
    expect(s1.phonetic).toBe("kən'sə:n")
    expect(s1.meaning).toBe('n. 关心, 忧虑\nvt. 与...有关')
    expect(s1.dict).toEqual({ status: 'hit', forms: concern.forms, lemma: undefined })

    const s2 = run(s1, { type: 'meaning', value: '担忧' }, { type: 'dictResult', result: { entry: concern, viaForm: false } })
    expect(s2.meaning).toBe('担忧')
    expect(s2.touched.meaning).toBe(true)
  })
  it('records a miss and keeps fields', () => {
    const s = run(initialForm([...ALL]), { type: 'headword', value: 'ticking time bomb' }, { type: 'dictResult', result: undefined })
    expect(s.dict.status).toBe('miss')
    expect(s.phonetic).toBe('')
  })
  it('a miss after a hit clears the unedited phonetic and meaning but keeps user edits', () => {
    const hit = run(initialForm([...ALL]), { type: 'headword', value: 'concern' }, { type: 'dictResult', result: { entry: concern, viaForm: false } })
    const miss = run(hit, { type: 'headword', value: 'concern about' }, { type: 'dictResult', result: undefined })
    expect(miss.dict).toEqual({ status: 'miss', forms: [] })
    expect(miss.phonetic).toBe('')
    expect(miss.meaning).toBe('')

    const edited = run(hit, { type: 'meaning', value: '担忧' }, { type: 'headword', value: 'concern about' }, { type: 'dictResult', result: undefined })
    expect(edited.meaning).toBe('担忧')
    expect(edited.phonetic).toBe('')
  })
  it('offers the lemma when matched via an inflection and applies it on acceptLemma', () => {
    const s1 = run(initialForm([...ALL]), { type: 'headword', value: 'concerns' }, { type: 'dictResult', result: { entry: concern, viaForm: true } })
    expect(s1.dict.lemma).toBe('concern')
    const s2 = reduceForm(s1, { type: 'acceptLemma' })
    expect(s2.headword).toBe('concern')
    expect(s2.dict.lemma).toBeUndefined()
  })
  it('a new headword resets dict status to idle', () => {
    const s = run(initialForm([...ALL]), { type: 'dictResult', result: { entry: concern, viaForm: false } }, { type: 'headword', value: 'lev' })
    expect(s.dict.status).toBe('idle')
  })
})

describe('examples and cloze detection', () => {
  const base = run(initialForm([...ALL]), { type: 'headword', value: 'concern' }, { type: 'dictResult', result: { entry: concern, viaForm: false } }, { type: 'addExample' })
  const id = () => base.examples[0]!.id

  it('auto-detects blanks when example text changes', () => {
    const s = reduceForm(base, { type: 'exampleText', id: id(), value: 'I have some concerns about it.' })
    expect(s.examples[0]!.blanks).toEqual([{ start: 12, end: 20 }])
    expect(s.examples[0]!.manual).toBe(false)
  })
  it('re-detects for non-manual examples when the headword changes', () => {
    const s1 = reduceForm(base, { type: 'exampleText', id: id(), value: 'I have some concerns about it.' })
    const s2 = reduceForm(s1, { type: 'headword', value: 'have' })
    expect(s2.examples[0]!.blanks).toEqual([{ start: 2, end: 6 }])
  })
  it('stops auto-detection once the user toggled blanks manually', () => {
    const s1 = reduceForm(base, { type: 'exampleText', id: id(), value: 'I have some concerns about it.' })
    const s2 = reduceForm(s1, { type: 'exampleBlanks', id: id(), blanks: [{ start: 2, end: 6 }] })
    const s3 = reduceForm(s2, { type: 'exampleText', id: id(), value: 'I have some concerns about it!' })
    expect(s3.examples[0]!.manual).toBe(true)
    expect(s3.examples[0]!.blanks).toEqual([{ start: 2, end: 6 }])
  })
  describe('manual blanks follow text edits', () => {
    const note: Note = {
      id: 'n1', headword: 'concern', headwordKey: 'concern', meaning: 'm',
      examples: [{ text: 'I have some concerns.', blanks: [{ start: 12, end: 20 }] }],
      tags: [], enabledTypes: ['cloze'], createdAt: 1, updatedAt: 1,
    }
    const loaded = initialForm([...ALL], note)
    const exId = loaded.examples[0]!.id

    it('shifts a manual blank when text is inserted before it', () => {
      const s = reduceForm(loaded, { type: 'exampleText', id: exId, value: 'Well, I have some concerns.' })
      expect(s.examples[0]!.blanks).toEqual([{ start: 18, end: 26 }])
      expect(s.examples[0]!.manual).toBe(true)
    })
    it('re-detects and drops manual when the blanked word is deleted', () => {
      const s = reduceForm(loaded, { type: 'exampleText', id: exId, value: 'I have some.' })
      expect(s.examples[0]!.blanks).toEqual([])
      expect(s.examples[0]!.manual).toBe(false)
    })
    it('keeps a manual blank unchanged when text after it is edited', () => {
      const s = reduceForm(loaded, { type: 'exampleText', id: exId, value: 'I have some concerns.!' })
      expect(s.examples[0]!.blanks).toEqual([{ start: 12, end: 20 }])
      expect(s.examples[0]!.manual).toBe(true)
    })
  })

  it('removes examples and edits sources', () => {
    const s1 = reduceForm(base, { type: 'exampleSource', id: id(), value: 'The Economist' })
    expect(s1.examples[0]!.source).toBe('The Economist')
    expect(reduceForm(s1, { type: 'removeExample', id: id() }).examples).toHaveLength(0)
  })
})

describe('types, save label, note input', () => {
  it('effective types exclude unavailable ones and the label counts them', () => {
    const s = run(initialForm([...ALL]), { type: 'headword', value: 'concern' })
    expect(effectiveTypes(s)).toEqual(['en2zh'])
    expect(saveLabel(s, 'new')).toBe('保存 · 生成 1 张卡')
    expect(saveLabel(s, 'edit')).toBe('保存修改')
    const withMeaning = reduceForm(s, { type: 'meaning', value: '担忧' })
    expect(effectiveTypes(withMeaning)).toEqual(['zh2en', 'en2zh'])
  })
  it('toggleType flips membership and keeps canonical order', () => {
    const s = run(initialForm(['en2zh']), { type: 'toggleType', cardType: 'zh2en' })
    expect(s.types).toEqual(['zh2en', 'en2zh'])
    expect(reduceForm(s, { type: 'toggleType', cardType: 'en2zh' }).types).toEqual(['zh2en'])
  })
  it('canSave needs a headword and at least one effective type', () => {
    expect(canSave(initialForm([...ALL]))).toBe(false)
    expect(canSave(run(initialForm([...ALL]), { type: 'headword', value: 'x' }))).toBe(true)
    expect(canSave(run(initialForm([]), { type: 'headword', value: 'x' }))).toBe(false)
  })
  it('toNoteInput trims, splits tags on commas/spaces, drops empty examples', () => {
    const s = run(initialForm([...ALL]),
      { type: 'headword', value: ' concern ' }, { type: 'meaning', value: '担忧' },
      { type: 'tags', value: 'cet4, 工作 经济' }, { type: 'addExample' }, { type: 'addExample' })
    const withText = reduceForm(s, { type: 'exampleText', id: s.examples[0]!.id, value: 'I have concerns.' })
    const input = toNoteInput(withText)
    expect(input.headword).toBe('concern')
    expect(input.tags).toEqual(['cet4', '工作', '经济'])
    expect(input.examples).toEqual([{ text: 'I have concerns.', source: undefined, blanks: [{ start: 7, end: 15 }] }])
    expect(input.enabledTypes).toEqual(['zh2en', 'cloze', 'en2zh'])
  })
  it('initialForm from an existing note restores fields and marks examples manual', () => {
    const note: Note = {
      id: 'n1', headword: 'concern', headwordKey: 'concern', phonetic: 'x', meaning: 'm',
      examples: [{ text: 'I have concerns.', source: 's', blanks: [{ start: 7, end: 15 }] }],
      tags: ['a', 'b'], enabledTypes: ['cloze'], createdAt: 1, updatedAt: 1,
    }
    const s = initialForm(['zh2en'], note)
    expect(s).toMatchObject({ headword: 'concern', phonetic: 'x', meaning: 'm', tags: 'a, b', types: ['cloze'], touched: { phonetic: true, meaning: true } })
    expect(s.examples[0]).toMatchObject({ text: 'I have concerns.', source: 's', manual: true })
  })
})

describe('drafts', () => {
  it('prefillDraft(headword) sets the headword', () => {
    const s = reduceForm(initialForm([...ALL]), { type: 'prefillDraft', draft: { id: 'd', raw: 'concern', kind: 'headword', createdAt: 1 } })
    expect(s.headword).toBe('concern')
    expect(s.pendingHeadwordPick).toBe(false)
  })
  it('prefillDraft(sentence) adds an example and waits for a headword pick; pickHeadword sets it and detects the blank', () => {
    const s1 = reduceForm(initialForm([...ALL]), { type: 'prefillDraft', draft: { id: 'd', raw: 'I have some concerns about it.', kind: 'sentence', createdAt: 1 } })
    expect(s1.examples.map((e) => e.text)).toEqual(['I have some concerns about it.'])
    expect(s1.pendingHeadwordPick).toBe(true)
    expect(s1.headword).toBe('')
    const s2 = reduceForm(s1, { type: 'pickHeadword', word: 'concerns' })
    expect(s2.headword).toBe('concerns')
    expect(s2.pendingHeadwordPick).toBe(false)
    expect(s2.examples[0]!.blanks).toEqual([{ start: 12, end: 20 }])
  })
  it('typing a headword dismisses the picker (phrases are typed by hand)', () => {
    const s1 = reduceForm(initialForm([...ALL]), { type: 'prefillDraft', draft: { id: 'd', raw: 'I have some concerns about it.', kind: 'sentence', createdAt: 1 } })
    const s2 = reduceForm(s1, { type: 'headword', value: 'leverage' })
    expect(s2.headword).toBe('leverage')
    expect(s2.pendingHeadwordPick).toBe(false)
    expect(reduceForm(s1, { type: 'headword', value: '' }).pendingHeadwordPick).toBe(true)
  })
})
