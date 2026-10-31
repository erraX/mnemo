// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote } from '@/db/repo'
import { renderWithRouter } from '@/test/render'
import { Cards } from './Cards'

beforeEach(async () => { await db.delete(); await db.open() })

describe('Cards', () => {
  it('lists notes newest first with meaning, enabled types and due summary; search filters', async () => {
    await createNote(db, { headword: 'leverage', meaning: 'n. 杠杆作用\nv. 利用', examples: [], tags: [], enabledTypes: ['en2zh'] }, Date.now() - 1000)
    await createNote(db, { headword: 'concern', meaning: 'n. 担忧', examples: [{ text: 'I have concerns.', blanks: [{ start: 7, end: 15 }] }], tags: [], enabledTypes: ['zh2en', 'cloze', 'en2zh'] }, Date.now())
    renderWithRouter(<Cards />, { route: '/cards', path: '/cards' })
    const rows = await screen.findAllByRole('link')
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('concern'), expect.stringContaining('leverage')])
    expect(screen.getByText('n. 杠杆作用')).toBeTruthy()           // 只显示首行
    expect(screen.getByText('2 条记录 · 4 张卡')).toBeTruthy()
    expect(screen.getAllByText('新')).toHaveLength(2)
    expect(rows[0]!.getAttribute('href')).toMatch(/\/note\//)

    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: '杠杆' } })
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1))
    expect(screen.getByText('leverage')).toBeTruthy()
  })

  it('shows an empty state', async () => {
    renderWithRouter(<Cards />, { route: '/cards', path: '/cards' })
    expect(await screen.findByText('还没有记录')).toBeTruthy()
  })
})
