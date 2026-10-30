import type { MnemoDB } from '@/db/db'
import { getSettings, updateSettings } from '@/db/repo'
import type { Card, Draft, Note, ReviewLog, Settings } from '@/domain/types'

export interface BackupFile {
  app: 'mnemo'
  version: 1
  exportedAt: number
  notes: Note[]
  cards: Card[]
  reviewLogs: ReviewLog[]
  drafts: Draft[]
  settings: Settings
}

export async function exportBackup(db: MnemoDB, now = Date.now()): Promise<BackupFile> {
  const [notes, cards, reviewLogs, drafts] = await Promise.all([
    db.notes.toArray(), db.cards.toArray(), db.reviewLogs.toArray(), db.drafts.toArray(),
  ])
  const settings = await updateSettings(db, { lastBackupAt: now })
  return { app: 'mnemo', version: 1, exportedAt: now, notes, cards, reviewLogs, drafts, settings }
}

export function validateBackup(x: unknown): x is BackupFile {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    o.app === 'mnemo' &&
    o.version === 1 &&
    Array.isArray(o.notes) &&
    Array.isArray(o.cards) &&
    Array.isArray(o.reviewLogs) &&
    Array.isArray(o.drafts) &&
    typeof o.settings === 'object' && o.settings !== null
  )
}

export async function importBackup(db: MnemoDB, data: BackupFile): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, db.reviewLogs, db.drafts, db.settings, async () => {
    const current = await getSettings(db)
    await Promise.all([db.notes.clear(), db.cards.clear(), db.reviewLogs.clear(), db.drafts.clear()])
    await db.notes.bulkAdd(data.notes)
    await db.cards.bulkAdd(data.cards)
    await db.reviewLogs.bulkAdd(data.reviewLogs)
    await db.drafts.bulkAdd(data.drafts)
    await db.settings.put({ ...data.settings, id: 'settings', dictVersion: current.dictVersion })
  })
}

export function backupFilename(now: number): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `mnemo-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
}
