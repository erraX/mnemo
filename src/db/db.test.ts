import { describe, expect, it } from 'vitest'
import { MnemoDB } from './db'
import { createTestDb } from '@/test/db'
import type { Note } from '@/domain/types'

const note: Note = {
  id: 'n1',
  headword: 'Concern',
  headwordKey: 'concern',
  meaning: 'n. 担忧',
  examples: [],
  tags: ['cet4'],
  enabledTypes: ['zh2en', 'en2zh'],
  createdAt: 1,
  updatedAt: 1,
}

describe('MnemoDB', () => {
  it('stores and indexes notes by headwordKey and tags', async () => {
    const d = createTestDb()
    await d.notes.add(note)
    expect(await d.notes.where('headwordKey').equals('concern').first()).toMatchObject({ id: 'n1' })
    expect(await d.notes.where('tags').equals('cet4').count()).toBe(1)
  })

  it('indexes dict by word and by forms (multiEntry)', async () => {
    const d = createTestDb()
    await d.dict.put({ word: 'concern', phonetic: '', translation: 'n. 担忧', forms: ['concerns', 'concerned'] })
    expect(await d.dict.where('forms').equals('concerned').first()).toMatchObject({ word: 'concern' })
  })

  it('uses the production database name "mnemo" by default', () => {
    expect(new MnemoDB().name).toBe('mnemo')
  })
})
