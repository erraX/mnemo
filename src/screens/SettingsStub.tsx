import { Link } from 'react-router'

/** 第二阶段会被完整的设置页替换；现在只提供 spike 诊断入口（主屏 PWA 没有地址栏）。 */
export function SettingsStub() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-28" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <h1 className="text-[30px] font-bold leading-tight tracking-tight">设置</h1>
      <p className="text-sm text-muted">设置项第二阶段实现。</p>

      <div className="mt-2 px-1 text-[11px] uppercase tracking-wider text-muted">诊断</div>
      <div className="overflow-hidden rounded-(--radius-card) bg-panel">
        <Link to="/spike/audio" className="flex items-center justify-between border-b border-line px-4 py-3 text-[15px]">
          <span>Spike 1 · 有道音频离线缓存</span>
          <span className="text-lg text-line">›</span>
        </Link>
        <Link to="/spike/tts" className="flex items-center justify-between px-4 py-3 text-[15px]">
          <span>Spike 2 · 系统 TTS</span>
          <span className="text-lg text-line">›</span>
        </Link>
      </div>
      <p className="px-1 text-xs text-muted">请从主屏图标打开后再进这两个页面；结果记到 docs/superpowers/spikes。</p>
    </div>
  )
}
