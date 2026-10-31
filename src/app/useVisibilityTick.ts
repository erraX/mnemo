import { useEffect, useState } from 'react'

/** iOS 主屏 PWA 多是"恢复"而不是重新启动；回到前台时触发一次重算 */
export function useVisibilityTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const onChange = () => { if (document.visibilityState === 'visible') setTick((t) => t + 1) }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return tick
}
