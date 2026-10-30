import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { createNote, getSettings, gradeCard, updateSettings } from '@/db/repo'
import { createScheduler } from '@/lib/scheduler'
import { backupFilename, exportBackup, importBackup, validateBackup } from './backup'

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
    expect(validateBackup(JSON.parse(JSON.stringify(file)))).toBe(true)
    expect((await getSettings(src)).lastBackupAt).toBe(NOW)

    const dst = createTestDb()
    await dst.notes.add({ ...note, id: 'stale', headwordKey: 'stale', headword: 'stale' })
    await updateSettings(dst, { dictVersion: 'dst-dict' })
    await importBackup(dst, file)

    expect(await dst.notes.toArray()).toEqual(await src.notes.toArray())
    expect(await dst.cards.toArray()).toEqual(await src.cards.toArray())
    expect(await dst.reviewLogs.toArray()).toEqual(await src.reviewLogs.toArray())
    expect(await dst.drafts.toArray()).toEqual(await src.drafts.toArray())
    const s = await getSettings(dst)
    expect(s.newCardsPerDay).toBe(7)
    expect(s.dictVersion).toBe('dst-dict')
  })

  it('validateBackup rejects foreign or malformed files', () => {
    expect(validateBackup({ app: 'other', version: 1 })).toBe(false)
    expect(validateBackup({ app: 'mnemo', version: 2, notes: [], cards: [], reviewLogs: [], drafts: [], settings: {} })).toBe(false)
    expect(validateBackup(null)).toBe(false)
  })

  it('names files by local time', () => {
    expect(backupFilename(NOW)).toBe('mnemo-backup-20261030-0905.json')
  })
})
