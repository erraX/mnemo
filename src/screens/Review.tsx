import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db } from '@/db/db'
import { addExtraNewToday, getSettings, getTodayQueue, getTodayReviewStats, gradeCard, undoLastReview } from '@/db/repo'
import { DEFAULT_SETTINGS, type Rating } from '@/domain/types'
import { scheduler } from '@/lib/scheduler'
import { SESSION_MEMORY_KEY, activeMinutes, afterGrade, afterUndo, continueAfterBreather, initialSession, readSessionMemory, reveal, withQueue, writeSessionMemory } from '@/lib/session'
import { useAudio } from '@/app/useAudio'
import { useVisibilityTick } from '@/app/useVisibilityTick'
import { Button } from '@/components/ui/Button'
import { BreatherPage } from '@/components/review/BreatherPage'
import { CardBack } from '@/components/review/CardBack'
import { CardFront } from '@/components/review/CardFront'
import { DonePage } from '@/components/review/DonePage'
import { GradeBar } from '@/components/review/GradeBar'

function rememberGet(key: string): string | null {
  try { return sessionStorage.getItem(key) } catch { return null }
}

function rememberSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value) } catch { /* 隐私模式或存储被禁用：节奏不跨屏，但不影响答题 */ }
}

export function Review() {
  const navigate = useNavigate()
  const audio = useAudio()
  const settings = useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS)
  // 从复习屏点「编辑」再回来会重建会话；20 张节奏与开始时间要接上，不能悄悄从 0 重新数
  const [session, setSession] = useState(() => {
    const now = Date.now()
    const base = initialSession(now)
    const memory = readSessionMemory(rememberGet(SESSION_MEMORY_KEY), now)
    return memory ? { ...base, sinceBreather: memory.sinceBreather, stats: { ...base.stats, startedAt: memory.startedAt } } : base
  })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string; ms: number } | undefined>(undefined)
  /** 瞬时提示：默认 1.5s；需要读完的句子（解释计数、无新卡）多给一点 */
  const say = (text: string, ms = 1500) => setToast({ text, ms })
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  // 切走 / 锁屏的时间不算进"学习分钟"，否则开着标签页吃个午饭就会报 43 分钟
  const idleMs = useRef(0)
  const hiddenAt = useRef<number | undefined>(undefined)
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) hiddenAt.current = Date.now()
      else if (hiddenAt.current !== undefined) { idleMs.current += Date.now() - hiddenAt.current; hiddenAt.current = undefined }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
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
  // say 每次 render 都是新函数，放进依赖会让上面的 effect 每帧重跑；用 ref 取最新一份
  const sayRef = useRef<(text: string, ms?: number) => void>(() => undefined)
  sayRef.current = (text, ms) => setToast({ text, ms: ms ?? 1500 })
  useEffect(() => {
    if (tick === 0) return
    const s = sessionRef.current
    if (s.phase === 'loading' || s.phase === 'breather' || s.revealed || busyRef.current) return
    let cancelled = false
    requery()
      .then((q) => {
        if (cancelled) return
        // 回到前台重新查队列时，暂缓中的卡（刚答错的、学习步刚到的）会重新进队，剩余数会变大。
        // 那不是 bug，但必须当时就说一句。
        if (q.length > s.queue.length) sayRef.current('打错的卡回到了今天的队里', 2600)
        setSession((cur) => (cur.revealed ? cur : withQueue(cur, q)))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [tick, requery])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(undefined), toast.ms)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    rememberSet(SESSION_MEMORY_KEY, writeSessionMemory(session))
  }, [session.sinceBreather, session.stats.startedAt])

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

  async function onGrade(rating: Rating) {
    if (!current || busy) return
    const before = session.queue.length
    setBusy(true)
    try {
      let wasNew: boolean
      try {
        const { log } = await gradeCard(db, current.id, rating)
        wasNew = log.state === 0
      } catch {
        say('操作失败，请重试')
        return
      }
      // 打分已落库；重查队列失败时本地出队，避免同一张被重复打分
      try {
        const queue = await requery()
        setSession((s) => afterGrade(s, { wasNew, queue }))
        // 剩余数不会因为“答过一张”就一定变小：打错的卡会回到今天的队里，
        // 所以它可能持平甚至回涨。在那一步把原因说出来，否则第一反应是“是不是坏了”。
        if (queue.length >= before) say('打错的卡会回到今天的队里', 2600)
      } catch {
        setSession((s) => afterGrade(s, { wasNew, queue: s.queue.slice(1) }))
        say('已记录，刷新队列失败')
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
      say('已撤销')
    } catch {
      say('操作失败，请重试')
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
      if (queue.length === 0) say('没有更多新卡了')
    } finally {
      setBusy(false)
    }
  }

  // 键盘：Enter/空格翻面，1–4 打分。手机上用不到，Mac 上不该只能用鼠标
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (session.phase !== 'card' || busy) return
      if (!session.revealed) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReveal() }
        return
      }
      const rating = ({ '1': 1, '2': 2, '3': 3, '4': 4 } as Record<string, Rating>)[e.key]
      if (rating) { e.preventDefault(); void onGrade(rating) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session.phase, session.revealed, busy])

  let body: ReactNode
  if (session.phase === 'loading') {
    body = loadError ? (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <div className="text-[22px] font-bold leading-tight">加载失败</div>
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
        minutes={activeMinutes(session.stats.startedAt, idleMs.current, Date.now())}
        onMore={() => void onMore()}
        onHome={() => navigate('/')}
        moreDisabled={busy}
        extra={session.canUndo ? <Button variant="ghost" className="mt-2" onClick={() => void onUndo()}>撤销上一步</Button> : undefined}
      />
    )
  } else {
    body = (
      <div className="flex min-h-dvh flex-col bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="grid grid-cols-3 items-center px-4 py-3 text-sm">
          <button type="button" aria-label="关闭" className="-ml-2 grid h-11 w-11 place-items-center text-muted" onClick={() => navigate('/')}>✕</button>
          <span className="justify-self-center font-semibold">剩余 {session.queue.length}</span>
          <span />
        </div>

        {session.revealed ? (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-4">
            {!noteLoaded ? null : note ? <CardBack note={note} onPlay={playHeadword} /> : <p className="text-sm text-muted">记录不存在</p>}
          </div>
        ) : (
          // 规格 §5.6：点卡片任意位置翻面；翻面是用户手势，自动播放留在手势内。
          // 这里不再自封 role="button"：那会把 aria-label 罩在整棵子树上，读屏永远读不到正在被考的词。
          // 键盘与读屏走底部「看答案」按钮。
          <div
            className="mx-auto flex w-full max-w-md flex-1 cursor-pointer flex-col justify-center px-6 py-4"
            onClick={() => { if (note) onReveal() }}
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
          {/* 撤销与编辑放在拇指区：打错一档不用去够屏幕右上角 */}
          {noteLoaded && (
            <div className="mt-1 flex items-center justify-center gap-8 text-sm">
              <button type="button" className="min-h-11 text-muted disabled:opacity-40" disabled={!session.canUndo || busy} onClick={() => void onUndo()}>撤销上一步</button>
              <button type="button" className="min-h-11 text-accent-ink disabled:opacity-40" disabled={!current} onClick={() => current && navigate(`/note/${current.noteId}`)}>编辑</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {body}
      {toast && <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-44 text-center"><span className="rounded-full bg-ink px-3 py-1 text-xs text-bg">{toast.text}</span></div>}
    </>
  )
}
