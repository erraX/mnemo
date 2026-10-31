import type { ReactNode } from 'react'

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-(--radius-field) bg-panel px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
        <span>{label}</span>
        {hint && <span className="normal-case tracking-normal">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
