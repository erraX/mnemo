import type { MnemoDB } from '@/db/db'
import type { DictEntry } from '@/domain/types'
import { getSettings, updateSettings } from '@/db/repo'

const CHUNK = 1000

export interface LoadOptions {
  version: string
  url: string
  fetchImpl?: typeof fetch
  onProgress?: (done: number, total: number) => void
}

export async function ensureDictLoaded(db: MnemoDB, opts: LoadOptions): Promise<{ status: 'loaded' | 'skipped'; entries: number; ms: number }> {
  const started = performance.now()
  const settings = await getSettings(db)
  if (settings.dictVersion === opts.version && (await db.dict.count()) > 0) {
    return { status: 'skipped', entries: 0, ms: 0 }
  }
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(opts.url)
  if (!res.ok) throw new Error(`词典下载失败：${res.status}`)
  const entries = (await res.json()) as DictEntry[]

  await db.dict.clear()
  for (let i = 0; i < entries.length; i += CHUNK) {
    await db.dict.bulkPut(entries.slice(i, i + CHUNK))
    opts.onProgress?.(Math.min(i + CHUNK, entries.length), entries.length)
  }
  await updateSettings(db, { dictVersion: opts.version })
  return { status: 'loaded', entries: entries.length, ms: Math.round(performance.now() - started) }
}
