import { afterEach } from 'vitest'
import { MnemoDB } from '@/db/db'

let created: MnemoDB[] = []

export function createTestDb(): MnemoDB {
  const d = new MnemoDB(`test-${crypto.randomUUID()}`)
  created.push(d)
  return d
}

afterEach(async () => {
  await Promise.all(created.map((d) => d.delete()))
  created = []
})
