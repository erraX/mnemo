import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

/**
 * 主屏 PWA 没有 devtools：一次渲染抛出就是白屏，用户连"数据还在不在"都无从判断。
 * 所以任何一屏崩掉都换成一句人话 + 两个出口（重新加载 / 去设置导出备份）。
 * 链接用原生 href，不依赖 Router 上下文——崩的可能正是 Router 之下那棵树。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('mnemo 渲染出错', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm">
          <div className="text-[22px] font-bold leading-tight">这一屏没能显示</div>
          <p className="mt-2 text-[15px] leading-normal text-muted">数据在本地，没有丢。重新加载通常就恢复了。</p>
          <p className="mt-2 break-words text-xs text-muted">{error.message}</p>
          <Button size="lg" className="mt-4 w-full" onClick={() => location.reload()}>重新加载</Button>
          <a href="#/settings" className="mt-2 block py-3 text-sm text-accent-ink">先去设置导出备份</a>
        </div>
      </div>
    )
  }
}
