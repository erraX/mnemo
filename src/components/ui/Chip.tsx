import type { ReactNode } from 'react'

export function Chip({
  selected, disabled = false, reason, onToggle, children,
}: { selected: boolean; disabled?: boolean; reason?: string; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={disabled ? reason : undefined}
      onClick={onToggle}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
        selected ? 'border-ink bg-ink text-bg' : 'border-line bg-panel text-ink'
      }`}
    >
      {children}
    </button>
  )
}
