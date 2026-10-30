import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { lookupWord } from './dict'

describe('lookupWord', () => {
  it('finds exact words, then inflections, else undefined', async () => {
    const db = createTestDb()
    await db.dict.put({ word: 'concern', phonetic: '', translation: 'n. 担忧', forms: ['concerns', 'concerned'] })
    expect(await lookupWord(db, ' Concern ')).toMatchObject({ entry: { word: 'concern' }, viaForm: false })
    expect(await lookupWord(db, 'Concerned')).toMatchObject({ entry: { word: 'concern' }, viaForm: true })
    expect(await lookupWord(db, 'leverage')).toBeUndefined()
    expect(await lookupWord(db, '   ')).toBeUndefined()
  })
})
