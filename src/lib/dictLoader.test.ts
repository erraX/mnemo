import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/test/db'
import { getSettings } from '@/db/repo'
import { ensureDictLoaded } from './dictLoader'

const entries = Array.from({ length: 2500 }, (_, i) => ({ word: `w${i}`, phonetic: '', translation: `t${i}`, forms: [] }))
const okResponse = () => new Response(JSON.stringify(entries), { headers: { 'content-type': 'application/json' } })
const fetchImpl = vi.fn(async () => okResponse()) as unknown as typeof fetch

describe('ensureDictLoaded', () => {
  beforeEach(() => {
    vi.mocked(fetchImpl).mockClear()
    vi.mocked(fetchImpl).mockImplementation(async () => okResponse())
  })

  it('loads once, records the version, reports progress, and skips next time', async () => {
    const db = createTestDb()
    const progress: Array<[number, number]> = []
    const r1 = await ensureDictLoaded(db, { version: 'v1', url: '/x', fetchImpl, onProgress: (d, t) => progress.push([d, t]) })
    expect(r1.status).toBe('loaded')
    expect(r1.entries).toBe(2500)
    expect(r1.ms).toBeGreaterThanOrEqual(r1.fetchMs + r1.writeMs - 1)
    expect(await db.dict.count()).toBe(2500)
    expect((await getSettings(db)).dictVersion).toBe('v1')
    expect(progress.at(-1)).toEqual([2500, 2500])

    const r2 = await ensureDictLoaded(db, { version: 'v1', url: '/x', fetchImpl })
    expect(r2).toMatchObject({ status: 'skipped', entries: 0, fetchMs: 0, writeMs: 0 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('replaces old entries when the version changes', async () => {
    const db = createTestDb()
    await db.dict.put({ word: 'stale', phonetic: '', translation: 'x', forms: [] })
    await ensureDictLoaded(db, { version: 'v2', url: '/x', fetchImpl })
    expect(await db.dict.get('stale')).toBeUndefined()
    expect(await db.dict.count()).toBe(2500)
  })

  it('rejects on a non-OK response and leaves the table and version untouched', async () => {
    const db = createTestDb()
    vi.mocked(fetchImpl).mockImplementation(async () => new Response('', { status: 503 }))
    await expect(ensureDictLoaded(db, { version: 'v3', url: '/x', fetchImpl })).rejects.toThrow(/词典下载失败/)
    expect(await db.dict.count()).toBe(0)
    expect((await getSettings(db)).dictVersion).toBeUndefined()
  })

  it('concurrent callers with the same version share one fetch and one load', async () => {
    const db = createTestDb()
    const [a, b] = await Promise.all([
      ensureDictLoaded(db, { version: 'v4', url: '/x', fetchImpl }),
      ensureDictLoaded(db, { version: 'v4', url: '/x', fetchImpl }),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(a.status).toBe('loaded')
    expect(await db.dict.count()).toBe(2500)
    expect((await getSettings(db)).dictVersion).toBe('v4')
  })
})
