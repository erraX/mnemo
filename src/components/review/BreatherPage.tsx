import { Button } from '@/components/ui/Button'

export function BreatherPage({ reviewed, remaining, onContinue, onStop }: { reviewed: number; remaining: number; onContinue: () => void; onStop: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-easy-bg text-3xl">☕</div>
        <h2 className="mt-2 text-[22px] font-bold">已复习 {reviewed} 张</h2>
        <p className="text-sm text-muted">还剩 {remaining} 张</p>
      </div>
      <div className="flex flex-col gap-2 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}>
        <Button size="lg" onClick={onContinue}>继续</Button>
        <Button size="lg" variant="secondary" onClick={onStop}>今天到这</Button>
      </div>
    </div>
  )
}
