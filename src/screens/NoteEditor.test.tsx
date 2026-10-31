// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote } from '@/db/repo'
import { renderWithRouter } from '@/test/render'
import { NoteEditor } from './NoteEditor'

vi.mock('@/app/useAudio', () => ({
  useAudio: () => ({ accent: 'us', play: vi.fn(async () => 'youdao'), prefetch: vi.fn(async () => undefined) }),
}))

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.dict.put({ word: 'concern', phonetic: "kən'sə:n", translation: 'n. 担忧', forms: ['concerns', 'concerned'] })
})
afterEach(() => vi.restoreAllMocks())

describe('NoteEditor (new)', () => {
  it('fills from the dictionary via an inflection and offers the lemma', async () => {
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'concerns' } })
    await waitFor(() => expect(screen.getByText('已从词典补全')).toBeTruthy())
    expect((screen.getByLabelText('音标') as HTMLInputElement).value).toBe("kən'sə:n")
    expect((screen.getByLabelText('释义') as HTMLTextAreaElement).value).toBe('n. 担忧')
    fireEvent.click(screen.getByRole('button', { name: '改为原形 concern' }))
    expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern')
  })

  it('saves a note with the chosen types and auto-detected cloze', async () => {
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'concern' } })
    await waitFor(() => expect(screen.getByText('已从词典补全')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '+ 添加例句' }))
    fireEvent.change(screen.getByLabelText('例句 1'), { target: { value: 'I have some concerns about it.' } })
    expect(screen.getByRole('button', { name: 'concerns' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /保存 · 生成 3 张卡/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /保存 · 生成 3 张卡/ }))
    await waitFor(async () => expect(await db.notes.count()).toBe(1))
    const note = (await db.notes.toArray())[0]!
    expect(note.examples[0]!.blanks).toEqual([{ start: 12, end: 20 }])
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(3)
  })

  it('warns about duplicates without blocking', async () => {
    await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'Concern' } })
    await waitFor(() => expect(screen.getByText(/已有同名记录/)).toBeTruthy())
    expect((screen.getByRole('button', { name: /保存 · 生成/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('NoteEditor (edit)', () => {
  it('asks for confirmation before removing a card type and aborts on cancel', async () => {
    const note = await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['zh2en', 'en2zh'] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderWithRouter(<NoteEditor />, { route: `/note/${note.id}`, path: '/note/:id' })
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern'))
    fireEvent.click(screen.getByRole('button', { name: '中 → 英' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm.mock.calls[0]![0]).toContain('中 → 英')
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(2)
  })

  it('deletes the note after confirmation', async () => {
    const note = await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithRouter(<NoteEditor />, { route: `/note/${note.id}`, path: '/note/:id' })
    await waitFor(() => expect(screen.getByRole('button', { name: '删除这条记录' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '删除这条记录' }))
    await waitFor(async () => expect(await db.notes.count()).toBe(0))
  })
})
