// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  it('replaces a crashed screen with a readable message and two ways out', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText('这一屏没能显示')).toBeTruthy()
    expect(screen.getByText(/数据在本地，没有丢/)).toBeTruthy()
    expect(screen.getByText('kaboom')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy()
    // 原生 href：崩的可能正是 Router 之下那棵树
    expect(screen.getByRole('link', { name: '先去设置导出备份' }).getAttribute('href')).toBe('#/settings')
  })

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><p>正常内容</p></ErrorBoundary>)
    expect(screen.getByText('正常内容')).toBeTruthy()
  })
})
