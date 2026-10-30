import Dexie, { type EntityTable } from 'dexie'
import type { Card, DictEntry, Draft, Note, ReviewLog, Settings } from '@/domain/types'

export class MnemoDB extends Dexie {
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<Card, 'id'>
  reviewLogs!: EntityTable<ReviewLog, 'id'>
  drafts!: EntityTable<Draft, 'id'>
  dict!: EntityTable<DictEntry, 'word'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'mnemo') {
    super(name)
    this.version(1).stores({
      notes: 'id, headwordKey, updatedAt, *tags',
      cards: 'id, noteId, due, state',
      reviewLogs: 'id, cardId, noteId, reviewedAt',
      drafts: 'id, createdAt',
      dict: 'word, *forms',
      settings: 'id',
    })
  }
}

export const db = new MnemoDB()
