import { describe, expect, it, vi } from 'vitest'
import { prefetchHeadwords } from './prefetchAll'

describe('prefetchHeadwords', () => {
  it('fetches every word with bounded concurrency and reports progress', async () => {
    let inFlight = 0
    let peak = 0
    const fetchImpl = vi.fn(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch
    const progress: number[] = []
    await prefetchHeadwords(['a', 'b', 'c', 'd', 'e'], 'uk', { concurrency: 2, fetchImpl, onProgress: (d) => progress.push(d) })
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    expect(peak).toBeLessThanOrEqual(2)
    expect(progress.at(-1)).toBe(5)
    expect(String(((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as unknown[])[0])).toContain('type=1')
  })
  it('skips blanks and duplicates and survives failures', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(prefetchHeadwords(['a', ' ', 'a', 'B'], 'us', { fetchImpl })).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
