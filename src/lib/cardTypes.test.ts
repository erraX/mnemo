import { describe, expect, it } from 'vitest'
import { availableTypes, diffTypes, filterEnabled, primaryClozeExample } from './cardTypes'

const base = { headword: 'concern', meaning: 'n. 担忧', examples: [] }
const withCloze = { ...base, examples: [{ text: 'I have concerns.', blanks: [{ start: 7, end: 15 }] }] }

describe('availableTypes', () => {
  it('en2zh always ok; zh2en needs meaning; cloze needs a blank', () => {
    const a = availableTypes(base)
    expect(a.en2zh.ok).toBe(true)
    expect(a.zh2en.ok).toBe(true)
    expect(a.cloze).toEqual({ ok: false, reason: '先给一条例句并挖一个空' })
  })
  it('zh2en fails on blank meaning; cloze ok with a blank', () => {
    const a = availableTypes({ ...withCloze, meaning: '  ' })
    expect(a.zh2en).toEqual({ ok: false, reason: '先填写释义' })
    expect(a.cloze.ok).toBe(true)
  })
  it('example with no blanks does not count', () => {
    expect(availableTypes({ ...base, examples: [{ text: 'x', blanks: [] }] }).cloze.ok).toBe(false)
  })
})

describe('filterEnabled / diffTypes / primaryClozeExample', () => {
  it('drops types whose prerequisites fail', () => {
    expect(filterEnabled(base, ['zh2en', 'cloze', 'en2zh'])).toEqual(['zh2en', 'en2zh'])
  })
  it('diffs existing vs wanted', () => {
    expect(diffTypes(['zh2en', 'en2zh'], ['cloze', 'en2zh'])).toEqual({ toCreate: ['cloze'], toDelete: ['zh2en'] })
  })
  it('picks the first example that has blanks', () => {
    const ex = [{ text: 'a', blanks: [] }, { text: 'b', blanks: [{ start: 0, end: 1 }] }]
    expect(primaryClozeExample(ex)?.text).toBe('b')
    expect(primaryClozeExample([])).toBeUndefined()
  })
})
