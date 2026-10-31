import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db } from '@/db/db'
import { addExtraNewToday, getSettings, getTodayQueue, getTodayReviewStats, gradeCard, undoLastReview } from '@/db/repo'
import { DEFAULT_SETTINGS, type Rating } from '@/domain/types'
import { scheduler } from '@/lib/scheduler'
import { afterGrade, afterUndo, continueAfterBreather, elapsedMinutes, initialSession, reveal, withQueue } from '@/lib/session'
import { useAudio } from '@/app/useAudio'
import { useVisibilityTick } from '@/app/useVisibilityTick'
import { Button } from '@/components/ui/Button'
import { BreatherPage } from '@/components/review/BreatherPage'
import { CardBack } from '@/components/review/CardBack'
import { CardFront } from '@/components/review/CardFront'
import { DonePage } from '@/components/review/DonePage'
import { GradeBar } from '@/components/review/GradeBar'

export function Review() {
  const navigate = useNavigate()
  const audio = useAudio()
  const settings = useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS)
  const [session, setSession] = useState(() => initialSession(Date.now()))
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | undefined>(undefined)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const tick = useVisibilityTick()

  const current = session.queue[0]
  // useLiveQuery 在 deps 变化后仍返回上一张的结果，直到新查询完成；按 noteId 配对，避免把上一张的记录当成当前卡
  const noteResult = useLiveQuery(
    async () => (current ? { noteId: current.noteId, note: await db.notes.get(current.noteId) } : undefined),
    [current?.noteId],
  )
  const noteLoaded = noteResult !== undefined && noteResult.noteId === current?.noteId
  const note = noteLoaded ? noteResult.note : undefined

  const requery = useCallback(() => getTodayQueue(db), [])

  // 完成页显示的是今日完成数（规格 §5.6），不是本次会话：编辑往返、重新进入都不丢；撤销通过 liveQuery 同步
  const isDone = session.phase === 'done'
  const todayStats = useLiveQuery(() => (isDone ? getTodayReviewStats(db) : undefined), [isDone])

  useEffect(() => {
    let cancelled = false
    setLoadError(false)
    requery()
      .then((q) => { if (!cancelled) setSession((s) => withQueue(s, q)) })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [requery, loadAttempt])

  // 回到前台时到期集可能已变（跨天 / 在其他标签页改过）；正在答题（已翻面）、休息页、正在写库时不打断
  const sessionRef = useRef(session)
  sessionRef.current = session
  const busyRef = useRef(busy)
  busyRef.current = busy
  useEffect(() => {
    if (tick === 0) return
    const s = sessionRef.current
    if (s.phase === 'loading' || s.phase === 'breather' || s.revealed || busyRef.current) return
    let cancelled = false
    requery()
      .then((q) => { if (!cancelled) setSession((cur) => (cur.revealed ? cur : withQueue(cur, q))) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [tick, requery])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(undefined), 1500)
    return () => clearTimeout(t)
  }, [toast])

  const playHeadword = () => { if (note) void audio.play(note.headword) }

  // fuzz 开启时每次调用结果可能略有不同，按卡片固定一次，避免按钮文案抖动
  const labels = useMemo(
    () => (session.revealed && current ? scheduler.previewIntervals(current, Date.now()) : undefined),
    [session.revealed, current],
  )

  function onReveal() {
    setSession(reveal)
    if (settings.autoPlayOnReveal) playHeadword()
  }

  function onCardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReveal() }
  }

  async function onGrade(rating: Rating) {
    if (!current || busy) return
    setBusy(true)
    try {
      let wasNew: boolean
      try {
        const { log } = await gradeCard(db, current.id, rating)
        wasNew = log.state === 0
      } catch {
        setToast('操作失败，请重试')
        return
      }
      // 打分已落库；重查队列失败时本地出队，避免同一张被重复打分
      try {
        const queue = await requery()
        setSession((s) => afterGrade(s, { wasNew, queue }))
      } catch {
        setSession((s) => afterGrade(s, { wasNew, queue: s.queue.slice(1) }))
        setToast('已记录，刷新队列失败')
      }
    } finally {
      setBusy(false)
    }
  }

  async function onUndo() {
    if (!session.canUndo || busy) return
    setBusy(true)
    try {
      const restored = await undoLastReview(db)
      const queue = await requery()
      setSession((s) => afterUndo(s, { wasNew: restored?.state === 0, queue, restoredId: restored?.id }))
      setToast('已撤销')
    } catch {
      setToast('操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  async function onMore() {
    if (busy) return
    setBusy(true)
    try {
      await addExtraNewToday(db, 10)
      const queue = await requery()
      setSession((s) => ({ ...withQueue(s, queue), sinceBreather: 0 }))
      if (queue.length === 0) setToast('没有更多新卡了')
    } finally {
      setBusy(false)
    }
  }

  let body: ReactNode
  if (session.phase === 'loading') {
    body = loadError ? (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <div className="text-xl font-semibold">加载失败</div>
          <Button variant="secondary" className="mt-4" onClick={() => setLoadAttempt((n) => n + 1)}>重试</Button>
        </div>
      </div>
    ) : (
      <div className="grid min-h-dvh place-items-center text-muted">加载中…</div>
    )
  } else if (session.phase === 'breather') {
    body = <BreatherPage reviewed={session.stats.reviewed} remaining={session.queue.length} onContinue={() => setSession(continueAfterBreather)} onStop={() => navigate('/')} />
  } else if (session.phase === 'done' || !current) {
    body = (
      <DonePage
        reviewed={todayStats?.reviewed ?? session.stats.reviewed}
        learned={todayStats?.learned ?? session.stats.learned}
        minutes={elapsedMinutes(session, Date.now())}
        onMore={() => void onMore()}
        onHome={() => navigate('/')}
        moreDisabled={busy}
        extra={session.canUndo ? <Button variant="ghost" className="mt-2" onClick={() => void onUndo()}>撤销上一步</Button> : undefined}
      />
    )
  } else {
    body = (
      <div className="flex min-h-dvh flex-col bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <button type="button" aria-label="关闭" className="text-muted" onClick={() => navigate('/')}>✕</button>
          <span className="font-semibold">剩余 {session.queue.length}</span>
          <div className="flex gap-4">
            <button type="button" className="text-accent disabled:opacity-40" disabled={!session.canUndo || busy} onClick={() => void onUndo()}>撤销上一步</button>
            <button type="button" className="text-accent" onClick={() => navigate(`/note/${current.noteId}`)}>编辑</button>
          </div>
        </div>

        {session.revealed ? (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-4">
            {!noteLoaded ? null : note ? <CardBack note={note} onPlay={playHeadword} /> : <p className="text-sm text-muted">记录不存在</p>}
          </div>
        ) : (
          // 规格 §5.6：点卡片任意位置翻面；翻面是用户手势，自动播放留在手势内
          <div
            role="button"
            aria-label="翻面"
            tabIndex={0}
            className="mx-auto flex w-full max-w-md flex-1 cursor-pointer flex-col justify-center px-6 py-4 outline-none"
            onClick={() => { if (note) onReveal() }}
            onKeyDown={onCardKeyDown}
          >
            {!noteLoaded ? null : note ? <CardFront card={current} note={note} onPlay={playHeadword} /> : <p className="text-sm text-muted">记录不存在</p>}
          </div>
        )}

        <div className="mx-auto w-full max-w-md px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
          {!noteLoaded ? null : session.revealed && labels ? (
            <GradeBar labels={labels} onGrade={(r) => void onGrade(r)} disabled={busy} />
          ) : (
            <>
              <p className="mb-2 text-center text-xs text-muted">想好了再翻</p>
              <Button size="lg" className="w-full" onClick={onReveal} disabled={!note}>看答案</Button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {body}
      {toast && <div className="pointer-events-none fixed inset-x-0 bottom-44 text-center"><span className="rounded-full bg-ink px-3 py-1 text-xs text-bg">{toast}</span></div>}
    </>
  )
}
