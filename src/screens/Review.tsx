import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db } from '@/db/db'
import { addExtraNewToday, getSettings, getTodayQueue, gradeCard, undoLastReview } from '@/db/repo'
import { DEFAULT_SETTINGS, type Rating } from '@/domain/types'
import { scheduler } from '@/lib/scheduler'
import { afterGrade, afterUndo, continueAfterBreather, elapsedMinutes, initialSession, reveal, withQueue } from '@/lib/session'
import { useAudio } from '@/app/useAudio'
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

  const current = session.queue[0]
  // useLiveQuery 在 deps 变化后仍返回上一张的结果，直到新查询完成；按 noteId 配对，避免把上一张的记录当成当前卡
  const noteResult = useLiveQuery(
    async () => (current ? { noteId: current.noteId, note: await db.notes.get(current.noteId) } : undefined),
    [current?.noteId],
  )
  const noteLoaded = noteResult !== undefined && noteResult.noteId === current?.noteId
  const note = noteLoaded ? noteResult.note : undefined

  const requery = useCallback(() => getTodayQueue(db), [])

  useEffect(() => {
    let cancelled = false
    void requery().then((q) => { if (!cancelled) setSession((s) => withQueue(s, q)) })
    return () => { cancelled = true }
  }, [requery])

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

  async function onGrade(rating: Rating) {
    if (!current || busy) return
    setBusy(true)
    try {
      const { log } = await gradeCard(db, current.id, rating)
      const queue = await requery()
      setSession((s) => afterGrade(s, { wasNew: log.state === 0, queue }))
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
      setSession((s) => afterUndo(s, { wasNew: restored?.state === 0, queue }))
      setToast('已撤销')
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
    body = <div className="grid min-h-dvh place-items-center text-muted">加载中…</div>
  } else if (session.phase === 'breather') {
    body = <BreatherPage reviewed={session.stats.reviewed} remaining={session.queue.length} onContinue={() => setSession(continueAfterBreather)} onStop={() => navigate('/')} />
  } else if (session.phase === 'done' || !current) {
    body = (
      <DonePage
        reviewed={session.stats.reviewed}
        learned={session.stats.learned}
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
            <button type="button" className="text-accent" onClick={() => navigate(`/note/${current.noteId}?from=review`)}>编辑</button>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-4">
          {!noteLoaded ? null : note ? (
            session.revealed ? <CardBack note={note} onPlay={playHeadword} /> : <CardFront card={current} note={note} onPlay={playHeadword} />
          ) : (
            <p className="text-sm text-muted">记录不存在</p>
          )}
        </div>

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
      {toast && <div className="pointer-events-none fixed inset-x-0 bottom-28 text-center"><span className="rounded-full bg-ink px-3 py-1 text-xs text-bg">{toast}</span></div>}
    </>
  )
}
