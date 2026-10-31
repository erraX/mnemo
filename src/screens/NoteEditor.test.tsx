// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { db } from '@/db/db'
import { createNote } from '@/db/repo'
import * as dictModule from '@/lib/dict'
import { renderWithRouter } from '@/test/render'
import { NoteEditor, NoteEditorRoute, LOOKUP_DEBOUNCE_MS } from './NoteEditor'

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

describe('NoteEditor (stale lookup guard)', () => {
  it('discards a stale dict result when headword changes before it resolves', async () => {
    let resolveFirst!: (r: { entry: { word: string; phonetic: string; translation: string; forms: string[] }; viaForm: boolean } | undefined) => void
    const firstDeferred = new Promise<{ entry: { word: string; phonetic: string; translation: string; forms: string[] }; viaForm: boolean } | undefined>((res) => {
      resolveFirst = res
    })
    const spy = vi.spyOn(dictModule, 'lookupWord')
    spy.mockImplementationOnce(() => firstDeferred)                        // concern → deferred
    spy.mockImplementationOnce(() => Promise.resolve(undefined))           // leverage → miss

    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })

    // type 'concern' and wait for debounce to fire
    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'concern' } })
    await new Promise((r) => setTimeout(r, LOOKUP_DEBOUNCE_MS + 50))

    // type 'leverage' — cleanup should set cancelled=true for the in-flight concern lookup
    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'leverage' } })
    await new Promise((r) => setTimeout(r, LOOKUP_DEBOUNCE_MS + 50))

    // wait for the miss result to be reflected
    await waitFor(() => expect(screen.getByText('词典没有，手动填写')).toBeTruthy())

    // now resolve the stale first lookup — must be discarded by the cancelled flag
    resolveFirst({ entry: { word: 'concern', phonetic: "kən'sə:n", translation: 'n. 担忧', forms: [] }, viaForm: false })
    await new Promise((r) => setTimeout(r, 50))

    // stale result must not overwrite the current state
    expect((screen.getByLabelText('音标') as HTMLInputElement).value).toBe('')
    expect(screen.getByText('词典没有，手动填写')).toBeTruthy()
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

  it('shows no dictionary hints until the headword is changed, but still warns about duplicates', async () => {
    await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    const note = await createNote(db, { headword: 'concerns', meaning: 'y', examples: [], tags: [], enabledTypes: ['en2zh'] })
    await db.dict.put({ word: 'concern', phonetic: "kən'sə:n", translation: 'n. 担忧', forms: ['concerns', 'concerned'] })
    renderWithRouter(<NoteEditor />, { route: `/note/${note.id}`, path: '/note/:id' })
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concerns'))
    await new Promise((r) => setTimeout(r, LOOKUP_DEBOUNCE_MS + 50))
    expect(screen.queryByText('已从词典补全')).toBeNull()
    expect(screen.queryByRole('button', { name: /改为原形/ })).toBeNull()
    expect((screen.getByLabelText('释义') as HTMLTextAreaElement).value).toBe('y')

    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'concern' } })
    await waitFor(() => expect(screen.getByText(/已有同名记录/)).toBeTruthy())
    expect(screen.getByText('已从词典补全')).toBeTruthy()
  })

  it('goes back to the previous screen after save when there is history, else home', async () => {
    const note = await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    const routes = (
      <Routes>
        <Route path="/" element={<div data-testid="home" />} />
        <Route path="/cards" element={<div data-testid="cards" />} />
        <Route path="/note/:id" element={<NoteEditor />} />
      </Routes>
    )
    const first = render(<MemoryRouter initialEntries={['/cards', `/note/${note.id}`]}>{routes}</MemoryRouter>)
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern'))
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await screen.findByTestId('cards')
    first.unmount()

    render(<MemoryRouter initialEntries={[`/note/${note.id}`]}>{routes}</MemoryRouter>)
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern'))
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await screen.findByTestId('home')
  })

  it('NoteEditorRoute remounts the editor when the id changes', async () => {
    const a = await createNote(db, { headword: 'concern', meaning: 'aaa', examples: [], tags: [], enabledTypes: ['en2zh'] })
    await createNote(db, { headword: 'concern', meaning: 'bbb', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<NoteEditorRoute />, { route: `/note/${a.id}`, path: '/note/:id' })
    await waitFor(() => expect((screen.getByLabelText('释义') as HTMLTextAreaElement).value).toBe('aaa'))
    const view = await screen.findByRole('link', { name: '查看' })
    fireEvent.click(view)
    // 换了 id 就是新的编辑器：不会带着 A 的表单（保存可用）等 B 加载
    expect((screen.getByRole('button', { name: '保存修改' }) as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() => expect((screen.getByLabelText('释义') as HTMLTextAreaElement).value).toBe('bbb'))
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

describe('NoteEditor (draft prefill)', () => {
  it('prefills a headword draft and deletes it on save', async () => {
    await db.drafts.add({ id: 'd1', raw: 'concern', kind: 'headword', createdAt: 1 })
    renderWithRouter(<NoteEditor />, { route: '/note/new?draft=d1', path: '/note/new' })
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern'))
    await waitFor(() => expect(screen.getByText('已从词典补全')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /保存 · 生成/ }))
    await waitFor(async () => expect(await db.notes.count()).toBe(1))
    expect(await db.drafts.count()).toBe(0)
  })

  it('a sentence draft asks to pick the headword from its words', async () => {
    await db.drafts.add({ id: 'd2', raw: 'I have some concerns about it.', kind: 'sentence', createdAt: 1 })
    renderWithRouter(<NoteEditor />, { route: '/note/new?draft=d2', path: '/note/new' })
    expect(await screen.findByText('点一个词作为要记的词')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '选 concerns' }))
    expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concerns')
    expect(screen.queryByText('点一个词作为要记的词')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: '改为原形 concern' })).toBeTruthy())
    expect(screen.getByRole('button', { name: 'concerns' }).getAttribute('aria-pressed')).toBe('true')
  })
})
