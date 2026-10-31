// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote, getSettings } from '@/db/repo'
import { backupToFile } from '@/lib/backupShare'
import { exportBackup } from '@/lib/backup'
import { renderWithRouter } from '@/test/render'
import { Settings } from './Settings'

vi.mock('@/lib/prefetchAll', () => ({ prefetchHeadwords: vi.fn(async () => undefined) }))

beforeEach(async () => { await db.delete(); await db.open() })
afterEach(() => vi.restoreAllMocks())

describe('Settings', () => {
  it('changes new-cards-per-day with the stepper, accent and autoplay', async () => {
    renderWithRouter(<Settings />, { route: '/settings', path: '/settings' })
    fireEvent.click(await screen.findByRole('button', { name: '增加每日新卡' }))
    await waitFor(async () => expect((await getSettings(db)).newCardsPerDay).toBe(25))
    fireEvent.click(screen.getByRole('button', { name: '英音' }))
    await waitFor(async () => expect((await getSettings(db)).accent).toBe('uk'))
    fireEvent.click(screen.getByRole('switch', { name: '翻面自动朗读' }))
    await waitFor(async () => expect((await getSettings(db)).autoPlayOnReveal).toBe(false))
  })

  it('backs up via share and only then records lastBackupAt; cancel does not', async () => {
    await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    const share = vi.fn(async () => undefined)
    const deps = { canShareFiles: () => true, share, download: vi.fn() }
    renderWithRouter(<Settings shareDeps={deps} />, { route: '/settings', path: '/settings' })
    fireEvent.click(await screen.findByRole('button', { name: /备份到文件/ }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    await waitFor(async () => expect((await getSettings(db)).lastBackupAt).toBeTypeOf('number'))
    expect(await screen.findByText('已备份')).toBeTruthy()

    await db.settings.update('settings', { lastBackupAt: undefined })
    share.mockRejectedValueOnce(Object.assign(new Error('cancel'), { name: 'AbortError' }))
    fireEvent.click(screen.getByRole('button', { name: /备份到文件/ }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2))
    expect((await getSettings(db)).lastBackupAt).toBeUndefined()
  })

  it('restores from a valid file after confirmation and rejects invalid files', async () => {
    await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    const file = backupToFile(await exportBackup(db))
    await db.delete(); await db.open()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithRouter(<Settings />, { route: '/settings', path: '/settings' })
    const input = (await screen.findByLabelText('从文件恢复')) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(async () => expect(await db.notes.count()).toBe(1))
    expect(await screen.findByText('已恢复 1 条记录')).toBeTruthy()

    fireEvent.change(input, { target: { files: [new File(['{}'], 'x.json', { type: 'application/json' })] } })
    expect(await screen.findByText('不是 Mnemo 的备份文件')).toBeTruthy()
  })

  it('shows about info', async () => {
    renderWithRouter(<Settings />, { route: '/settings', path: '/settings' })
    expect(await screen.findByText('ECDICT (MIT)')).toBeTruthy()
    expect(screen.getByText(/ts-fsrs/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Spike 1/ })).toBeTruthy()
  })
})
