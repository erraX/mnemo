// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ClozeText } from './ClozeText'

const text = 'I have some concerns about it.'
const blanks = [{ start: 12, end: 20 }]

describe('ClozeText', () => {
  it('renders a blank placeholder without the word in blank mode', () => {
    const { container } = render(<ClozeText text={text} blanks={blanks} mode="blank" />)
    expect(container.textContent).not.toContain('concerns')
    const blank = container.querySelector('[data-blank]')!
    expect(blank.getAttribute('aria-label')).toBe('空格')
    expect((blank as HTMLElement).style.minWidth).toBe('4.8em')
  })
  it('renders the word highlighted in highlight mode', () => {
    const { container } = render(<ClozeText text={text} blanks={blanks} mode="highlight" />)
    expect(container.textContent).toBe(text)
    expect(container.querySelector('mark')!.textContent).toBe('concerns')
  })
})
