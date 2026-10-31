import { parse } from 'csv-parse/browser/esm/sync'
import type { NoteInput } from '@/db/repo'
import { CARD_TYPES } from '@/domain/types'
import { filterEnabled } from './cardTypes'
import { detectBlanks } from './cloze'

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_RECORDS = 10_000

export interface ParsedVocabularyImport {
  format: string
  entries: NoteInput[]
  total: number
  /** 数据记录序号（1 开始），不是物理行号：例句可能跨行 */
  invalidRows: number[]
}

interface FormatAdapter {
  name: string
  matches(headers: string[]): boolean
  map(row: Record<string, string>): NoteInput | undefined
}

const vocably: FormatAdapter = {
  name: 'Vocably',
  matches: (headers) => headers.includes('Word/Phrase') && headers.includes('Translation'),
  map: (row) => {
    const headword = row['Word/Phrase']?.trim() ?? ''
    const meaning = row.Translation?.trim() ?? ''
    if (!headword || !meaning) return undefined
    const examples = (row.Example ?? '').split(/\r?\n/)
      .map((line) => line.trim().replace(/^[*•-]\s+/, '').trim())
      .filter(Boolean)
      .map((text) => ({ text, blanks: detectBlanks(text, headword) }))
    const input: NoteInput = {
      headword, meaning, phonetic: row.IPA?.trim() || undefined,
      examples, tags: [], enabledTypes: [],
    }
    return { ...input, enabledTypes: filterEnabled(input, CARD_TYPES) }
  },
}

// 新增格式只接入表头识别和字段映射，去重/事务统一由 repository 负责。
const adapters: readonly FormatAdapter[] = [vocably]

export function parseVocabularyImport(text: string): ParsedVocabularyImport {
  let detected: { delimiter: string; headers: string[]; adapter: FormatAdapter } | undefined
  for (const delimiter of ['\t', ',']) {
    try {
      const first = parse(text, { delimiter, bom: true, skip_empty_lines: true, to: 1 }) as string[][]
      const headers = first[0]?.map((h) => h.trim()) ?? []
      const adapter = adapters.find((a) => a.matches(headers))
      if (adapter) { detected = { delimiter, headers, adapter }; break }
    } catch { /* 另一种分隔符仍可能成功识别 */ }
  }
  if (!detected) throw new Error('暂不支持此文件格式，请选择 Vocably 导出的逗号或 Tab 分隔文件')

  let table: string[][]
  try {
    table = parse(text, { delimiter: detected.delimiter, bom: true, skip_empty_lines: true }) as string[][]
    if (new Set(detected.headers).size !== detected.headers.length) throw new Error('重复表头')
  } catch {
    throw new Error('文件格式损坏，请重新从 Vocably 导出（检查引号和列数）')
  }
  const rows = table.slice(1)
  if (rows.length > MAX_IMPORT_RECORDS) throw new Error(`最多支持 ${MAX_IMPORT_RECORDS} 条记录，请拆分文件后导入`)
  const entries: NoteInput[] = []
  const invalidRows: number[] = []
  rows.forEach((cells, i) => {
    const row = Object.fromEntries(detected.headers.map((h, j) => [h, cells[j] ?? '']))
    const entry = detected.adapter.map(row)
    if (entry) entries.push(entry)
    else invalidRows.push(i + 1)
  })
  return { format: detected.adapter.name, entries, total: rows.length, invalidRows }
}
