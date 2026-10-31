// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Chip } from './Chip'

describe('Chip', () => {
  it('toggles when enabled and shows the reason when disabled', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<Chip selected={false} onToggle={onToggle}>中 → 英</Chip>)
    fireEvent.click(screen.getByRole('button', { name: '中 → 英' }))
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<Chip selected={false} disabled reason="先填写释义" onToggle={onToggle}>中 → 英</Chip>)
    const btn = screen.getByRole('button', { name: /中 → 英/ })
    expect(btn).toBeDisabled()
    expect(btn.getAttribute('title')).toBe('先填写释义')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
  it('marks selection with aria-pressed', () => {
    render(<Chip selected onToggle={() => {}}>例句挖空</Chip>)
    expect(screen.getByRole('button', { name: '例句挖空' }).getAttribute('aria-pressed')).toBe('true')
  })
})
