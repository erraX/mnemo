// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote } from '@/db/repo'
import { prefetchHeadwords } from '@/lib/prefetchAll'
import { useOnlinePrefetch } from './useOnlinePrefetch'

vi.mock('@/lib/prefetchAll', () => ({ prefetchHeadwords: vi.fn(async () => undefined) }))

function Probe() {
  useOnlinePrefetch()
  return null
}

beforeEach(async () => {
  vi.mocked(prefetchHeadwords).mockClear()
  await db.delete()
  await db.open()
})

describe('useOnlinePrefetch', () => {
  it('prefetches notes from the last week on mount, and again when coming online', async () => {
    await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    render(<Probe />)
    await waitFor(() => expect(prefetchHeadwords).toHaveBeenCalledTimes(1))
    expect(prefetchHeadwords).toHaveBeenCalledWith(['concern'], 'us')
    await vi.mocked(prefetchHeadwords).mock.results[0]?.value

    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(prefetchHeadwords).toHaveBeenCalledTimes(2))
  })
})
