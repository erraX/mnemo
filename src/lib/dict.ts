import type { MnemoDB } from '@/db/db'
import type { DictEntry } from '@/domain/types'
import { DICT_FILE } from '@/generated/dict-version'

export function dictUrl(): string {
  return `${import.meta.env.BASE_URL}${DICT_FILE}`
}

export async function lookupWord(db: MnemoDB, raw: string): Promise<{ entry: DictEntry; viaForm: boolean } | undefined> {
  const key = raw.trim().toLowerCase()
  if (!key) return undefined
  const exact = await db.dict.get(key)
  if (exact) return { entry: exact, viaForm: false }
  const viaForm = await db.dict.where('forms').equals(key).first()
  return viaForm ? { entry: viaForm, viaForm: true } : undefined
}
