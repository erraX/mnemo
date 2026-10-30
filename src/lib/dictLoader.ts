import type { MnemoDB } from '@/db/db'
import type { DictEntry } from '@/domain/types'
import { getSettings, updateSettings } from '@/db/repo'

const CHUNK = 5000

export interface LoadOptions {
  version: string
  url: string
  fetchImpl?: typeof fetch
  onProgress?: (done: number, total: number) => void
}

export interface LoadResult {
  status: 'loaded' | 'skipped'
  entries: number
  /** 总耗时 */
  ms: number
  /** 下载 + 解析 JSON */
  fetchMs: number
  /** 清表 + 写入 + 记录版本 */
  writeMs: number
}

/** 同一版本的并发调用（StrictMode 双触发等）共用一次加载 */
const inFlight = new Map<string, Promise<LoadResult>>()

export function ensureDictLoaded(db: MnemoDB, opts: LoadOptions): Promise<LoadResult> {
  const running = inFlight.get(opts.version)
  if (running) return running
  const p = loadDict(db, opts).finally(() => inFlight.delete(opts.version))
  inFlight.set(opts.version, p)
  return p
}

async function isCurrent(db: MnemoDB, version: string): Promise<boolean> {
  const settings = await getSettings(db)
  return settings.dictVersion === version && (await db.dict.count()) > 0
}

async function loadDict(db: MnemoDB, opts: LoadOptions): Promise<LoadResult> {
  const started = performance.now()
  const skipped = (fetchMs: number): LoadResult => ({
    status: 'skipped', entries: 0, ms: Math.round(performance.now() - started), fetchMs, writeMs: 0,
  })
  // 便宜的预检查，避免热启动时下载；事务内的检查才是权威的
  if (await isCurrent(db, opts.version)) return skipped(0)

  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(opts.url)
  if (!res.ok) throw new Error(`词典下载失败：${res.status}`)
  const entries = (await res.json()) as DictEntry[]
  const fetchMs = Math.round(performance.now() - started)

  const writeStarted = performance.now()
  const written = await db.transaction('rw', db.dict, db.settings, async () => {
    if (await isCurrent(db, opts.version)) return false
    await db.dict.clear()
    for (let i = 0; i < entries.length; i += CHUNK) {
      await db.dict.bulkAdd(entries.slice(i, i + CHUNK))
      opts.onProgress?.(Math.min(i + CHUNK, entries.length), entries.length)
    }
    await updateSettings(db, { dictVersion: opts.version })
    return true
  })
  if (!written) return skipped(fetchMs)
  const writeMs = Math.round(performance.now() - writeStarted)
  return { status: 'loaded', entries: entries.length, ms: Math.round(performance.now() - started), fetchMs, writeMs }
}
