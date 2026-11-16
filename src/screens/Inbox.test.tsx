// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter, Route, Routes } from 'react-router'
import { db } from '@/db/db'
import { getSettings, updateSettings } from '@/db/repo'
import { useCloudPull } from '@/app/useCloudPull'
import { renderWithRouter } from '@/test/render'
import { Inbox } from './Inbox'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.dict.put({ word: 'concern', phonetic: '', translation: 'n. 担忧', forms: ['concerns'] })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Inbox', () => {
  it('splits pasted lines into drafts with kinds and dictionary status', async () => {
    // 真实应用走 HashRouter：草稿链接的 href 应是 #/note/new?draft=…
    window.location.hash = '#/inbox'
    render(<HashRouter><Routes><Route path="/inbox" element={<Inbox />} /></Routes></HashRouter>)
    fireEvent.change(screen.getByLabelText('粘贴多行文本'), { target: { value: 'concern\nI have some concerns about it.\nticking time bomb' } })
    fireEvent.click(screen.getByRole('button', { name: '加入收集箱' }))
    await waitFor(async () => expect(await db.drafts.count()).toBe(3))
    expect(await screen.findByText('词典已补全 · 缺例句')).toBeTruthy()
    expect(screen.getByText('像是句子 · 点一个词作为要记的词')).toBeTruthy()
    expect(await screen.findByText('词典没有 · 需要自己写释义')).toBeTruthy()
    const link = screen.getByRole('link', { name: /ticking time bomb/ })
    expect(link.getAttribute('href')).toMatch(/#\/note\/new\?draft=/)
    expect((screen.getByLabelText('粘贴多行文本') as HTMLTextAreaElement).value).toBe('')
  })

  it('deletes a draft after confirmation', async () => {
    await db.drafts.add({ id: 'd1', raw: 'leverage', kind: 'headword', createdAt: 1 })
    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })
    fireEvent.click(await screen.findByRole('button', { name: '删除 leverage' }))
    fireEvent.click(await screen.findByRole('button', { name: '删除草稿' }))
    await waitFor(async () => expect(await db.drafts.count()).toBe(0))
    expect(await screen.findByText('收集箱是空的')).toBeTruthy()
  })

  it('paste button reads the clipboard into the textarea', async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn(async () => 'from clipboard') } })
    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })
    fireEvent.click(screen.getByRole('button', { name: '粘贴' }))
    await waitFor(() => expect((screen.getByLabelText('粘贴多行文本') as HTMLTextAreaElement).value).toBe('from clipboard'))
  })

  it('shows 未配置 without the sync card actions when cloud capture is off', async () => {
    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })
    expect(await screen.findByText('尚未配置云端收集')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '立即同步' })).toBeNull()
  })

  it('groups drafts into 来自云端 and 本机粘贴 and syncs on demand', async () => {
    await updateSettings(db, { cloud: { url: 'https://cf.example', token: 't0k' } })
    await db.drafts.bulkAdd([
      { id: 'c1', raw: 'ephemeral', kind: 'headword', origin: 'cloud', createdAt: 2 },
      { id: 'l1', raw: 'leverage', kind: 'headword', createdAt: 1 },
    ])
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/inbox/delete')) return new Response('{"ok":true}', { status: 200 })
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })
    expect(await screen.findByText('来自云端 · 1')).toBeTruthy()
    expect(screen.getByText('本机粘贴 · 1')).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: '立即同步' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await screen.findByText(/云端没有新的/)).toBeTruthy()
  })

  it('建卡成功但云端删除受限时明确告知已保存、待重试，且不会重复建卡', async () => {
    await updateSettings(db, { cloud: { url: 'https://cf.example', token: 't0k' } })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) =>
      String(input).endsWith('/inbox/delete')
        ? new Response('D1 write limit exceeded', { status: 500 })
        : new Response(JSON.stringify({ items: [
          { id: 'cloud-1', word: 'mnemo-smoke-second', meaning: '第二次联通测试', createdAt: 1 },
        ] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ))
    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })

    fireEvent.click(await screen.findByRole('button', { name: '立即同步' }))
    expect(await screen.findByText(/内容已收下，但云端没清掉/)).toBeTruthy()
    expect(screen.getByText('待清理云端')).toBeTruthy()
    expect(screen.queryByText('还没同步过')).toBeNull() // 已保存，不要同时宣称一次同步都没发生
    expect(await db.notes.count()).toBe(1)
    expect(screen.queryByRole('link', { name: /设置/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '立即同步' }))
    await waitFor(() => expect(screen.getByText(/内容已收下，但云端没清掉/)).toBeTruthy())
    expect(await db.notes.count()).toBe(1)
  })

  it('自动收下并建卡后，即使手动空拉取也能看到上次收取结果', async () => {
    await updateSettings(db, { cloud: { url: 'https://cf.example', token: 't0k' } })
    let cloudHasItem = true
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      if (String(input).endsWith('/inbox/delete')) {
        cloudHasItem = false
        return new Response('{"ok":true,"deleted":1}', { status: 200 })
      }
      return new Response(JSON.stringify({ items: cloudHasItem
        ? [{ id: 'cloud-1', word: 'mnemo-automatic-test', meaning: '自动收取测试', createdAt: 1 }]
        : [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    function AutoPull() { useCloudPull(); return null }
    render(<AutoPull />)
    await waitFor(async () => expect((await getSettings(db)).lastCloudPullAt).toBeTypeOf('number'))
    expect(await db.notes.count()).toBe(1)

    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })
    expect(await screen.findByText(/上次收取.*新建 1 条记录/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '立即同步' }))
    expect(await screen.findByText('云端没有新的')).toBeTruthy()
    expect(screen.getByText(/上次收取.*新建 1 条记录/)).toBeTruthy()
  })

  it('surfaces a 401 as a token problem with a link to settings', async () => {
    await updateSettings(db, { cloud: { url: 'https://cf.example', token: 'bad' } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"unauthorized"}', { status: 401 })))
    renderWithRouter(<Inbox />, { route: '/inbox', path: '/inbox' })
    fireEvent.click(await screen.findByRole('button', { name: '立即同步' }))
    expect(await screen.findByText(/令牌无效/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /设置/ })).toHaveAttribute('href', '/settings')
  })
})
