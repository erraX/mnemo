export type DraftKind = 'headword' | 'sentence'

export function classifyLine(line: string): DraftKind {
  const words = line.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 4) return 'sentence'
  if (/[.!?。！？]$/.test(line.trim())) return 'sentence'
  return 'headword'
}

export function splitPaste(text: string): Array<{ raw: string; kind: DraftKind }> {
  const seen = new Set<string>()
  const out: Array<{ raw: string; kind: DraftKind }> = []
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim()
    if (!raw) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ raw, kind: classifyLine(raw) })
  }
  return out
}
