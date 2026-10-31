import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db } from '@/db/db'
import { searchNotes } from '@/db/repo'
import type { BulkAction, BulkSummary } from '@/db/bulkNotes'
import { CARD_TYPES, CARD_TYPE_LABEL, type Card } from '@/domain/types'
import { noteDueSummary } from '@/lib/format'
import { useVisibilityTick } from '@/app/useVisibilityTick'
import { BulkNoteActions } from '@/components/BulkNoteActions'
import { Button } from '@/components/ui/Button'

export const SEARCH_DEBOUNCE_MS = 200
const PAGE_SIZE = 300
const SHORT: Record<(typeof CARD_TYPES)[number], string> = { zh2en: '中英', cloze: '挖空', en2zh: '英中' }

export function Cards() {
  useVisibilityTick() // 回到前台时重渲染，让到期文案按当前时间重算
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
  const [batch, setBatch] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>()
  const [error, setError] = useState<string>()
  const working = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  // 查询完整匹配集，展示分页；全选不受展示数量限制。带回查询词，防止选择旧查询结果。
  const matches = useLiveQuery(async () => ({ query: debounced, notes: await searchNotes(db, debounced, Infinity) }), [debounced])
  const notes = matches?.notes
  const searchPending = query !== debounced || !matches || matches.query !== debounced
  const locked = busy || searchPending
  const cards = useLiveQuery(() => db.cards.toArray(), [], [] as Card[])
  const totals = useLiveQuery(async () => ({ notes: await db.notes.count(), cards: await db.cards.count() }), [], { notes: 0, cards: 0 })
  const byNote = new Map<string, Card[]>()
  for (const card of cards) {
    const own = byNote.get(card.noteId) ?? []
    own.push(card)
    byNote.set(card.noteId, own)
  }
  const now = Date.now()
  const visible = notes?.slice(0, visibleLimit) ?? []
  const selectedIds = [...selected]

  function changeBusy(value: boolean) {
    working.current = value
    setBusy(value)
  }

  function clearSelection() {
    setSelected(new Set())
    setError(undefined)
    setResult(undefined)
  }

  async function selectLibrary() {
    if (locked || working.current) return
    changeBusy(true)
    setError(undefined)
    setResult(undefined)
    try {
      const all = await searchNotes(db, '', Infinity)
      // 显示完整词库，让整库选择的范围始终明确；输入搜索才会清选择。
      setQuery('')
      setDebounced('')
      setVisibleLimit(PAGE_SIZE)
      setSelected(new Set(all.map((note) => note.id)))
    } catch (e) {
      setError(`读取词库失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      changeBusy(false)
    }
  }

  function complete(summary: BulkSummary, action: BulkAction) {
    setSelected(new Set())
    setResult(action.kind === 'delete'
      ? `已删除 ${summary.notes} 个单词、${summary.deletedCards} 张卡、${summary.deletedLogs} 条复习记录`
      : `已处理 ${summary.notes} 个单词：新增 ${summary.createdCards} 张卡，删除 ${summary.deletedCards} 张卡、${summary.deletedLogs} 条复习记录；跳过 ${summary.skippedCards} 张不满足条件的卡`)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-28" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">卡片</h1>
          <p className="text-sm text-muted">{totals.notes} 条记录 · {totals.cards} 张卡</p>
        </div>
        <Button variant="ghost" disabled={busy} onClick={() => { if (!working.current) { setBatch(!batch); clearSelection() } }}>
          {batch ? '退出批量管理' : '批量管理'}
        </Button>
      </header>
      <input
        aria-label="搜索"
        type="search"
        placeholder="搜索单词、释义、例句"
        className="rounded-[10px] bg-panel px-3 py-2 text-base outline-none placeholder:text-muted"
        value={query}
        disabled={busy}
        onChange={(e) => { setQuery(e.target.value); setVisibleLimit(PAGE_SIZE); clearSelection() }}
      />
      {batch && (
        <>
          <section aria-label="批量选择" className="sticky z-10 rounded-(--radius-card) border border-line bg-panel p-3" style={{ top: 'calc(env(safe-area-inset-top) + 4px)' }}>
            <p className="text-sm font-semibold" role="status">已选 {selected.size} 个单词</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={locked || !notes?.length} onClick={() => {
                if (working.current) return
                setSelected(new Set(notes?.map((note) => note.id)))
                setResult(undefined)
              }}>全选搜索结果{!searchPending && notes ? `（${notes.length}）` : ''}</Button>
              <Button variant="ghost" disabled={locked || totals.notes === 0} onClick={() => void selectLibrary()}>选择整个词库</Button>
              <Button variant="ghost" disabled={locked || selected.size === 0} onClick={clearSelection}>清除选择</Button>
            </div>
            <p className="mt-1 text-xs text-muted">全选包含尚未展示的单词；更改搜索会清除选择。</p>
          </section>
          {selected.size > 0 && (
            <BulkNoteActions key={selectedIds.join(',')} noteIds={selectedIds} disabled={locked} onBusyChange={changeBusy} onComplete={complete} />
          )}
        </>
      )}
      {error && <p role="alert" className="text-sm text-again-fg">{error}</p>}
      {result && <p role="status" className="text-sm">{result}</p>}
      {searchPending ? <p className="text-sm text-muted">正在搜索…</p> : notes?.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{debounced ? '没有匹配的记录' : '还没有记录'}</p>
      ) : (
        <>
          <p className="text-xs text-muted">匹配 {notes?.length ?? 0} 个单词 · 已展示 {visible.length} 个</p>
          <ul className="overflow-hidden rounded-(--radius-card) bg-panel">
            {visible.map((note) => {
              const own = byNote.get(note.id) ?? []
              const enabled = new Set(own.map((card) => card.type))
              const due = noteDueSummary(own, now)
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold">{note.headword}</div>
                    <div className="truncate text-xs text-muted">{note.meaning.split('\n')[0]}</div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted">
                    <div className="mb-0.5 flex justify-end gap-1">
                      {CARD_TYPES.map((type) => (
                        <span key={type} title={CARD_TYPE_LABEL[type]} className={`rounded px-1 text-[9px] ${enabled.has(type) ? 'bg-easy-bg text-accent' : 'bg-line text-muted'}`}>{SHORT[type]}</span>
                      ))}
                    </div>
                    <span className={due === '新' ? 'text-accent' : ''}>{due}</span>
                  </div>
                </>
              )
              return (
                <li key={note.id} className="border-b border-line last:border-b-0">
                  {batch ? (
                    <label className="flex min-h-14 items-center gap-3 px-4 py-3">
                      <input type="checkbox" aria-label={`选择 ${note.headword}`} className="h-5 w-5 shrink-0 accent-accent"
                        disabled={locked} checked={selected.has(note.id)} onChange={(e) => {
                          const next = new Set(selected)
                          if (e.target.checked) next.add(note.id)
                          else next.delete(note.id)
                          setSelected(next)
                          setResult(undefined)
                        }} />
                      {content}
                    </label>
                  ) : <Link to={`/note/${note.id}`} className="flex items-center justify-between gap-3 px-4 py-3">{content}</Link>}
                </li>
              )
            })}
          </ul>
          {notes && notes.length > visible.length && (
            <Button variant="secondary" disabled={locked} onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}>显示更多（还有 {notes.length - visible.length} 个）</Button>
          )}
        </>
      )}
    </div>
  )
}
