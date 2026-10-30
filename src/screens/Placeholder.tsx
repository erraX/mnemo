export function Placeholder({ title }: { title: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center text-muted">
      <div>
        <div className="text-xl font-semibold text-ink">{title}</div>
        <div className="mt-1 text-sm">第二阶段实现</div>
      </div>
    </div>
  )
}
