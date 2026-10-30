import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 z-50 flex items-center justify-between rounded-(--radius-card) bg-ink px-4 py-3 text-sm text-bg shadow-lg"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
    >
      <span>有新版本</span>
      <div className="flex gap-3">
        <button className="text-muted" onClick={() => setNeedRefresh(false)}>稍后</button>
        <button className="font-semibold" onClick={() => void updateServiceWorker(true)}>刷新</button>
      </div>
    </div>
  )
}
