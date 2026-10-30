import { describe, expect, it } from 'vitest'
import { classifyLine, splitPaste } from './inbox'

describe('classifyLine', () => {
  it('≥4 words or terminal punctuation → sentence', () => {
    expect(classifyLine('concern')).toBe('headword')
    expect(classifyLine('ticking time bomb')).toBe('headword')
    expect(classifyLine('have some concerns about')).toBe('sentence')
    expect(classifyLine('Stay put.')).toBe('sentence')
    expect(classifyLine('Why me?')).toBe('sentence')
  })
})

describe('splitPaste', () => {
  it('splits lines, trims, drops empties and case-insensitive duplicates, keeps order', () => {
    const out = splitPaste('concern\n\n  Leverage \nI have some concerns about the timeline.\nconcern\nLEVERAGE\r\nticking time bomb')
    expect(out).toEqual([
      { raw: 'concern', kind: 'headword' },
      { raw: 'Leverage', kind: 'headword' },
      { raw: 'I have some concerns about the timeline.', kind: 'sentence' },
      { raw: 'ticking time bomb', kind: 'headword' },
    ])
  })
  it('returns [] for blank input', () => {
    expect(splitPaste('  \n ')).toEqual([])
  })
})
