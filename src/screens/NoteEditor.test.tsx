// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { db } from '@/db/db'
import { createNote, updateSettings } from '@/db/repo'
import * as repo from '@/db/repo'
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
    renderWithRouter(<NoteEditor />, { route: `/note/${note.id}`, path: '/note/:id' })
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern'))
    fireEvent.click(screen.getByRole('button', { name: '中 → 英' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    // 先摊开影响面：关哪个卡型、几张卡、几条复习记录
    expect(await screen.findByText('关闭 中 → 英')).toBeTruthy()
    expect(screen.getByText('1 张卡 · 0 条复习记录')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    await waitFor(() => expect(screen.queryByText('关闭 中 → 英')).toBeNull())
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(2)
  })

  it('saves after the card-type removal is confirmed', async () => {
    const note = await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['zh2en', 'en2zh'] })
    renderWithRouter(<NoteEditor />, { route: `/note/${note.id}`, path: '/note/:id' })
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern'))
    fireEvent.click(screen.getByRole('button', { name: '中 → 英' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    fireEvent.click(await screen.findByRole('button', { name: '关闭并保存' }))
    await waitFor(async () => expect(await db.cards.where('noteId').equals(note.id).count()).toBe(1))
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
    renderWithRouter(<NoteEditor />, { route: `/note/${note.id}`, path: '/note/:id' })
    await waitFor(() => expect(screen.getByRole('button', { name: '删除这条记录' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '删除这条记录' }))
    expect(await screen.findByText('「concern」及其 1 张卡')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(async () => expect(await db.notes.count()).toBe(0))
  })
})

describe('NoteEditor (leaving)', () => {
  const routes = (
    <Routes>
      <Route path="/" element={<div data-testid="home" />} />
      <Route path="/note/new" element={<NoteEditor />} />
      <Route path="/note/:id" element={<NoteEditor />} />
    </Routes>
  )

  it('asks before throwing away a filled form', async () => {
    render(<MemoryRouter initialEntries={['/note/new']}>{routes}</MemoryRouter>)
    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'concern' } })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(await screen.findByText('这条卡还没保存')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern')
    expect(screen.queryByTestId('home')).toBeNull()
  })

  it('leaves without asking when nothing was typed', async () => {
    render(<MemoryRouter initialEntries={['/note/new']}>{routes}</MemoryRouter>)
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe(''))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(await screen.findByTestId('home')).toBeTruthy()
    expect(screen.queryByText('这条卡还没保存')).toBeNull()
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

describe('NoteEditor (polish)', () => {
  it('shows a not-found state for an unknown id', async () => {
    renderWithRouter(<NoteEditor />, { route: '/note/nope', path: '/note/:id' })
    expect(await screen.findByText('记录不存在')).toBeTruthy()
    expect(screen.queryByLabelText('单词 / 短语')).toBeNull()
  })
  it('suggests existing tags and appends on tap', async () => {
    await createNote(db, { headword: 'leverage', meaning: 'x', examples: [], tags: ['biz', 'cet4'], enabledTypes: ['en2zh'] })
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.click(await screen.findByRole('button', { name: '添加标签 biz' }))
    expect((screen.getByLabelText('标签') as HTMLInputElement).value).toBe('biz')
    fireEvent.click(screen.getByRole('button', { name: '添加标签 cet4' }))
    expect((screen.getByLabelText('标签') as HTMLInputElement).value).toBe('biz, cet4')
    expect(screen.queryByRole('button', { name: '添加标签 biz' })).toBeNull()
  })
  it('explains every unavailable card type, selected or not', async () => {
    // 默认勾选全部三种卡型会让旧过滤条件（仅已选中）也通过；只勾选 zh2en 才能覆盖“未选中也显示原因”
    await updateSettings(db, { lastEnabledTypes: ['zh2en'] })
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    await screen.findByLabelText('单词 / 短语')
    await waitFor(() => expect(screen.getByRole('button', { name: /英 → 中/ }).getAttribute('aria-pressed')).toBe('false'))
    expect(screen.getByRole('button', { name: /例句挖空/ }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText(/例句挖空：先给一条例句并挖一个空/)).toBeTruthy()
    expect(screen.getByText(/英 → 中：先填写单词或短语/)).toBeTruthy()
  })
  it('shows an inline error when saving fails', async () => {
    vi.spyOn(repo, 'createNote').mockRejectedValueOnce(new Error('disk full'))
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.change(await screen.findByLabelText('单词 / 短语'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /保存 · 生成/ }))
    expect(await screen.findByText('操作失败：disk full')).toBeTruthy()
  })
})
