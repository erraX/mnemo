// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote, gradeCard } from '@/db/repo'
import { renderWithRouter } from '@/test/render'
import { Review } from './Review'

const play = vi.fn(async () => 'youdao' as const)
vi.mock('@/app/useAudio', () => ({ useAudio: () => ({ accent: 'us', play, prefetch: vi.fn(async () => undefined) }) }))

beforeEach(async () => { await db.delete(); await db.open(); play.mockClear() })
afterEach(() => vi.restoreAllMocks())

describe('Review', () => {
  it('reveals, grades, auto-plays on reveal, and reaches the done page', async () => {
    await createNote(db, { headword: 'concern', meaning: 'n. 担忧', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    await screen.findByRole('button', { name: '看答案' })
    expect(screen.getByText('剩余 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '看答案' }))
    expect(play).toHaveBeenCalledWith('concern')
    const easy = await screen.findByRole('button', { name: /简单/ })
    expect(easy.textContent).toMatch(/天/)
    fireEvent.click(easy)
    await screen.findByText('今天的复习完成了')
    expect(screen.getByText('1', { selector: '[data-stat="reviewed"]' })).toBeTruthy()
    expect(await db.reviewLogs.count()).toBe(1)
  })

  it('tapping the card flips it (and auto-plays), but the front play button does not flip', async () => {
    await createNote(db, { headword: 'concern', meaning: 'n. 担忧', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    await screen.findByText('这个词什么意思')
    fireEvent.click(screen.getByRole('button', { name: '播放发音' }))
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.getByText('这个词什么意思')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /简单/ })).toBeNull()

    fireEvent.click(screen.getByText('这个词什么意思'))
    await screen.findByRole('button', { name: /简单/ })
    expect(play).toHaveBeenCalledTimes(2)
    expect(play).toHaveBeenLastCalledWith('concern')
  })

  it('undo restores the card and the counter', async () => {
    // 今天早些时候已经复习过一张（不在本次会话里）：完成页计数要算上它
    const earlier = await createNote(db, { headword: 'earlier', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] }, Date.now() - 2000)
    const [earlierCard] = await db.cards.where('noteId').equals(earlier.id).toArray()
    await gradeCard(db, earlierCard!.id, 4)
    await createNote(db, { headword: 'concern', meaning: 'n. 担忧', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    fireEvent.click(await screen.findByRole('button', { name: '看答案' }))
    fireEvent.click(await screen.findByRole('button', { name: /简单/ }))
    await screen.findByText('今天的复习完成了')
    await waitFor(() => expect(screen.getByText('2', { selector: '[data-stat="reviewed"]' })).toBeTruthy())
    expect(screen.getByText('2', { selector: '[data-stat="learned"]' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '撤销上一步' }))
    await screen.findByRole('button', { name: '看答案' })
    expect(await db.reviewLogs.count()).toBe(1)

    // 计数来自今日日志：撤销后再打一次仍是 2，不是会话累计
    fireEvent.click(screen.getByRole('button', { name: '看答案' }))
    fireEvent.click(await screen.findByRole('button', { name: /简单/ }))
    await screen.findByText('今天的复习完成了')
    await waitFor(() => expect(screen.getByText('2', { selector: '[data-stat="reviewed"]' })).toBeTruthy())
    expect(await db.reviewLogs.count()).toBe(2)
  })

  it('shows a breather after 20 grades when cards remain', async () => {
    await db.settings.put({ id: 'settings', newCardsPerDay: 30, accent: 'us', autoPlayOnReveal: false, lastEnabledTypes: ['en2zh'] })
    for (let i = 0; i < 21; i += 1) {
      await createNote(db, { headword: `w${i}`, meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] }, Date.now() - (21 - i) * 1000)
    }
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(await screen.findByRole('button', { name: '看答案' }))
      fireEvent.click(await screen.findByRole('button', { name: /简单/ }))
    }
    await screen.findByText('已复习 20 张')
    expect(screen.getByText('还剩 1 张')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    await screen.findByRole('button', { name: '看答案' })
  })

  it('shows "没有更多新卡了" toast and records extraNew=10 when no new cards remain', async () => {
    await createNote(db, { headword: 'concern', meaning: 'n. 担忧', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    fireEvent.click(await screen.findByRole('button', { name: '看答案' }))
    fireEvent.click(await screen.findByRole('button', { name: /简单/ }))
    await screen.findByText('今天的复习完成了')
    fireEvent.click(screen.getByRole('button', { name: '再学 10 张新卡' }))
    await screen.findByText('没有更多新卡了')
    expect((await db.settings.get('settings'))?.extraNew?.count).toBe(10)
  })

  it('"再学 10 张新卡" pulls cards beyond the daily limit', async () => {
    await db.settings.put({ id: 'settings', newCardsPerDay: 1, accent: 'us', autoPlayOnReveal: false, lastEnabledTypes: ['en2zh'] })
    await createNote(db, { headword: 'a', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] }, Date.now() - 2000)
    await createNote(db, { headword: 'b', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] }, Date.now() - 1000)
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    fireEvent.click(await screen.findByRole('button', { name: '看答案' }))
    fireEvent.click(await screen.findByRole('button', { name: /简单/ }))
    await screen.findByText('今天的复习完成了')
    fireEvent.click(screen.getByRole('button', { name: '再学 10 张新卡' }))
    await screen.findByRole('button', { name: '看答案' })
    expect(screen.getByText('剩余 1')).toBeTruthy()
  })
})
