import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { db } from '@/db/db'
import { addDrafts, deleteDraft, getSettings } from '@/db/repo'
import { CloudAuthError, CloudCleanupError, CloudNetworkError, pullCloudInbox } from '@/cloud/pull'
import { DEFAULT_SETTINGS, type Draft } from '@/domain/types'
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

function DraftList({ drafts, dict, onDelete }: { drafts: Draft[]; dict: Record<string, DictStatus>; onDelete: (d: Draft) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {drafts.map((d) => {
        const b = badge(d, dict[d.id])
        return (
          <li key={d.id} className="flex items-center gap-2 rounded-(--radius-field) bg-panel px-3 py-2">
            <Link to={`/note/new?draft=${d.id}`} className="min-w-0 flex-1">
              <div className="line-clamp-2 break-words text-[15px]">{d.raw}</div>
              <div className="text-xs text-muted">{statusLine(d, dict[d.id])}</div>
            </Link>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${b.cls}`}>{b.text}</span>
            <button type="button" aria-label={`删除 ${d.raw}`} className="grid h-11 w-11 shrink-0 place-items-center text-muted" onClick={() => onDelete(d)}>✕</button>
          </li>
        )
      })}
    </ul>
  )
}

export function Inbox() {
  const navigate = useNavigate()
  const drafts = useLiveQuery(() => db.drafts.orderBy('createdAt').toArray(), [], [] as Draft[])
  const settings = useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS)
  const [text, setText] = useState('')
  const [dict, setDict] = useState<Record<string, DictStatus>>({})
  const [error, setError] = useState<string | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<Draft | undefined>(undefined)
  const [deleting, setDeleting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ text: string; tone: 'ok' | 'error' | 'pending'; needsSettings?: boolean } | undefined>(undefined)

  const cloudDrafts = drafts.filter((d) => d.origin === 'cloud')
  const localDrafts = drafts.filter((d) => d.origin !== 'cloud')

  async function sync() {
    if (!settings.cloud || syncing) return
    setSyncing(true)
    setSyncMsg(undefined)
    try {
      const r = await pullCloudInbox(db, settings.cloud)
      const parts = [`收了 ${r.fetched} 条`]
      if (r.direct) parts.push(`${r.direct} 个词已直接建卡`)
      if (r.drafts) parts.push(`${r.drafts} 条进了收集箱`)
      if (r.duplicates) parts.push(`${r.duplicates} 条重复跳过`)
      setSyncMsg({ text: r.fetched === 0 ? '云端没有新的' : parts.join(' · '), tone: 'ok' })
    } catch (e) {
      if (e instanceof CloudAuthError) {
        setSyncMsg({ text: '令牌无效，需要到设置里更新', tone: 'error', needsSettings: true })
      } else if (e instanceof CloudCleanupError) {
        setSyncMsg({ text: e.message, tone: 'pending' })
      } else {
        setSyncMsg({ text: e instanceof CloudNetworkError ? e.message : '同步未完成，请稍后重试', tone: 'error' })
      }
    } finally {
      setSyncing(false)
    }
  }

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
        <section className="rounded-(--radius-card) bg-panel p-3.5" aria-label="云端收集">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">云端收集</h2>
            <span className={`text-xs ${syncMsg?.tone === 'error' ? 'text-again-fg' : syncMsg?.tone === 'pending' ? 'text-notice-fg' : 'text-muted'}`}>
              {settings.cloud ? (syncing ? '正在同步…' : syncMsg?.tone === 'pending' ? '待清理云端' : syncMsg?.tone === 'error' ? '同步失败' : '已连接') : '尚未配置云端收集'}
            </span>
          </div>
          {syncMsg?.tone !== 'pending' && (
            <p className="mt-1 text-xs text-muted">
              {settings.cloud
                ? settings.lastCloudPullAt
                  ? `上次同步 ${new Date(settings.lastCloudPullAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
                  : '还没同步过'
                : '在快捷指令里收词；到设置里填写地址与令牌'}
            </p>
          )}
          {syncMsg && <p className={`mt-1 text-xs ${syncMsg.tone === 'error' ? 'text-again-fg' : syncMsg.tone === 'pending' ? 'text-notice-fg' : 'text-good-fg'}`} role="status">{syncMsg.text}</p>}
          {settings.cloud ? (
            <Button variant="secondary" className="mt-2 w-full" disabled={syncing} onClick={() => void sync()}>
              {syncing ? '同步中…' : '立即同步'}
            </Button>
          ) : (
            <Link to="/settings" className="mt-2 flex min-h-11 items-center justify-center text-sm font-semibold text-accent-ink">去设置</Link>
          )}
          {syncMsg?.needsSettings && (
            <Link to="/settings" className="mt-1 block text-center text-xs text-accent-ink">到设置检查云端收集</Link>
          )}
        </section>

        <div className="rounded-(--radius-field) bg-panel p-3">
          <textarea
            aria-label="粘贴多行文本"
            rows={4}
            className="w-full resize-none bg-transparent text-base placeholder:text-muted"
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
          <>
            {cloudDrafts.length > 0 && (
              <>
                <p className="text-xs text-muted">来自云端 · {cloudDrafts.length}</p>
                <DraftList drafts={cloudDrafts} dict={dict} onDelete={setPendingDelete} />
              </>
            )}
            {localDrafts.length > 0 && (
              <>
                <p className="text-xs text-muted">{cloudDrafts.length > 0 ? `本机粘贴 · ${localDrafts.length}` : `共 ${localDrafts.length} 条待处理`}</p>
                <DraftList drafts={localDrafts} dict={dict} onDelete={setPendingDelete} />
              </>
            )}
          </>
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
