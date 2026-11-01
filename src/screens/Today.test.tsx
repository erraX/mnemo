// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote } from '@/db/repo'
import { renderWithRouter } from '@/test/render'
import { Today } from './Today'

beforeEach(async () => { await db.delete(); await db.open() })

const idleDict = { state: 'idle', done: 0, total: 0 } as const

describe('Today', () => {
  it('shows the card count in the big number when nothing is due yet', async () => {
    await createNote(db, { headword: 'resilient', meaning: '有韧性的', examples: [], tags: [], enabledTypes: ['en2zh'] })
    await createNote(db, { headword: 'nurture', meaning: 'v. 培养', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<Today dict={idleDict} />, { route: '/', path: '/' })

    // 最大的数字必须是"今天要做的事"：全是新卡时显示 2，而不是 0
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy())
    expect(screen.getByText('张新卡')).toBeTruthy()
    expect(screen.queryByText(/张待复习/)).toBeNull()
    expect((screen.getByRole('button', { name: '开始复习' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('explains the study-day boundary when the day is empty', async () => {
    renderWithRouter(<Today dict={idleDict} />, { route: '/', path: '/' })
    expect(screen.getByText('还没有词')).toBeTruthy()
    await createNote(db, { headword: 'sound', meaning: 'adj. 健全的', examples: [], tags: [], enabledTypes: ['en2zh'] })
    await waitFor(() => expect(screen.getByText(/张新卡/)).toBeTruthy())
  })
})
