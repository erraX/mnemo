import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { createNote, getSettings, gradeCard, updateSettings } from '@/db/repo'
import { createScheduler } from '@/lib/scheduler'
import { backupFilename, exportBackup, importBackup, markBackedUp, validateBackup } from './backup'

const NOW = new Date(2026, 9, 30, 9, 5).getTime()
const sched = createScheduler({ enable_fuzz: false })

describe('backup', () => {
  it('round-trips notes, cards, logs, drafts and settings; keeps dictVersion of the target', async () => {
    const src = createTestDb()
    const note = await createNote(src, { headword: 'concern', meaning: 'n. 担忧', examples: [], tags: ['x'], enabledTypes: ['en2zh'] }, NOW, sched)
    const [card] = await src.cards.where('noteId').equals(note.id).toArray()
    await gradeCard(src, card!.id, 3, NOW, sched)
    await src.drafts.add({ id: 'd1', raw: 'leverage', kind: 'headword', createdAt: NOW })
    await updateSettings(src, { newCardsPerDay: 7, dictVersion: 'src-dict' })

    const file = await exportBackup(src, NOW)
    const parsed: unknown = JSON.parse(JSON.stringify(file))
    if (!validateBackup(parsed)) throw new Error('backup did not validate')
    expect(parsed.exportedAt).toBe(NOW)
    expect((await getSettings(src)).lastBackupAt).toBeUndefined() // 导出本身不写 lastBackupAt

    const dst = createTestDb()
    await dst.notes.add({ ...note, id: 'stale', headwordKey: 'stale', headword: 'stale' })
    await updateSettings(dst, { dictVersion: 'dst-dict' })
    await importBackup(dst, parsed)

    expect(await dst.notes.toArray()).toEqual(await src.notes.toArray())
    expect(await dst.cards.toArray()).toEqual(await src.cards.toArray())
    expect(await dst.reviewLogs.toArray()).toEqual(await src.reviewLogs.toArray())
    expect(await dst.drafts.toArray()).toEqual(await src.drafts.toArray())
    const s = await getSettings(dst)
    expect(s.newCardsPerDay).toBe(7)
    expect(s.dictVersion).toBe('dst-dict')
  })

  it('markBackedUp records the time only when called (after a successful share)', async () => {
    const db = createTestDb()
    await exportBackup(db, NOW)
    expect((await getSettings(db)).lastBackupAt).toBeUndefined()
    expect((await markBackedUp(db, NOW)).lastBackupAt).toBe(NOW)
    expect((await getSettings(db)).lastBackupAt).toBe(NOW)
  })

  it('validateBackup rejects foreign or malformed files', () => {
    expect(validateBackup({ app: 'other', version: 1 })).toBe(false)
    expect(validateBackup({ app: 'mnemo', version: 2, notes: [], cards: [], reviewLogs: [], drafts: [], settings: {} })).toBe(false)
    expect(validateBackup(null)).toBe(false)
  })

  it('validateBackup checks exportedAt, settings shape and the fields each record needs', async () => {
    const src = createTestDb()
    const note = await createNote(src, { headword: 'concern', meaning: 'm', examples: [], tags: [], enabledTypes: ['en2zh'] }, NOW, sched)
    const [card] = await src.cards.where('noteId').equals(note.id).toArray()
    await gradeCard(src, card!.id, 3, NOW, sched)
    const good = await exportBackup(src, NOW)
    type Loose = { notes: Record<string, unknown>[]; cards: Record<string, unknown>[]; reviewLogs: Record<string, unknown>[]; drafts: unknown; settings: unknown; exportedAt: unknown }
    const clone = (): Loose => JSON.parse(JSON.stringify(good)) as Loose
    expect(validateBackup(clone())).toBe(true)

    const noKey = clone(); delete noKey.notes[0]!.headwordKey
    expect(validateBackup(noKey)).toBe(false)
    expect(validateBackup({ ...clone(), settings: [] })).toBe(false)
    expect(validateBackup({ ...clone(), exportedAt: 'x' })).toBe(false)
    const badTags = clone(); badTags.notes[0]!.tags = 'x'
    expect(validateBackup(badTags)).toBe(false)
    const badCard = clone(); badCard.cards[0]!.due = '2026'
    expect(validateBackup(badCard)).toBe(false)
    const badLog = clone(); delete badLog.reviewLogs[0]!.reviewedAt
    expect(validateBackup(badLog)).toBe(false)
    expect(validateBackup({ ...clone(), drafts: [{ raw: 'x' }] })).toBe(false)
  })

  it('names files by local time', () => {
    expect(backupFilename(NOW)).toBe('mnemo-backup-20261030-0905.json')
  })
})
