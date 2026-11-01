import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { db } from '@/db/db'
import { getSettings, getTodayCounts } from '@/db/repo'
import { OriginBanner } from '@/components/OriginBanner'
import { Button } from '@/components/ui/Button'
import { useVisibilityTick } from '@/app/useVisibilityTick'
import type { DictLoadState } from '@/app/useDictLoader'
import type { Settings } from '@/domain/types'

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function todayLabel(now = new Date()) {
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEKDAY[now.getDay()]}`
}

/** settings 未加载时不显示，避免首次渲染闪现提醒条 */
export function backupNudgeText(settings: Settings | undefined, noteCount: number, now = Date.now()): string | undefined {
  if (settings === undefined) return undefined
  if (settings.lastBackupAt === undefined) return noteCount > 0 ? '还没有备份过' : undefined
  const days = Math.floor((now - settings.lastBackupAt) / 86_400_000)
  return days >= 7 ? `上次备份是 ${days} 天前` : undefined
}

export function Today({ dict }: { dict: DictLoadState }) {
  const navigate = useNavigate()
  const tick = useVisibilityTick()
  const counts = useLiveQuery(() => getTodayCounts(db), [tick], { due: 0, fresh: 0 })
  const settings = useLiveQuery(() => getSettings(db), [])
  const drafts = useLiveQuery(() => db.drafts.count(), [], 0)
  const noteCount = useLiveQuery(() => db.notes.count(), [], 0)
  const backupNudge = backupNudgeText(settings, noteCount)
  const total = counts.due + counts.fresh
  // 一屏只有一个大数字，它必须代表"今天要做的事"；due 为 0 时把新卡顶上来，别让最大的字报一个 0
  const headline = counts.due > 0 ? counts.due : counts.fresh
  const caption = counts.due > 0
    ? (counts.fresh > 0 ? `张待复习 · ${counts.fresh} 张新卡` : '张待复习')
    : '张新卡'
  const coldStart = noteCount === 0 && drafts === 0

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-28" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <OriginBanner />
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">今日</h1>
        <p className="text-sm text-muted">{todayLabel()}</p>
      </header>

      {coldStart ? (
        <section className="rounded-(--radius-card) bg-panel p-4">
          <h2 className="text-[22px] font-bold leading-tight">还没有词</h2>
          <p className="mt-1 text-[15px] leading-normal text-muted">从 Mac 复制一句原文，粘进来就能建卡；粘一个词也行。</p>
          <Button size="lg" className="mt-4 w-full" onClick={() => navigate('/inbox')}>粘贴到收集箱</Button>
        </section>
      ) : (
        <>
          <section className="rounded-(--radius-card) bg-panel p-4">
            <p className="flex items-baseline gap-1">
              <span className="text-[34px] font-bold leading-none tracking-tight">{headline}</span>
              <span className="text-[15px] text-muted">{caption}</span>
            </p>
            {total === 0 ? (
              <p className="mt-3 text-[15px] leading-normal text-muted">今天没有要复习的 · 每天 04:00 之后算新的一天。</p>
            ) : (
              <Button size="lg" className="mt-4 w-full" onClick={() => navigate('/review')}>开始复习</Button>
            )}
          </section>

          <Link to="/inbox" className="flex items-center justify-between gap-3 rounded-(--radius-card) bg-panel px-4 py-3">
            <div className="min-w-0">
              <div className="text-[15px]">收集箱</div>
              <div className="text-xs text-muted">{drafts > 0 ? `${drafts} 条待处理` : '粘贴单词或整句，逐条建卡'}</div>
            </div>
            <span className="shrink-0 text-[15px] font-semibold text-accent-ink">{drafts > 0 ? `去建卡 · ${drafts}` : '粘贴'}</span>
          </Link>
        </>
      )}

      {backupNudge && (
        <Link to="/settings" className="flex items-center justify-between rounded-(--radius-field) border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-fg">
          <span>{backupNudge}</span>
          <span className="font-semibold text-accent-ink">去备份</span>
        </Link>
      )}

      {dict.state === 'loading' && (
        <p className="text-xs text-muted">正在准备词典… {dict.total ? `${dict.done} / ${dict.total}` : ''}</p>
      )}
      {dict.state === 'error' && (
        <p className="text-xs text-again-fg">词典没准备好，建卡时不会自动补全释义 · 刷新页面重试</p>
      )}

      <div className="pointer-events-none fixed inset-x-0 z-20" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}>
        <div className="mx-auto flex max-w-md justify-end px-4">
          <Link
            to="/note/new"
            aria-label="建卡"
            className="pointer-events-auto grid h-[52px] w-[52px] place-items-center rounded-full bg-accent text-3xl leading-none text-white shadow-lg shadow-accent/35"
          >
            +
          </Link>
        </div>
      </div>
    </div>
  )
}
