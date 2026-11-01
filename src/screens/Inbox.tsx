import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { db } from '@/db/db'
import { addDrafts, deleteDraft } from '@/db/repo'
import type { Draft } from '@/domain/types'
import { lookupWord } from '@/lib/dict'
import { splitPaste } from '@/lib/inbox'
import { Button } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { SheetHeader } from '@/components/ui/SheetHeader'

type DictStatus = 'hit' | 'miss'

function statusLine(d: Draft, dict: DictStatus | undefined): string {
  if (d.kind === 'sentence') return '像是句子 · 点一个词作为要记的词'
  if (dict === 'hit') return '词典已补全 · 缺例句'
  if (dict === 'miss') return '词典没有 · 需要自己写释义'
  return '查询中…'
}

function badge(d: Draft, dict: DictStatus | undefined): { text: string; cls: string } {
  if (d.kind === 'sentence') return { text: '待指定', cls: 'bg-hard-bg text-hard-fg' }
  if (dict === 'hit') return { text: '可直接存', cls: 'bg-good-bg text-good-fg' }
  return { text: '待补全', cls: 'bg-hard-bg text-hard-fg' }
}

export function Inbox() {
  const navigate = useNavigate()
  const drafts = useLiveQuery(() => db.drafts.orderBy('createdAt').toArray(), [], [] as Draft[])
  const [text, setText] = useState('')
  const [dict, setDict] = useState<Record<string, DictStatus>>({})
  const [error, setError] = useState<string | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<Draft | undefined>(undefined)
  const [deleting, setDeleting] = useState(false)

  // 后台查词典：只查还没结果的 headword 草稿
  useEffect(() => {
    let cancelled = false
    const pending = drafts.filter((d) => d.kind === 'headword' && dict[d.id] === undefined)
    if (pending.length === 0) return
    void Promise.all(pending.map(async (d) => [d.id, (await lookupWord(db, d.raw)) ? 'hit' : 'miss'] as const)).then((pairs) => {
      if (!cancelled) setDict((prev) => ({ ...prev, ...Object.fromEntries(pairs) }))
    })
    return () => { cancelled = true }
  }, [drafts, dict])

  async function paste() {
    try {
      const clip = await navigator.clipboard.readText()
      setText((t) => (t ? `${t}\n${clip}` : clip))
      setError(undefined)
    } catch {
      setError('读取剪贴板失败，请长按文本框手动粘贴')
    }
  }

  async function submit() {
    const lines = splitPaste(text)
    if (lines.length === 0) return
    await addDrafts(db, lines)
    setText('')
  }

  async function remove(d: Draft) {
    setDeleting(true)
    try {
      await deleteDraft(db, d.id)
    } finally {
      setDeleting(false)
      setPendingDelete(undefined)
    }
  }

  return (
    <div className="min-h-dvh bg-bg pb-10">
      <SheetHeader title="收集箱" onCancel={() => navigate('/')} cancelLabel="返回" action={{ label: '粘贴', onClick: () => void paste() }} />
      <div className="mx-auto flex max-w-md flex-col gap-3 p-3">
        <div className="rounded-(--radius-field) bg-panel p-3">
          <textarea
            aria-label="粘贴多行文本"
            rows={4}
            className="w-full resize-none bg-transparent text-base outline-none placeholder:text-muted"
            placeholder={'一行一条：单词、短语，或整句原文\n从 Mac 复制后可直接在手机上粘贴'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <p className="mt-1 text-xs text-again-fg">{error}</p>}
          <Button className="mt-2 w-full" disabled={splitPaste(text).length === 0} onClick={() => void submit()}>加入收集箱</Button>
        </div>

        {drafts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">收集箱是空的</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {drafts.map((d) => {
              const b = badge(d, dict[d.id])
              return (
                <li key={d.id} className="flex items-center gap-2 rounded-(--radius-field) bg-panel px-3 py-2">
                  <Link to={`/note/new?draft=${d.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{d.raw}</div>
                    <div className="text-xs text-muted">{statusLine(d, dict[d.id])}</div>
                  </Link>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${b.cls}`}>{b.text}</span>
                  <button type="button" aria-label={`删除 ${d.raw}`} className="grid h-11 w-11 shrink-0 place-items-center text-muted" onClick={() => setPendingDelete(d)}>✕</button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {pendingDelete && (
        <ConfirmSheet
          title="删除草稿"
          lines={[`「${pendingDelete.raw}」`]}
          message="草稿删掉就没了；已经建好的卡不受影响。"
          safeLabel="保留"
          dangerLabel="删除草稿"
          busy={deleting}
          onSafe={() => setPendingDelete(undefined)}
          onDanger={() => void remove(pendingDelete)}
        />
      )}
    </div>
  )
}
