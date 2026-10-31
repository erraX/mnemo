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

/** 只读；不写 lastBackupAt，分享成功后由 markBackedUp 记录 */
export async function exportBackup(db: MnemoDB, now = Date.now()): Promise<BackupFile> {
  return db.transaction('r', db.notes, db.cards, db.reviewLogs, db.drafts, db.settings, async () => {
    const [notes, cards, reviewLogs, drafts, settings] = await Promise.all([
      db.notes.toArray(), db.cards.toArray(), db.reviewLogs.toArray(), db.drafts.toArray(), getSettings(db),
    ])
    return { app: 'mnemo', version: 1, exportedAt: now, notes, cards, reviewLogs, drafts, settings }
  })
}

export async function markBackedUp(db: MnemoDB, now = Date.now()): Promise<Settings> {
  return updateSettings(db, { lastBackupAt: now })
}

type Shape = Record<string, 'string' | 'number' | 'array'>

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function hasShape(x: unknown, shape: Shape): boolean {
  if (!isRecord(x)) return false
  return Object.entries(shape).every(([k, t]) => (t === 'array' ? Array.isArray(x[k]) : typeof x[k] === t))
}

// 只查读取端会直接解引用的字段；坏记录进库后会让 searchNotes / 排队白屏，而恢复是覆盖式的
const NOTE_SHAPE: Shape = { id: 'string', headword: 'string', headwordKey: 'string', meaning: 'string', examples: 'array', tags: 'array' }
const CARD_SHAPE: Shape = { id: 'string', noteId: 'string', due: 'number', state: 'number' }
const LOG_SHAPE: Shape = { id: 'string', reviewedAt: 'number' }
const DRAFT_SHAPE: Shape = { id: 'string' }

export function validateBackup(x: unknown): x is BackupFile {
  if (!isRecord(x)) return false
  const o = x
  return (
    o.app === 'mnemo' &&
    o.version === 1 &&
    typeof o.exportedAt === 'number' &&
    isRecord(o.settings) &&
    Array.isArray(o.notes) && o.notes.every((n) => hasShape(n, NOTE_SHAPE)) &&
    Array.isArray(o.cards) && o.cards.every((c) => hasShape(c, CARD_SHAPE)) &&
    Array.isArray(o.reviewLogs) && o.reviewLogs.every((l) => hasShape(l, LOG_SHAPE)) &&
    Array.isArray(o.drafts) && o.drafts.every((d) => hasShape(d, DRAFT_SHAPE))
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
