// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import * as repo from '@/db/repo'
import { prefetchHeadwords } from '@/lib/prefetchAll'
import { MAX_IMPORT_BYTES } from '@/lib/vocabularyImport'
import { renderWithRouter } from '@/test/render'
import { Import } from './Import'

vi.mock('@/lib/prefetchAll', () => ({ prefetchHeadwords: vi.fn(async () => undefined) }))

const csv = 'Word/Phrase\tTranslation\tIPA\tExample\nconcern\t担忧\tkən\t"* A concern.\n* I have concerns."\nfrontier\t边境\t\t'
const choose = (text = csv) => fireEvent.change(screen.getByLabelText('选择词库文件'), {
  target: { files: [new File([text], 'vocably.csv', { type: 'text/csv' })] },
})
const setup = () => renderWithRouter(<Import />, { route: '/import', path: '/import' })

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(prefetchHeadwords).mockReset().mockResolvedValue(undefined)
  await db.delete(); await db.open()
})

describe('vocabulary import screen', () => {
  it('previews without writing, then imports on confirmation and prefetches only new words', async () => {
    await repo.createNote(db, { headword: 'Concern', meaning: '保留', examples: [], tags: [], enabledTypes: ['en2zh'] })
    setup()
    choose()
    expect(await screen.findByText('识别格式：Vocably')).toBeTruthy()
    expect(screen.getByText('共 2 条 · 重复 1 条 · 无效 0 条')).toBeTruthy()
    expect(screen.getByText('将新增 1 条记录 · 2 张卡')).toBeTruthy()
    expect(screen.getByText('frontier')).toBeTruthy()
    expect(await db.notes.count()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '导入 1 条' }))
    expect(await screen.findByText('已导入 1 条记录 · 2 张卡；跳过 1 条重复、0 条无效记录')).toBeTruthy()
    expect(await db.notes.count()).toBe(2)
    expect((await repo.findDuplicate(db, 'concern'))?.meaning).toBe('保留')
    await waitFor(() => expect(prefetchHeadwords).toHaveBeenCalledWith(['frontier'], 'us'))
  })

  it('creates cloze cards and does not let audio failure undo a successful import', async () => {
    vi.mocked(prefetchHeadwords).mockRejectedValueOnce(new Error('offline'))
    setup(); choose()
    fireEvent.click(await screen.findByRole('button', { name: '导入 2 条' }))
    expect(await screen.findByText('已导入 2 条记录 · 5 张卡；跳过 0 条重复、0 条无效记录')).toBeTruthy()
    expect(await db.cards.count()).toBe(5)
    const note = await repo.findDuplicate(db, 'concern')
    expect(note?.examples.map((e) => e.text)).toEqual(['A concern.', 'I have concerns.'])
    expect(note?.enabledTypes).toContain('cloze')
  })

  it('reports invalid records and internal duplicates and disables import when none are new', async () => {
    setup()
    choose('Word/Phrase,Translation\nhello,你好\nHELLO,您好\n,无词\nempty,')
    expect(await screen.findByText('共 4 条 · 重复 1 条 · 无效 2 条')).toBeTruthy()
    expect(screen.getByText('无效记录序号：3、4（词头或释义为空，将跳过）')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '导入 1 条' }))
    await screen.findByText('已导入 1 条记录 · 2 张卡；跳过 1 条重复、2 条无效记录')
    choose('Word/Phrase,Translation\nhello,你好')
    expect(await screen.findByRole('button', { name: '没有可新增的词条' })).toBeDisabled()
    expect(await db.notes.count()).toBe(1)
    choose('Word/Phrase,Translation\n,空词\nempty,')
    expect(await screen.findByText('共 2 条 · 重复 0 条 · 无效 2 条')).toBeTruthy()
    expect(screen.getByRole('button', { name: '没有可新增的词条' })).toBeDisabled()
  })

  it('shows parse errors without writing and clears the previous preview', async () => {
    setup(); choose()
    await screen.findByRole('button', { name: '导入 2 条' })
    choose('bad file')
    expect(await screen.findByRole('alert')).toHaveTextContent('暂不支持')
    expect(screen.queryByRole('button', { name: '导入 2 条' })).toBeNull()
    expect(await db.notes.count()).toBe(0)
    choose('Word/Phrase,Translation\nhello,"broken')
    expect(await screen.findByRole('alert')).toHaveTextContent('文件格式损坏')
  })

  it('keeps preview after a write error so the same file can be retried', async () => {
    vi.spyOn(repo, 'importNotes').mockRejectedValueOnce(new Error('disk error'))
    setup(); choose()
    fireEvent.click(await screen.findByRole('button', { name: '导入 2 条' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('导入失败，未写入任何词条，请重试')
    expect(await db.notes.count()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: '导入 2 条' }))
    expect(await screen.findByText('已导入 2 条记录 · 5 张卡；跳过 0 条重复、0 条无效记录')).toBeTruthy()
  })

  it('rechecks duplicates after preview and guards rapid double confirmation', async () => {
    setup(); choose()
    const button = await screen.findByRole('button', { name: '导入 2 条' })
    await repo.createNote(db, { headword: 'concern', meaning: 'other', examples: [], tags: [], enabledTypes: ['en2zh'] })
    fireEvent.click(button); fireEvent.click(button)
    expect(await screen.findByText('已导入 1 条记录 · 2 张卡；跳过 1 条重复、0 条无效记录')).toBeTruthy()
    expect(await db.notes.count()).toBe(2)
    expect(await db.cards.count()).toBe(3)
  })

  it('does not continue a pending file read after leaving the page', async () => {
    const preview = vi.spyOn(repo, 'previewNoteImport')
    const view = setup()
    let finish!: (text: string) => void
    const pending = new File(['pending'], 'pending.csv')
    Object.defineProperty(pending, 'text', { value: () => new Promise<string>((resolve) => { finish = resolve }) })
    fireEvent.change(screen.getByLabelText('选择词库文件'), { target: { files: [pending] } })
    expect(screen.getByRole('status')).toHaveTextContent('正在读取文件')
    view.unmount()
    finish(csv)
    // 等读取 promise 的继续执行机会，卸载后不再查询预览或写库。
    await Promise.resolve()
    expect(preview).not.toHaveBeenCalled()
    expect(await db.notes.count()).toBe(0)
  })

  it('rejects oversized files before reading and reports read errors', async () => {
    setup()
    const file = new File(['small'], 'large.csv')
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 })
    fireEvent.change(screen.getByLabelText('选择词库文件'), { target: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('文件不能超过 5 MB')
    const unreadable = new File(['small'], 'bad.csv')
    Object.defineProperty(unreadable, 'text', { value: () => Promise.reject(new Error('read failed')) })
    fireEvent.change(screen.getByLabelText('选择词库文件'), { target: { files: [unreadable] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('读取文件失败，请重试')
    expect(await db.notes.count()).toBe(0)
  })
})
