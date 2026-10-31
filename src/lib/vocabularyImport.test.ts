import { describe, expect, it } from 'vitest'
import { MAX_IMPORT_RECORDS, parseVocabularyImport } from './vocabularyImport'

const header = 'Word/Phrase\tTranslation\tIPA\tExample'

describe('Vocably import adapter', () => {
  it('maps TSV with quoted multiline examples and enables only available card types', () => {
    const parsed = parseVocabularyImport(`${header}\nconcern\t担忧\tkən\t"* I have concerns.\n* A concern."\nfrontier\t边境\t\tA distant place.`)
    expect(parsed).toMatchObject({ format: 'Vocably', total: 2, invalidRows: [] })
    expect(parsed.entries[0]).toEqual({
      headword: 'concern', meaning: '担忧', phonetic: 'kən', tags: [],
      examples: [
        { text: 'I have concerns.', blanks: [{ start: 7, end: 15 }] },
        { text: 'A concern.', blanks: [{ start: 2, end: 9 }] },
      ],
      enabledTypes: ['zh2en', 'cloze', 'en2zh'],
    })
    expect(parsed.entries[1]?.enabledTypes).toEqual(['zh2en', 'en2zh'])
  })

  it('handles BOM, CRLF, commas and escaped quotes without retaining unused columns', () => {
    const parsed = parseVocabularyImport('\uFEFFWord/Phrase,Translation,IPA,Example,Definition\r\n"of choice","首选, 中意",,"* The book of choice is \"\"ours\"\".",ignored\r\n')
    expect(parsed.total).toBe(1)
    const [entry] = parsed.entries
    expect(entry?.headword).toBe('of choice')
    expect(entry?.meaning).toBe('首选, 中意')
    expect(entry?.phonetic).toBeUndefined()
    expect(entry?.examples[0]?.text).toBe('The book of choice is "ours".')
    expect(entry?.examples[0]?.blanks).toEqual([{ start: 9, end: 11 }, { start: 12, end: 18 }])
    expect(entry?.enabledTypes).toEqual(['zh2en', 'cloze', 'en2zh'])
    expect(entry).not.toHaveProperty('definition')
  })

  it('allows missing optional columns and reports blank word/translation rows by record number', () => {
    const parsed = parseVocabularyImport('Word/Phrase\tTranslation\n\n  Hello  \t  你好  \n\t空词\nempty\t\n')
    expect(parsed.total).toBe(3)
    expect(parsed.invalidRows).toEqual([2, 3])
    expect(parsed.entries).toEqual([{
      headword: 'Hello', meaning: '你好', phonetic: undefined, examples: [], tags: [], enabledTypes: ['zh2en', 'en2zh'],
    }])
    expect(parseVocabularyImport('Word/Phrase,Translation\n,').entries).toEqual([])
  })

  it('removes example list bullets, not punctuation within examples', () => {
    const parsed = parseVocabularyImport(`${header}\nword\t词\t\t"• A word.\n- Another word.\n* Last word.\n "`)
    expect(parsed.entries[0]?.examples.map((e) => e.text)).toEqual(['A word.', 'Another word.', 'Last word.'])
  })

  it('rejects unknown headers, custom delimiters, broken quotes and inconsistent row widths', () => {
    expect(() => parseVocabularyImport('word,meaning\na,b')).toThrow('暂不支持')
    expect(() => parseVocabularyImport('Word/Phrase;Translation\na;b')).toThrow('暂不支持')
    expect(() => parseVocabularyImport('')).toThrow('暂不支持')
    expect(() => parseVocabularyImport(`${header}\nword\t词\t\t"unclosed`)).toThrow('文件格式损坏')
    expect(() => parseVocabularyImport('Word/Phrase,Translation\na,b,c')).toThrow('文件格式损坏')
  })

  it('refuses files with more than 10,000 data records', () => {
    const text = 'Word/Phrase,Translation\n' + Array.from({ length: MAX_IMPORT_RECORDS + 1 }, (_, i) => `word${i},词`).join('\n')
    expect(() => parseVocabularyImport(text)).toThrow('最多支持 10000 条')
  })
})
