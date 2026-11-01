// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter, Route, Routes } from 'react-router'
import { db } from '@/db/db'
import { renderWithRouter } from '@/test/render'
import { Inbox } from './Inbox'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.dict.put({ word: 'concern', phonetic: '', translation: 'n. 担忧', forms: ['concerns'] })
})
afterEach(() => vi.restoreAllMocks())

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
})
