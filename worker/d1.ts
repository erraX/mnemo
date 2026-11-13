import type { DictRow, InboxRow, Store } from './index'

/** Cloudflare D1 的最小接口子集，避免把 workers-types 拖进前端依赖 */
export interface D1Result<T = unknown> {
  results?: T[]
  success: boolean
  meta: { changes?: number }
}

export interface D1Database {
  prepare(query: string): {
    bind(...values: unknown[]): { all<T>(): Promise<D1Result<T>>; run(): Promise<D1Result>; first<T>(): Promise<T | null> }
    all<T>(): Promise<D1Result<T>>
    run(): Promise<D1Result>
  }
  batch(statements: Array<{ run(): Promise<D1Result> }>): Promise<D1Result[]>
  exec(query: string): Promise<{ count: number; duration: number }>
}

/**
 * D1 存储。schema 见 worker/schema.sql：
 *   dict(word TEXT PRIMARY KEY, phonetic TEXT, translation TEXT, forms TEXT)  forms 为 JSON 数组
 *   dict_forms(form TEXT PRIMARY KEY, word TEXT)                              变形反查索引
 *   inbox(id TEXT PRIMARY KEY, word TEXT, meaning TEXT, sentence TEXT, createdAt INTEGER)
 */
export function createD1Store(db: D1Database): Store {
  return {
    async lookupDict(key) {
      const row = await db
        .prepare(
          `SELECT word, phonetic, translation, forms FROM dict WHERE word = ?1
           UNION ALL
           SELECT d.word, d.phonetic, d.translation, d.forms FROM dict_forms f JOIN dict d ON d.word = f.word WHERE f.form = ?1
           LIMIT 1`,
        )
        .bind(key)
        .first<DictRow & { forms: string }>()
      if (!row) return undefined
      return { ...row, forms: JSON.parse(row.forms) as string[] }
    },

    async insertDict(rows) {
      // 分批写，避免单条 SQL 过大；dict_forms 与 dict 同批提交保证一致
      const CHUNK = 200
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK)
        const stmts = slice.flatMap((r) => [
          db
            .prepare('INSERT OR REPLACE INTO dict (word, phonetic, translation, forms) VALUES (?1, ?2, ?3, ?4)')
            .bind(r.word, r.phonetic, r.translation, JSON.stringify(r.forms)),
          ...r.forms.map((f) =>
            db.prepare('INSERT OR REPLACE INTO dict_forms (form, word) VALUES (?1, ?2)').bind(f, r.word),
          ),
        ])
        await db.batch(stmts)
      }
    },

    async listInbox() {
      const res = await db.prepare('SELECT id, word, meaning, sentence, createdAt FROM inbox ORDER BY createdAt').all<InboxRow>()
      return res.results ?? []
    },

    async addInbox(row) {
      await db
        .prepare('INSERT INTO inbox (id, word, meaning, sentence, createdAt) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(row.id, row.word ?? null, row.meaning ?? null, row.sentence ?? null, row.createdAt)
        .run()
    },

    async deleteInbox(ids) {
      if (ids.length === 0) return 0
      const placeholders = ids.map((_, i) => `?${i + 1}`).join(',')
      const res = await db.prepare(`DELETE FROM inbox WHERE id IN (${placeholders})`).bind(...ids).run()
      return res.meta.changes ?? 0
    },
  }
}
