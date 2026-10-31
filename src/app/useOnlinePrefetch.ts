import { useEffect } from 'react'
import { db } from '@/db/db'
import { getSettings } from '@/db/repo'
import { prefetchHeadwords } from '@/lib/prefetchAll'

const WEEK = 7 * 86_400_000

/** 启动时在线，以及回到在线状态时，补预热最近一周改动过的记录的发音 */
export function useOnlinePrefetch(): void {
  useEffect(() => {
    let cancelled = false
    let inflight = false
    const run = async () => {
      if (cancelled || inflight || !navigator.onLine) return
      inflight = true
      try {
        const [settings, notes] = await Promise.all([getSettings(db), db.notes.where('updatedAt').above(Date.now() - WEEK).toArray()])
        if (cancelled || notes.length === 0) return
        await prefetchHeadwords(notes.map((n) => n.headword), settings.accent)
      } finally {
        inflight = false
      }
    }
    void run().catch(() => undefined)
    const onOnline = () => { void run().catch(() => undefined) }
    window.addEventListener('online', onOnline)
    return () => { cancelled = true; window.removeEventListener('online', onOnline) }
  }, [])
}
