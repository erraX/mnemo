import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

export function DonePage({
  reviewed, learned, minutes, onMore, onHome, moreDisabled = false, extra,
}: { reviewed: number; learned: number; minutes: number; onMore: () => void; onHome: () => void; moreDisabled?: boolean; extra?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-good-bg text-3xl text-good-fg">✓</div>
        <h2 className="mt-2 text-[22px] font-bold">今天的复习完成了</h2>
        <div className="mt-3 flex gap-5 text-xs text-muted">
          <div><b className="block text-[22px] leading-tight text-ink" data-stat="reviewed">{reviewed}</b>复习</div>
          <div><b className="block text-[22px] leading-tight text-ink" data-stat="learned">{learned}</b>新学</div>
          <div><b className="block text-[22px] leading-tight text-ink" data-stat="minutes">{minutes}</b>分钟</div>
        </div>
        {extra}
      </div>
      <div className="flex flex-col gap-2 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}>
        <Button size="lg" variant="secondary" onClick={onMore} disabled={moreDisabled}>再学 10 张新卡</Button>
        <Button size="lg" onClick={onHome}>回到首页</Button>
      </div>
    </div>
  )
}
