import type { Blank } from '@/domain/types'

export interface Token {
  text: string
  start: number
  end: number
  isWord: boolean
}

const WORD = /[A-Za-z0-9\u00C0-\u024F'\u2019-]+/y

export function tokenize(text: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < text.length) {
    WORD.lastIndex = i
    const m = WORD.exec(text)
    if (m && m.index === i) {
      out.push({ text: m[0], start: i, end: i + m[0].length, isWord: true })
      i += m[0].length
      continue
    }
    let j = i + 1
    while (j < text.length) {
      WORD.lastIndex = j
      const n = WORD.exec(text)
      if (n && n.index === j) break
      j += 1
    }
    out.push({ text: text.slice(i, j), start: i, end: j, isWord: false })
    i = j
  }
  return out
}

/** 精确、常见后缀（≤3 个字符）、去 e 加后缀 */
export function looseMatch(token: string, word: string): boolean {
  const t = token.toLowerCase()
  const w = word.toLowerCase()
  if (t === w) return true
  if (t.startsWith(w) && t.length - w.length <= 3) return true
  if (w.endsWith('e')) {
    const stem = w.slice(0, -1)
    if (t.startsWith(stem) && t.length - stem.length <= 3 && t !== stem) return true
  }
  return false
}

export function detectBlanks(text: string, headword: string, forms: string[] = []): Blank[] {
  const words = headword.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const formSet = new Set(forms.map((f) => f.toLowerCase()))
  const tokens = tokenize(text).filter((t) => t.isWord)

  const single = words.length === 1
  const exact = (token: Token, word: string): boolean => {
    const t = token.text.toLowerCase()
    return t === word || (single && formSet.has(t))
  }
  const loose = (token: Token, word: string): boolean => looseMatch(token.text, word)

  const firstWindow = (matches: (token: Token, word: string) => boolean): Blank[] | undefined => {
    for (let i = 0; i + words.length <= tokens.length; i += 1) {
      let ok = true
      for (let k = 0; k < words.length; k += 1) {
        if (!matches(tokens[i + k]!, words[k]!)) { ok = false; break }
      }
      if (ok) return tokens.slice(i, i + words.length).map((t) => ({ start: t.start, end: t.end }))
    }
    return undefined
  }

  // 先找精确 / 词形表匹配，都没有才退到宽松匹配，避免 “only” 抢在 “one” 前面
  return firstWindow(exact) ?? firstWindow(loose) ?? []
}

export function toggleBlank(blanks: Blank[], token: Token): Blank[] {
  const exists = blanks.some((b) => b.start === token.start && b.end === token.end)
  const next = exists
    ? blanks.filter((b) => !(b.start === token.start && b.end === token.end))
    : [...blanks, { start: token.start, end: token.end }]
  return next.sort((a, b) => a.start - b.start)
}

export function segments(text: string, blanks: Blank[]): Array<{ text: string; blank: boolean }> {
  const out: Array<{ text: string; blank: boolean }> = []
  let cursor = 0
  for (const b of [...blanks].sort((x, y) => x.start - y.start)) {
    if (b.start > cursor) out.push({ text: text.slice(cursor, b.start), blank: false })
    out.push({ text: text.slice(b.start, b.end), blank: true })
    cursor = b.end
  }
  if (cursor < text.length || out.length === 0) out.push({ text: text.slice(cursor), blank: false })
  return out
}
