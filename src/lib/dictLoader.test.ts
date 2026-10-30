import { describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/test/db'
import { getSettings } from '@/db/repo'
import { ensureDictLoaded } from './dictLoader'

const entries = Array.from({ length: 2500 }, (_, i) => ({ word: `w${i}`, phonetic: '', translation: `t${i}`, forms: [] }))
const fetchImpl = vi.fn(async () => new Response(JSON.stringify(entries), { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch

describe('ensureDictLoaded', () => {
  it('loads once, records the version, reports progress, and skips next time', async () => {
    const db = createTestDb()
    const progress: Array<[number, number]> = []
    const r1 = await ensureDictLoaded(db, { version: 'v1', url: '/x', fetchImpl, onProgress: (d, t) => progress.push([d, t]) })
    expect(r1.status).toBe('loaded')
    expect(r1.entries).toBe(2500)
    expect(await db.dict.count()).toBe(2500)
    expect((await getSettings(db)).dictVersion).toBe('v1')
    expect(progress.at(-1)).toEqual([2500, 2500])

    const r2 = await ensureDictLoaded(db, { version: 'v1', url: '/x', fetchImpl })
    expect(r2.status).toBe('skipped')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('replaces old entries when the version changes', async () => {
    const db = createTestDb()
    await db.dict.put({ word: 'stale', phonetic: '', translation: 'x', forms: [] })
    await ensureDictLoaded(db, { version: 'v2', url: '/x', fetchImpl })
    expect(await db.dict.get('stale')).toBeUndefined()
    expect(await db.dict.count()).toBe(2500)
  })
})
