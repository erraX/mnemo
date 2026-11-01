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
    expect(blank.getAttribute('aria-label')).toBe('一个空，8 个字母')
    expect((blank as HTMLElement).style.minWidth).toBe('4.8em')
  })

  it('numbers blanks for screen readers when there is more than one', () => {
    const two = 'In light of it, the plan held.'
    const { container } = render(<ClozeText text={two} blanks={[{ start: 0, end: 2 }, { start: 16, end: 19 }]} mode="blank" />)
    const labels = [...container.querySelectorAll('[data-blank]')].map((n) => n.getAttribute('aria-label'))
    expect(labels).toEqual(['第 1 个空，共 2 个，2 个字母', '第 2 个空，共 2 个，3 个字母'])
  })
  it('renders the word highlighted in highlight mode', () => {
    const { container } = render(<ClozeText text={text} blanks={blanks} mode="highlight" />)
    expect(container.textContent).toBe(text)
    expect(container.querySelector('mark')!.textContent).toBe('concerns')
  })
})
