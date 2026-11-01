export function Placeholder({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="text-[22px] font-bold leading-tight text-ink">{title}</div>
        {hint && <p className="mt-1 text-[15px] leading-normal text-muted">{hint}</p>}
        <a href="#/" className="mt-2 inline-flex min-h-11 items-center text-sm text-accent-ink">回到首页</a>
      </div>
    </div>
  )
}
