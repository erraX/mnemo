import type { DictEntry } from '../src/domain/types'

export interface RawRow {
  word: string
  phonetic: string
  translation: string
  pos: string
  tag: string
  frq: string
  exchange: string
}

export const FRQ_LIMIT = 30000

export function parseExchange(exchange: string): string[] {
  if (!exchange) return []
  const out: string[] = []
  for (const part of exchange.split('/')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    const code = part.slice(0, idx)
    const form = part.slice(idx + 1).trim().toLowerCase()
    if (code === '0' || code === '1' || !form) continue
    if (!out.includes(form)) out.push(form)
  }
  return out
}

export function shouldInclude(row: RawRow): boolean {
  if (row.tag.trim().length > 0) return true
  const frq = Number(row.frq)
  return Number.isFinite(frq) && frq >= 1 && frq <= FRQ_LIMIT
}

export function toEntry(row: RawRow): DictEntry {
  const frq = Number(row.frq)
  return {
    word: row.word.trim().toLowerCase(),
    phonetic: row.phonetic.replace(/ә/g, 'ə').trim(),
    translation: row.translation.replace(/\\n/g, '\n').trim(),
    pos: row.pos.trim() || undefined,
    tag: row.tag.trim() || undefined,
    frq: Number.isFinite(frq) && frq > 0 ? frq : undefined,
    forms: parseExchange(row.exchange),
  }
}
