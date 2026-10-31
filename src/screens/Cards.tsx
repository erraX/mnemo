import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db } from '@/db/db'
import { searchNotes } from '@/db/repo'
import { CARD_TYPES, CARD_TYPE_LABEL, type Card } from '@/domain/types'
import { noteDueSummary } from '@/lib/format'
import { useVisibilityTick } from '@/app/useVisibilityTick'

export const SEARCH_DEBOUNCE_MS = 200

const SHORT: Record<(typeof CARD_TYPES)[number], string> = { zh2en: '中英', cloze: '挖空', en2zh: '英中' }

export function Cards() {
  useVisibilityTick() // 回到前台时重渲染，让到期文案按当前时间重算
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const notes = useLiveQuery(() => searchNotes(db, debounced), [debounced])
  const cards = useLiveQuery(() => db.cards.toArray(), [], [] as Card[])
  const totals = useLiveQuery(async () => ({ notes: await db.notes.count(), cards: await db.cards.count() }), [], { notes: 0, cards: 0 })
  const byNote = new Map<string, Card[]>()
  for (const c of cards) byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c])
  const now = Date.now()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-28" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">卡片</h1>
        <p className="text-sm text-muted">{totals.notes} 条记录 · {totals.cards} 张卡</p>
      </header>
      <input
        aria-label="搜索"
        type="search"
        placeholder="搜索单词、释义、例句"
        className="rounded-[10px] bg-panel px-3 py-2 text-base outline-none placeholder:text-muted"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {notes === undefined ? null : notes.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{debounced ? '没有匹配的记录' : '还没有记录'}</p>
      ) : (
        <ul className="overflow-hidden rounded-(--radius-card) bg-panel">
          {notes.map((n) => {
            const own = byNote.get(n.id) ?? []
            const enabled = new Set(own.map((c) => c.type))
            return (
              <li key={n.id} className="border-b border-line last:border-b-0">
                <Link to={`/note/${n.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{n.headword}</div>
                    <div className="truncate text-xs text-muted">{n.meaning.split('\n')[0]}</div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted">
                    <div className="mb-0.5 flex justify-end gap-1">
                      {CARD_TYPES.map((t) => (
                        <span key={t} title={CARD_TYPE_LABEL[t]} className={`rounded px-1 text-[9px] ${enabled.has(t) ? 'bg-easy-bg text-accent' : 'bg-line text-muted'}`}>{SHORT[t]}</span>
                      ))}
                    </div>
                    <span className={noteDueSummary(own, now) === '新' ? 'text-accent' : ''}>{noteDueSummary(own, now)}</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
