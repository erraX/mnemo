import type { Accent } from '@/domain/types'
import { prefetchAudio } from './audio'

export async function prefetchHeadwords(
  words: string[],
  accent: Accent,
  opts: { concurrency?: number; fetchImpl?: typeof fetch; onProgress?: (done: number, total: number) => void } = {},
): Promise<void> {
  const unique = Array.from(new Set(words.map((w) => w.trim()).filter(Boolean)))
  const concurrency = Math.max(1, opts.concurrency ?? 3)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < unique.length) {
      const word = unique[next]!
      next += 1
      await prefetchAudio(word, accent, opts.fetchImpl)
      done += 1
      opts.onProgress?.(done, unique.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker))
}
