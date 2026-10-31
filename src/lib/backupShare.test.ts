import { describe, expect, it, vi } from 'vitest'
import type { BackupFile } from './backup'
import { backupToFile, deliverBackup, readBackupFile } from './backupShare'

const data: BackupFile = {
  app: 'mnemo', version: 1, exportedAt: new Date(2026, 9, 31, 9, 5).getTime(),
  notes: [], cards: [], reviewLogs: [], drafts: [],
  settings: { id: 'settings', newCardsPerDay: 20, accent: 'us', autoPlayOnReveal: true, lastEnabledTypes: ['en2zh'] },
}

describe('backupToFile / readBackupFile', () => {
  it('round-trips through a JSON file named by export time', async () => {
    const file = backupToFile(data)
    expect(file.name).toBe('mnemo-backup-20261031-0905.json')
    expect(file.type).toBe('application/json')
    expect(await readBackupFile(file)).toEqual(data)
  })
  it('rejects non-JSON files', async () => {
    await expect(readBackupFile(new File(['not json'], 'x.json'))).rejects.toThrow('不是有效的备份文件')
  })
})

describe('deliverBackup', () => {
  const file = backupToFile(data)
  it('shares when files can be shared', async () => {
    const share = vi.fn(async () => undefined)
    const download = vi.fn()
    expect(await deliverBackup(file, { canShareFiles: () => true, share, download })).toBe('shared')
    expect(share).toHaveBeenCalledWith(file)
    expect(download).not.toHaveBeenCalled()
  })
  it('reports cancelled on AbortError without downloading', async () => {
    const err = Object.assign(new Error('cancel'), { name: 'AbortError' })
    const download = vi.fn()
    expect(await deliverBackup(file, { canShareFiles: () => true, share: async () => { throw err }, download })).toBe('cancelled')
    expect(download).not.toHaveBeenCalled()
  })
  it('falls back to download on other share errors or when sharing is unsupported', async () => {
    const download = vi.fn()
    expect(await deliverBackup(file, { canShareFiles: () => true, share: async () => { throw new Error('boom') }, download })).toBe('downloaded')
    expect(await deliverBackup(file, { canShareFiles: () => false, share: async () => undefined, download })).toBe('downloaded')
    expect(download).toHaveBeenCalledTimes(2)
  })
})
