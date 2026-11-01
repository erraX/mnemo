// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote, gradeCard, importNotes } from '@/db/repo'
import * as bulk from '@/db/bulkNotes'
import { renderWithRouter } from '@/test/render'
import { Cards } from './Cards'

beforeEach(async () => { await db.delete(); await db.open() })
afterEach(() => { vi.restoreAllMocks() })

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

const input = {
  headword: 'concern', meaning: '担忧', examples: [{ text: 'I have concerns.', blanks: [{ start: 7, end: 15 }] }],
  tags: [], enabledTypes: ['zh2en', 'cloze', 'en2zh'] as ('zh2en' | 'cloze' | 'en2zh')[],
}

async function openBatch() {
  renderWithRouter(<Cards />, { route: '/cards', path: '/cards' })
  await screen.findAllByRole('link', { name: /concern/ })
  fireEvent.click(await screen.findByRole('button', { name: '批量管理' }))
  await screen.findByRole('region', { name: '批量选择' })
}

function selectAll() {
  fireEvent.click(screen.getByRole('button', { name: /全选搜索结果/ }))
}

function previewClozeRemoval() {
  fireEvent.click(screen.getByRole('button', { name: '编辑卡片类型' }))
  fireEvent.change(screen.getByRole('combobox', { name: '例句挖空操作' }), { target: { value: 'disable' } })
  fireEvent.click(screen.getByRole('button', { name: '预览卡型修改' }))
}

describe('Cards bulk management', () => {
  it('selects individual words, previews deletion without writes, cancels, and clears selection on exit', async () => {
    await createNote(db, input)
    await createNote(db, { ...input, headword: 'other' })
    await openBatch()
    expect(screen.queryByRole('link', { name: /concern/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 concern' }))
    expect(screen.getByText('已选 1 条记录')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^删除 \d+ 条记录$/
  }))
    const preview = await screen.findByRole('alertdialog')
    expect(within(preview).getByText('涉及 1 条记录')).toBeInTheDocument()
    expect(within(preview).getByText('删除 3 张卡 · 0 条复习记录')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消操作' }))
    expect(await db.notes.count()).toBe(2)
    expect(await db.cards.count()).toBe(6)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '退出批量管理' }))
    expect(screen.getAllByRole('link')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '批量管理' }))
    expect(screen.getByText('已选 0 条记录')).toBeInTheDocument()
  })

  it('defaults to keeping all types, then removes cloze only after confirmation and preserves other progress', async () => {
    const note = await createNote(db, input)
    const cards = await db.cards.toArray()
    await gradeCard(db, cards.find((card) => card.type === 'zh2en')!.id, 3)
    const kept = (await db.cards.toArray()).filter((card) => card.type !== 'cloze')
    await openBatch()
    selectAll()
    fireEvent.click(screen.getByRole('button', { name: '编辑卡片类型' }))
    expect(screen.getAllByRole('combobox').every((select) => (select as HTMLSelectElement).value === 'keep')).toBe(true)
    expect(screen.getByRole('button', { name: '预览卡型修改' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: '例句挖空操作' }), { target: { value: 'disable' } })
    fireEvent.click(screen.getByRole('button', { name: '预览卡型修改' }))
    await screen.findByRole('region', { name: '批量操作预览' })
    expect(await db.cards.count()).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: '确认修改卡片类型' }))
    expect(await screen.findByText(/已处理 1 条记录：新增 0 张卡，删除 1 张卡/)).toBeInTheDocument()
    expect(await db.cards.toArray()).toEqual(kept)
    expect((await db.notes.get(note.id))?.enabledTypes).toEqual(['zh2en', 'en2zh'])
    expect(screen.getByText('已选 0 条记录')).toBeInTheDocument()
  })

  it('clears selection immediately on search changes, disables selection during debounce and selects only matching words', async () => {
    await createNote(db, input)
    await createNote(db, { ...input, headword: 'other', meaning: '别的', examples: [] })
    await openBatch()
    selectAll()
    expect(screen.getByText('已选 2 条记录')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: 'concern' } })
    expect(screen.getByText('已选 0 条记录')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /全选搜索结果/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^删除 \d+ 条记录$/
  })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(1))
    selectAll()
    expect(screen.getByText('已选 1 条记录')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除选择' }))
    expect(screen.getByText('已选 0 条记录')).toBeInTheDocument()
  })

  it('selects the entire library from a filtered list and supports clearing it for reimport', async () => {
    await createNote(db, input)
    await createNote(db, { ...input, headword: 'other', meaning: '别的', examples: [] })
    await openBatch()
    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: 'concern' } })
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: /选择整个词库/ }))
    await screen.findByText('已选 2 条记录')
    await waitFor(() => expect(screen.getByRole('button', { name: /^删除 \d+ 条记录$/
  })).toBeEnabled())
    expect(screen.getByLabelText('搜索')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: /^删除 \d+ 条记录$/
  }))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除 2 条记录' }))
    await screen.findByText('已删除 2 条记录、5 张卡、0 条复习记录')
    expect(await db.notes.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    await importNotes(db, [input])
    expect(await db.notes.count()).toBe(1)
  })

  it('selects all matching results beyond the 300 displayed rows and deletes them without touching nonmatches', async () => {
    await importNotes(db, Array.from({ length: 305 }, (_, i) => ({ ...input, headword: `concern-${i}` })))
    const other = await createNote(db, { ...input, headword: 'other', meaning: '别的', examples: [] })
    await openBatch()
    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: 'concern-' } })
    await screen.findByText('匹配 305 条记录 · 已展示 300 条')
    expect(screen.getAllByRole('checkbox')).toHaveLength(300)
    selectAll()
    expect(screen.getByText('已选 305 条记录')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '显示更多（还有 5 个）' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(305)
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true)
    const actions = within(screen.getByRole('region', { name: '批量操作' }))
    // 等待真实数据库操作，避免在 300+ 行上反复做昂贵的角色查询，饿死 fake-indexeddb 的异步任务。
    const preview = vi.spyOn(bulk, 'planBulkNotes')
    await act(async () => {
      fireEvent.click(actions.getByRole('button', { name: /^删除 \d+ 条记录$/ }))
      await waitFor(() => expect(preview).toHaveBeenCalledTimes(1))
      await preview.mock.results[0]!.value
    })
    const confirm = actions.getByRole('button', { name: '确认删除 305 条记录' })
    expect(confirm).toBeEnabled()
    const apply = vi.spyOn(bulk, 'applyBulkNotes')
    await act(async () => {
      fireEvent.click(confirm)
      await waitFor(() => expect(apply).toHaveBeenCalledTimes(1))
      await apply.mock.results[0]!.value
    })
    expect(screen.getByText('已删除 305 条记录、915 张卡、0 条复习记录')).toBeInTheDocument()
    expect(await db.notes.toArray()).toEqual([other])
  }, 15_000) // CI 上给完整大词库场景留余量；不替换数据库操作或降低断言。

  it('invalidates previews when either the selection or the type changes', async () => {
    await createNote(db, input)
    await createNote(db, { ...input, headword: 'other' })
    await openBatch()
    selectAll()
    previewClozeRemoval()
    await screen.findByRole('region', { name: '批量操作预览' })
    fireEvent.change(screen.getByRole('combobox', { name: '英 → 中操作' }), { target: { value: 'disable' } })
    expect(screen.queryByRole('region', { name: '批量操作预览' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '预览卡型修改' }))
    await screen.findByRole('region', { name: '批量操作预览' })
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 other' }))
    expect(screen.queryByRole('region', { name: '批量操作预览' })).not.toBeInTheDocument()
    expect(screen.getByText('已选 1 条记录')).toBeInTheDocument()
    expect(await db.cards.count()).toBe(6)
  })

  it('enables missing types and reports skipped cards whose cloze prerequisites are missing', async () => {
    await createNote(db, { ...input, enabledTypes: ['en2zh'] })
    await createNote(db, { ...input, headword: 'other', examples: [], enabledTypes: ['en2zh'] })
    await openBatch()
    selectAll()
    fireEvent.click(screen.getByRole('button', { name: '编辑卡片类型' }))
    fireEvent.change(screen.getByRole('combobox', { name: '例句挖空操作' }), { target: { value: 'enable' } })
    fireEvent.click(screen.getByRole('button', { name: '预览卡型修改' }))
    const preview = await screen.findByRole('region', { name: '批量操作预览' })
    expect(within(preview).getByText('新增 1 张卡')).toBeInTheDocument()
    expect(within(preview).getByText(/1 张卡因缺少例句挖空等必要内容/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认修改卡片类型' }))
    await screen.findByText(/已处理 2 条记录：新增 1 张卡，删除 0 张卡、0 条复习记录；跳过 1 张/)
    expect(await db.cards.count()).toBe(3)
  })

  it('reports a failure with no writes, discards the preview and lets the user retry', async () => {
    await createNote(db, input)
    await openBatch()
    selectAll()
    previewClozeRemoval()
    await screen.findByRole('region', { name: '批量操作预览' })
    vi.spyOn(bulk, 'applyBulkNotes').mockRejectedValueOnce(new Error('disk full'))
    fireEvent.click(screen.getByRole('button', { name: '确认修改卡片类型' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('disk full')
    expect(await db.cards.count()).toBe(3)
    expect(screen.queryByRole('region', { name: '批量操作预览' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '预览卡型修改' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认修改卡片类型' }))
    await screen.findByText(/已处理 1 条记录：新增 0 张卡，删除 1 张卡/)
    expect(await db.cards.count()).toBe(2)
  })

  it('blocks duplicate submissions and selection/search while execution is pending', async () => {
    await createNote(db, input)
    await openBatch()
    selectAll()
    fireEvent.click(screen.getByRole('button', { name: /^删除 \d+ 条记录$/
  }))
    const confirm = await screen.findByRole('button', { name: '确认删除 1 条记录' })
    const original = bulk.applyBulkNotes
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const apply = vi.spyOn(bulk, 'applyBulkNotes').mockImplementationOnce(async (...args) => { await gate; return original(...args) })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    expect(screen.getByLabelText('搜索')).toBeDisabled()
    expect(screen.getByRole('button', { name: '退出批量管理' })).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeDisabled()
    await act(async () => { release() })
    await screen.findByText('已删除 1 条记录、3 张卡、0 条复习记录')
  })

  it('requires another preview if the selected data changed after confirmation was prepared', async () => {
    const note = await createNote(db, input)
    await openBatch()
    selectAll()
    fireEvent.click(screen.getByRole('button', { name: /^删除 \d+ 条记录$/
  }))
    const confirm = await screen.findByRole('button', { name: '确认删除 1 条记录' })
    await act(async () => { await db.notes.update(note.id, { meaning: '改过' }) })
    fireEvent.click(confirm)
    expect(await screen.findByRole('alert')).toHaveTextContent('所选数据已变化，请重新预览后确认')
    expect(await db.notes.count()).toBe(1)
    expect(screen.queryByRole('region', { name: '批量操作预览' })).not.toBeInTheDocument()
  })
})
