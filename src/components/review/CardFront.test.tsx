// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Card, Note } from '@/domain/types'
import { CardFront } from './CardFront'

const note: Note = {
  id: 'n1', headword: 'concern', headwordKey: 'concern', phonetic: '/kənˈsɜːrn/', meaning: 'n. 担忧，顾虑\nv. 涉及',
  examples: [{ text: 'I have some concerns about it.', source: 'The Economist', blanks: [{ start: 12, end: 20 }] }],
  tags: [], enabledTypes: ['zh2en', 'cloze', 'en2zh'], createdAt: 0, updatedAt: 0,
}
const card = (type: Card['type']): Card => ({
  id: 'c', noteId: 'n1', type, due: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, createdAt: 0,
})

describe('CardFront', () => {
  it('zh2en shows the meaning and not the headword', () => {
    render(<CardFront card={card('zh2en')} note={note} onPlay={() => {}} />)
    expect(screen.getByText('说出英文')).toBeTruthy()
    expect(screen.getByText(/担忧，顾虑/)).toBeTruthy()
    expect(screen.queryByText('concern')).toBeNull()
  })
  it('cloze shows the blanked sentence and source, without the word or the meaning', () => {
    const { container } = render(<CardFront card={card('cloze')} note={note} onPlay={() => {}} />)
    expect(screen.getByText('填上这个词')).toBeTruthy()
    expect(container.textContent).not.toContain('concerns')
    expect(container.textContent).not.toContain('担忧')
    expect(screen.getByText(/The Economist/)).toBeTruthy()
  })
  it('en2zh shows headword, phonetic and a play button', () => {
    render(<CardFront card={card('en2zh')} note={note} onPlay={() => {}} />)
    expect(screen.getByText('concern')).toBeTruthy()
    expect(screen.getByText('/kənˈsɜːrn/')).toBeTruthy()
    expect(screen.getByRole('button', { name: '播放发音' })).toBeTruthy()
    expect(screen.queryByText(/担忧/)).toBeNull()
  })
})
