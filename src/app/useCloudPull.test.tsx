// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { getSettings, updateSettings } from '@/db/repo'
import { useCloudPull } from './useCloudPull'

function Probe() {
  useCloudPull()
  return null
}

const CFG = { url: 'https://cf.example', token: 't0k' }

beforeEach(async () => {
  vi.unstubAllGlobals()
  await db.delete()
  await db.open()
})

function stub(items: unknown[]) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input)
    if (url.endsWith('/inbox/delete')) return new Response(JSON.stringify({ ok: true }), { status: 200 })
    return new Response(JSON.stringify({ items }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('useCloudPull', () => {
  it('未配置云端时完全不联网', async () => {
    const fetchMock = stub([])
    render(<Probe />)
    await new Promise((r) => setTimeout(r, 30))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('配置后挂载即拉一次，60 秒后再回前台才再拉一次', async () => {
    await updateSettings(db, { cloud: CFG })
    const fetchMock = stub([{ id: 'i1', word: 'serendipity', createdAt: 1 }])
    render(<Probe />)
    await waitFor(async () => expect(await db.drafts.count()).toBe(1))
    const inboxCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/inbox')).length
    expect(inboxCalls()).toBe(1)

    // 刚拉过就回前台不重复联网
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 30))
    expect(inboxCalls()).toBe(1)

    const real = Date.now
    vi.spyOn(Date, 'now').mockImplementation(() => real() + 61_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(inboxCalls()).toBe(2))
  })

  it('拉取失败不会抛出到界面，也不写 lastCloudPullAt', async () => {
    await updateSettings(db, { cloud: CFG })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<Probe />)
    await new Promise((r) => setTimeout(r, 50))
    expect((await getSettings(db)).lastCloudPullAt).toBeUndefined()
  })
})
