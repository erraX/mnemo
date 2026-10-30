import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { backupNudgeText } from './Today'

const NOW = new Date(2026, 9, 30, 10).getTime()
const DAY = 86_400_000

describe('backupNudgeText', () => {
  it('shows nothing while settings are unknown', () => {
    expect(backupNudgeText(undefined, 5, NOW)).toBeUndefined()
  })
  it('reminds when never backed up and there are notes', () => {
    expect(backupNudgeText(DEFAULT_SETTINGS, 1, NOW)).toBe('还没有备份过')
    expect(backupNudgeText(DEFAULT_SETTINGS, 0, NOW)).toBeUndefined()
  })
  it('reminds after 7 days, not before', () => {
    expect(backupNudgeText({ ...DEFAULT_SETTINGS, lastBackupAt: NOW - 6 * DAY }, 1, NOW)).toBeUndefined()
    expect(backupNudgeText({ ...DEFAULT_SETTINGS, lastBackupAt: NOW - 7 * DAY }, 0, NOW)).toBe('上次备份是 7 天前')
  })
})
