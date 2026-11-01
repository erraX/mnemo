// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConfirmSheet } from './ConfirmSheet'

function setup(overrides: Partial<Parameters<typeof ConfirmSheet>[0]> = {}) {
  const onSafe = vi.fn()
  const onDanger = vi.fn()
  render(
    <ConfirmSheet
      title="删除这条记录"
      lines={['「concern」及其 3 张卡', '47 条复习记录']}
      message="这些都一起删掉，不能撤销。"
      safeLabel="保留"
      dangerLabel="确认删除"
      onSafe={onSafe}
      onDanger={onDanger}
      {...overrides}
    />,
  )
  return { onSafe, onDanger }
}

describe('ConfirmSheet', () => {
  it('is an alertdialog carrying the impact before the buttons', () => {
    setup()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('「concern」及其 3 张卡')).toBeTruthy()
    expect(screen.getByText('47 条复习记录')).toBeTruthy()
    expect(screen.getByText('这些都一起删掉，不能撤销。')).toBeTruthy()
  })

  it('starts focus on the safe action and treats Escape as safe', () => {
    const { onSafe, onDanger } = setup()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '保留' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onSafe).toHaveBeenCalledTimes(1)
    expect(onDanger).not.toHaveBeenCalled()
  })

  it('only the destructive button runs the destructive action', () => {
    const { onDanger } = setup()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(onDanger).toHaveBeenCalledTimes(1)
  })

  it('disables both actions while busy, so a double tap cannot write twice', () => {
    const { onDanger } = setup({ busy: true })
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(onDanger).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保留' })).toBeDisabled()
  })
})
