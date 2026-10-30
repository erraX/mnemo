import { describe, expect, it } from 'vitest'
import { parseExchange, shouldInclude, toEntry, type RawRow } from './dict-transform'

const row = (p: Partial<RawRow>): RawRow => ({
  word: 'concern', phonetic: "kәn'sә:n", translation: 'n. 关心, 忧虑\\nvt. 与...有关, 使担心',
  pos: '', tag: 'gk cet4 cet6 ky ielts', frq: '717', exchange: 's:concerns/3:concerns/p:concerned/i:concerning/d:concerned', ...p,
})

describe('parseExchange', () => {
  it('collects unique inflections and skips lemma pointers (0:/1:)', () => {
    expect(parseExchange('s:concerns/3:concerns/p:concerned/i:concerning/d:concerned')).toEqual(['concerns', 'concerned', 'concerning'])
    expect(parseExchange('0:concern/1:s3')).toEqual([])
    expect(parseExchange('')).toEqual([])
  })
})

describe('shouldInclude', () => {
  it('keeps tagged words', () => expect(shouldInclude(row({ frq: '0' }))).toBe(true))
  it('keeps frequent untagged words', () => expect(shouldInclude(row({ tag: '', frq: '29999' }))).toBe(true))
  it('drops rare untagged words and phrases with frq 0', () => {
    expect(shouldInclude(row({ tag: '', frq: '30001' }))).toBe(false)
    expect(shouldInclude(row({ word: 'on the fence', tag: '', frq: '0' }))).toBe(false)
  })
})

describe('toEntry', () => {
  it('lowercases word, unescapes \\n, normalizes ә→ə, parses forms and frq', () => {
    expect(toEntry(row({ word: 'Concern' }))).toEqual({
      word: 'concern',
      phonetic: "kən'sə:n",
      translation: 'n. 关心, 忧虑\nvt. 与...有关, 使担心',
      pos: undefined,
      tag: 'gk cet4 cet6 ky ielts',
      frq: 717,
      forms: ['concerns', 'concerned', 'concerning'],
    })
  })
})
