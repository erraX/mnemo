import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

/**
 * 破坏性操作的确认面板：贴底、拇指可达、先说影响面再说按钮。
 * 安全动作用主按钮（50px），破坏动作按 DESIGN.md 的 Destructive 规则用 ghost + again-fg 文字，
 * 所以无论浅色深色都不会出现白字压珊瑚的对比度事故。
 */
export function ConfirmSheet({
  title, lines, message, safeLabel, dangerLabel, onSafe, onDanger, busy = false, extra,
}: {
  title: string
  /** 影响面：每条一行，放在便签色块里 */
  lines?: string[]
  /** 不可逆说明 */
  message?: string
  safeLabel: string
  dangerLabel: string
  onSafe: () => void
  onDanger: () => void
  busy?: boolean
  extra?: ReactNode
}) {
  const titleId = useId()
  const descId = useId()
  const safeRef = useRef<HTMLButtonElement>(null)
  const hasBody = Boolean(lines?.length || message)

  useEffect(() => { safeRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onSafe() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onSafe])

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" role="presentation" onClick={() => { if (!busy) onSafe() }}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hasBody ? descId : undefined}
        className="w-full rounded-t-(--radius-card) border-t border-line bg-panel px-4 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-[22px] font-bold leading-tight">{title}</h2>
        {hasBody && (
          <div id={descId} className="mt-3 rounded-(--radius-field) border border-notice-line bg-notice-bg p-3">
            {lines?.map((line) => <p key={line} className="text-sm text-notice-fg">{line}</p>)}
            {message && <p className={`text-sm text-notice-fg ${lines?.length ? 'mt-1' : ''}`}>{message}</p>}
          </div>
        )}
        {extra && <div className="mt-3">{extra}</div>}
        <div className="mt-4 flex flex-col gap-2">
          <Button ref={safeRef} size="lg" disabled={busy} onClick={onSafe}>{safeLabel}</Button>
          <Button variant="ghost" className="text-again-fg" disabled={busy} onClick={onDanger}>{dangerLabel}</Button>
        </div>
      </div>
    </div>
  )
}
