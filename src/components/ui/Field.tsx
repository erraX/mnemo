import type { ReactNode } from 'react'

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-(--radius-field) bg-panel px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-muted">
        <span>{label}</span>
        {hint && <span className="flex items-center gap-3">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
