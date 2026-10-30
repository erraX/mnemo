import { describe, expect, it } from 'vitest'
import { detectBlanks, looseMatch, segments, toggleBlank, tokenize } from './cloze'

describe('tokenize', () => {
  it('keeps curly apostrophes (U+2019) inside words', () => {
    expect(tokenize('I don\u2019t know').map((x) => x.text)).toEqual(['I', ' ', 'don\u2019t', ' ', 'know'])
  })
  it('splits words and separators with offsets', () => {
    const t = tokenize("I don't know.")
    expect(t.map((x) => x.text)).toEqual(['I', ' ', "don't", ' ', 'know', '.'])
    expect(t[2]).toEqual({ text: "don't", start: 2, end: 7, isWord: true })
    expect(t[5]!.isWord).toBe(false)
  })
})

describe('looseMatch', () => {
  it('accepts exact, simple suffixes, and e-dropping', () => {
    expect(looseMatch('concerns', 'concern')).toBe(true)
    expect(looseMatch('Concerned', 'concern')).toBe(true)
    expect(looseMatch('having', 'have')).toBe(true)
    expect(looseMatch('concerning', 'concern')).toBe(true)
    expect(looseMatch('had', 'have')).toBe(false)
    expect(looseMatch('concert', 'concern')).toBe(false)
  })
})

describe('detectBlanks', () => {
  const sentence = 'I have some concerns about the proposed timeline.'

  it('finds the headword via forms', () => {
    expect(detectBlanks(sentence, 'concern', ['concerns', 'concerned'])).toEqual([{ start: 12, end: 20 }])
  })
  it('falls back to loose matching without forms', () => {
    expect(detectBlanks(sentence, 'concern')).toEqual([{ start: 12, end: 20 }])
  })
  it('matches multi-word headwords token by token, one blank per word', () => {
    expect(detectBlanks(sentence, 'have some concerns about')).toEqual([
      { start: 2, end: 6 }, { start: 7, end: 11 }, { start: 12, end: 20 }, { start: 21, end: 26 },
    ])
  })
  it('returns [] when nothing matches', () => {
    expect(detectBlanks(sentence, 'leverage')).toEqual([])
  })
  it('prefers an exact match anywhere over an earlier loose match', () => {
    const s = 'I only have one.'
    expect(detectBlanks(s, 'one')).toEqual([{ start: s.indexOf('one.'), end: s.indexOf('one.') + 3 }])
  })
  it('prefers a forms match anywhere over an earlier loose match', () => {
    // “Having” 宽松匹配 have，但 forms 里的 “had” 更可信
    expect(detectBlanks('Having had it.', 'have', ['had'])).toEqual([{ start: 7, end: 10 }])
  })
  it('only blanks the first occurrence', () => {
    expect(detectBlanks('Concern leads to concern.', 'concern')).toEqual([{ start: 0, end: 7 }])
  })
})

describe('toggleBlank / segments', () => {
  const text = 'I have some concerns about it.'
  const tok = tokenize(text)
  const concerns = tok.find((t) => t.text === 'concerns')!
  const have = tok.find((t) => t.text === 'have')!

  it('adds, keeps sorted, and removes', () => {
    const a = toggleBlank([], concerns)
    const b = toggleBlank(a, have)
    expect(b).toEqual([{ start: 2, end: 6 }, { start: 12, end: 20 }])
    expect(toggleBlank(b, concerns)).toEqual([{ start: 2, end: 6 }])
  })
  it('segments text into blank and plain runs', () => {
    expect(segments(text, [{ start: 12, end: 20 }])).toEqual([
      { text: 'I have some ', blank: false },
      { text: 'concerns', blank: true },
      { text: ' about it.', blank: false },
    ])
    expect(segments(text, [])).toEqual([{ text, blank: false }])
  })
})
