export function SheetHeader({
  title, onCancel, cancelLabel = '取消', action,
}: { title: string; onCancel: () => void; cancelLabel?: string; action?: { label: string; onClick: () => void; disabled?: boolean } }) {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel/95 px-4 pb-2 backdrop-blur"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
    >
      <button type="button" className="min-h-11 min-w-12 text-left text-[15px] text-accent-ink" onClick={onCancel}>{cancelLabel}</button>
      <h1 className="text-[15px] font-semibold">{title}</h1>
      {action ? (
        <button type="button" className="min-h-11 min-w-12 text-right text-[15px] font-semibold text-accent-ink disabled:opacity-40" disabled={action.disabled} onClick={action.onClick}>
          {action.label}
        </button>
      ) : <span className="min-w-12" />}
    </header>
  )
}
