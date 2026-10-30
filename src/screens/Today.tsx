import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { db } from '@/db/db'
import { getSettings, getTodayCounts } from '@/db/repo'
import { OriginBanner } from '@/components/OriginBanner'
import type { DictLoadState } from '@/app/useDictLoader'

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function todayLabel(now = new Date()) {
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEKDAY[now.getDay()]}`
}

function daysSince(ts: number | undefined, now = Date.now()) {
  return ts === undefined ? undefined : Math.floor((now - ts) / 86_400_000)
}

export function Today({ dict }: { dict: DictLoadState }) {
  const navigate = useNavigate()
  const counts = useLiveQuery(() => getTodayCounts(db), [], { due: 0, fresh: 0 })
  const settings = useLiveQuery(() => getSettings(db), [])
  const drafts = useLiveQuery(() => db.drafts.count(), [], 0)
  const noteCount = useLiveQuery(() => db.notes.count(), [], 0)
  const backupAge = daysSince(settings?.lastBackupAt)
  const total = counts.due + counts.fresh

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-28" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <OriginBanner />
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">今日</h1>
        <p className="text-sm text-muted">{todayLabel()}</p>
      </header>

      <section className="rounded-(--radius-card) bg-panel p-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <div className="text-[34px] font-bold leading-none tracking-tight">{counts.due}</div>
            <div className="mt-1 text-xs text-muted">待复习</div>
          </div>
          <div className="flex-1">
            <div className="text-[34px] font-bold leading-none tracking-tight text-accent">{counts.fresh}</div>
            <div className="mt-1 text-xs text-muted">新卡</div>
          </div>
        </div>
        <button
          className="mt-4 h-[50px] w-full rounded-(--radius-card) bg-accent text-base font-semibold text-white disabled:opacity-40"
          disabled={total === 0}
          onClick={() => navigate('/review')}
        >
          {total === 0 ? '今天没有要复习的' : '开始复习'}
        </button>
      </section>

      <Link to="/inbox" className="flex items-center justify-between rounded-(--radius-card) bg-panel px-4 py-3">
        <div>
          <div className="text-[15px]">收集箱</div>
          <div className="text-xs text-muted">{drafts > 0 ? `${drafts} 条待处理` : '没有待处理的'}</div>
        </div>
        <div className="flex items-center gap-2">
          {drafts > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-white">{drafts}</span>}
          <span className="text-lg text-line">›</span>
        </div>
      </Link>

      {backupAge !== undefined && backupAge >= 7 && (
        <Link to="/settings" className="flex items-center justify-between rounded-(--radius-field) border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-fg">
          <span>上次备份是 {backupAge} 天前</span>
          <span className="font-semibold text-accent">立即备份</span>
        </Link>
      )}

      {dict.state === 'loading' && (
        <p className="text-xs text-muted">正在准备词典… {dict.total ? `${dict.done} / ${dict.total}` : ''}</p>
      )}
      {dict.state === 'ready' && dict.entries ? (
        <p className="text-xs text-muted">词典已就绪：{dict.entries} 条，用时 {dict.ms} ms（下载 {dict.fetchMs} / 写入 {dict.writeMs}）</p>
      ) : null}
      {dict.state === 'error' && <p className="text-xs text-again-fg">词典加载失败：{dict.error}</p>}

      <div className="mt-auto pb-2 text-center text-[11px] text-muted">共 {noteCount} 条记录</div>

      <Link
        to="/note/new"
        aria-label="建卡"
        className="fixed right-5 grid h-[52px] w-[52px] place-items-center rounded-full bg-accent text-3xl leading-none text-white shadow-lg shadow-accent/35"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
      >
        +
      </Link>
    </div>
  )
}
