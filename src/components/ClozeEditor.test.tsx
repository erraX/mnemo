// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClozeEditor } from './ClozeEditor'

describe('ClozeEditor', () => {
  it('toggles a blank when a word is tapped and reports sorted blanks', () => {
    const onChange = vi.fn()
    render(<ClozeEditor text="I have some concerns." blanks={[{ start: 12, end: 20 }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'have' }))
    expect(onChange).toHaveBeenCalledWith([{ start: 2, end: 6 }, { start: 12, end: 20 }])
    fireEvent.click(screen.getByRole('button', { name: 'concerns' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
  it('marks blanked words with aria-pressed', () => {
    render(<ClozeEditor text="I have some concerns." blanks={[{ start: 12, end: 20 }]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'concerns' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'have' }).getAttribute('aria-pressed')).toBe('false')
  })
})
