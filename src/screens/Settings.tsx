import { useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db } from '@/db/db'
import { getSettings, updateSettings } from '@/db/repo'
import { DEFAULT_SETTINGS, type Accent } from '@/domain/types'
import { DICT_VERSION } from '@/generated/dict-version'
import { exportBackup, importBackup, markBackedUp, validateBackup } from '@/lib/backup'
import { backupToFile, browserShareDeps, deliverBackup, readBackupFile, type ShareDeps } from '@/lib/backupShare'
import { prefetchHeadwords } from '@/lib/prefetchAll'
import { APP_VERSION } from '@/app/version'

const MIN_NEW = 0
const MAX_NEW = 200

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3 text-[15px] last:border-b-0">
      <span>{label}</span>
      <div className="flex items-center gap-2 text-sm text-muted">{children}</div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1 px-1 text-[11px] uppercase tracking-wider text-muted">{title}</div>
      <div className="overflow-hidden rounded-(--radius-card) bg-panel">{children}</div>
    </section>
  )
}

function daysAgo(ts: number | undefined, now = Date.now()): string {
  if (ts === undefined) return '从未'
  const d = Math.floor((now - ts) / 86_400_000)
  return d === 0 ? '今天' : d === 1 ? '昨天' : `${d} 天前`
}

export function Settings({ shareDeps }: { shareDeps?: ShareDeps }) {
  const settings = useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS)
  const dictCount = useLiveQuery(() => db.dict.count(), [], 0)
  const [msg, setMsg] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  /** 上次分享失败的备份文件；再点一次时直接分享，不再先读库（分享必须在点击的用户激活期内发起） */
  const [pendingFile, setPendingFile] = useState<File | undefined>(undefined)
  const [prefetching, setPrefetching] = useState<string | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)

  const setNew = (n: number) => void updateSettings(db, { newCardsPerDay: Math.min(MAX_NEW, Math.max(MIN_NEW, n)) })

  async function setAccent(accent: Accent) {
    if (accent === settings.accent) return
    await updateSettings(db, { accent })
    const words = (await db.notes.toArray()).map((n) => n.headword)
    if (words.length === 0) return
    setPrefetching(`正在重新缓存发音 0 / ${words.length}`)
    await prefetchHeadwords(words, accent, { onProgress: (d, t) => setPrefetching(`正在重新缓存发音 ${d} / ${t}`) })
    setPrefetching(undefined)
  }

  async function backup() {
    if (busy) return
    setBusy(true)
    setMsg(undefined)
    try {
      const deps = shareDeps ?? browserShareDeps()
      const file = pendingFile ?? backupToFile(await exportBackup(db))
      const outcome = await deliverBackup(file, deps)
      if (outcome === 'cancelled') { setMsg('已取消'); return }
      if (outcome === 'failed') { setPendingFile(file); setMsg('备份文件已准备好，再点一次分享'); return }
      setPendingFile(undefined)
      await markBackedUp(db)
      setMsg('已备份')
    } catch {
      setMsg('备份失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  async function restore(file: File | undefined) {
    if (!file || busy) return
    setBusy(true)
    setMsg(undefined)
    try {
      const data = await readBackupFile(file)
      if (!validateBackup(data)) { setMsg('不是 Mnemo 的备份文件'); return }
      if (!window.confirm(`将用备份（${data.notes.length} 条记录，${new Date(data.exportedAt).toLocaleString()}）覆盖当前全部数据，确定吗？`)) return
      await importBackup(db, data)
      setMsg(`已恢复 ${data.notes.length} 条记录`)
    } catch (e) {
      setMsg(e instanceof Error && e.message === '不是有效的备份文件' ? e.message : '恢复失败，请重试')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pb-28" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <h1 className="text-[30px] font-bold leading-tight tracking-tight">设置</h1>

      <Group title="学习">
        <Row label="每日新卡上限">
          <button type="button" aria-label="减少每日新卡" className="h-8 w-8 rounded-full bg-bg text-ink" onClick={() => setNew(settings.newCardsPerDay - 5)}>−</button>
          <span className="w-8 text-center text-ink">{settings.newCardsPerDay}</span>
          <button type="button" aria-label="增加每日新卡" className="h-8 w-8 rounded-full bg-bg text-ink" onClick={() => setNew(settings.newCardsPerDay + 5)}>+</button>
        </Row>
      </Group>

      <Group title="发音">
        <Row label="口音">
          <div className="flex rounded-lg bg-bg p-0.5 text-xs">
            {(['us', 'uk'] as const).map((a) => (
              <button key={a} type="button" aria-pressed={settings.accent === a} className={`rounded-md px-3 py-1 ${settings.accent === a ? 'bg-panel font-semibold text-ink shadow-sm' : ''}`} onClick={() => void setAccent(a)}>
                {a === 'us' ? '美音' : '英音'}
              </button>
            ))}
          </div>
        </Row>
        <Row label="翻面自动朗读">
          <button
            type="button"
            role="switch"
            aria-label="翻面自动朗读"
            aria-checked={settings.autoPlayOnReveal}
            className={`relative h-6 w-10 rounded-full transition-colors ${settings.autoPlayOnReveal ? 'bg-good-fg' : 'bg-line'}`}
            onClick={() => void updateSettings(db, { autoPlayOnReveal: !settings.autoPlayOnReveal })}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${settings.autoPlayOnReveal ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </Row>
        {prefetching && <div className="px-4 py-2 text-xs text-muted">{prefetching}</div>}
      </Group>

      <Group title="数据">
        <button type="button" className="flex w-full items-center justify-between border-b border-line px-4 py-3 text-[15px]" disabled={busy} onClick={() => void backup()}>
          <span>备份到文件</span>
          <span className="text-sm text-muted">{daysAgo(settings.lastBackupAt)} ›</span>
        </button>
        <label className="flex w-full items-center justify-between px-4 py-3 text-[15px]">
          <span>从文件恢复</span>
          <span className="text-sm text-muted">›</span>
          <input ref={fileRef} aria-label="从文件恢复" type="file" accept="application/json,.json" className="sr-only" disabled={busy} onChange={(e) => void restore(e.target.files?.[0])} />
        </label>
        {msg && <div className="px-4 py-2 text-xs text-muted" role="status">{msg}</div>}
        <p className="px-4 pb-3 text-xs text-muted">备份会打开系统分享面板，选「存储到文件」放进 iCloud Drive。恢复会覆盖当前全部数据。</p>
      </Group>

      <Group title="关于">
        <Row label="版本"><span>{APP_VERSION}</span></Row>
        <Row label="词典"><span>ECDICT (MIT)</span><span>· {dictCount} 条 · {DICT_VERSION}</span></Row>
        <Row label="算法"><span>ts-fsrs 5.4</span></Row>
        <Row label="数据地址"><span className="text-xs">{typeof location === 'undefined' ? '' : location.origin}</span></Row>
      </Group>

      <Group title="诊断">
        <Link to="/spike/audio" className="flex items-center justify-between border-b border-line px-4 py-3 text-[15px]"><span>Spike 1 · 有道音频离线缓存</span><span className="text-line">›</span></Link>
        <Link to="/spike/tts" className="flex items-center justify-between px-4 py-3 text-[15px]"><span>Spike 2 · 系统 TTS</span><span className="text-line">›</span></Link>
      </Group>
    </div>
  )
}
