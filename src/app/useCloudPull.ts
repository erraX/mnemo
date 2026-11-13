import { useEffect } from 'react'
import { db } from '@/db/db'
import { getSettings } from '@/db/repo'
import { pullCloudInbox } from '@/cloud/pull'

/** 两次自动拉取之间的最小间隔：回前台很频繁，不该每次都联网 */
const MIN_GAP = 60_000

/**
 * 云端收集箱的自动拉取：启动时、回到前台时、回到在线时各试一次。
 * 失败静默（内容还在云端等），界面上的状态以 设置/收集箱 的最近一次结果为准。
 */
export function useCloudPull(): void {
  useEffect(() => {
    let cancelled = false
    let inflight = false
    let lastAt = 0

    const run = async (force = false) => {
      if (cancelled || inflight || !navigator.onLine) return
      if (!force && Date.now() - lastAt < MIN_GAP) return
      inflight = true
      try {
        const { cloud } = await getSettings(db)
        if (cancelled || !cloud?.url || !cloud.token) return
        lastAt = Date.now()
        await pullCloudInbox(db, cloud)
      } catch {
        // 云端不可达 / token 失效：留待下次，或收集箱里的手动重试
      } finally {
        inflight = false
      }
    }

    void run()
    const onVisible = () => { if (document.visibilityState === 'visible') void run() }
    const onOnline = () => { void run(true) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [])
}
