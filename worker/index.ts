/**
 * 云端采集 Worker：词典查询 + 收集箱中转。
 *
 * 设计见 docs/superpowers/specs/2026-11-13-cloud-capture-design.md。
 * 两块数据：`dict`（ECDICT 子集，由 scripts/sync-dict.ts 导入 D1）与 `inbox`（快捷指令提交的待收录内容）。
 * 认证只有一条：`Authorization: Bearer <TOKEN>`，TOKEN 是 wrangler secret。
 */

export interface DictRow {
  word: string
  phonetic: string
  translation: string
  forms: string[]
}

export interface InboxRow {
  id: string
  word?: string
  meaning?: string
  sentence?: string
  createdAt: number
}

/** Worker 依赖的存储能力；D1 与内存实现共用，测试不碰网络与数据库 */
export interface Store {
  lookupDict(key: string): Promise<DictRow | undefined>
  insertDict(rows: DictRow[]): Promise<void>
  listInbox(): Promise<InboxRow[]>
  addInbox(row: InboxRow): Promise<void>
  deleteInbox(ids: string[]): Promise<number>
}

export interface Env {
  DB: Store
  TOKEN: string
}

/** 字段上限：快捷指令提交的是选中的文字，超出这个长度一定是误传，截断而不是报错 */
const MAX_FIELD = 200

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } })
}

function clip(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t.slice(0, MAX_FIELD) : undefined
}

function authorized(req: Request, env: Env): boolean {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  return token.length > 0 && token === env.TOKEN
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (!authorized(req, env)) return json({ error: 'unauthorized' }, 401)

  if (url.pathname === '/lookup' && req.method === 'GET') {
    const key = (url.searchParams.get('word') ?? '').trim().toLowerCase()
    if (!key) return json({ found: false })
    const entry = await env.DB.lookupDict(key)
    return json(entry ? { found: true, ...entry } : { found: false })
  }

  if (url.pathname === '/inbox' && req.method === 'GET') {
    return json({ items: await env.DB.listInbox() })
  }

  if (url.pathname === '/inbox' && req.method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return json({ error: 'invalid json' }, 400)
    }
    const item = {
      id: crypto.randomUUID(),
      word: clip(body.word),
      meaning: clip(body.meaning),
      sentence: clip(body.sentence),
      createdAt: Date.now(),
    }
    if (!item.word && !item.sentence) return json({ error: 'word or sentence required' }, 400)
    await env.DB.addInbox(item)
    return json(item, 201)
  }

  if (url.pathname === '/inbox/delete' && req.method === 'POST') {
    let body: { ids?: unknown }
    try {
      body = (await req.json()) as { ids?: unknown }
    } catch {
      return json({ error: 'invalid json' }, 400)
    }
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
    return json({ ok: true, deleted: ids.length ? await env.DB.deleteInbox(ids) : 0 })
  }

  return json({ error: 'not found' }, 404)
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
}

/** 测试与本地开发用的内存实现；行为与 D1 适配器一致（含变形反查） */
export function createMemoryStore(): Store {
  const dict = new Map<string, DictRow>()
  const forms = new Map<string, string>()
  const inbox: InboxRow[] = []
  return {
    async lookupDict(key) {
      return dict.get(key) ?? dict.get(forms.get(key) ?? '')
    },
    async insertDict(rows) {
      for (const r of rows) {
        dict.set(r.word, r)
        for (const f of r.forms) forms.set(f, r.word)
      }
    },
    async listInbox() {
      return [...inbox]
    },
    async addInbox(row) {
      inbox.push(row)
    },
    async deleteInbox(ids) {
      const set = new Set(ids)
      let n = 0
      for (let i = inbox.length - 1; i >= 0; i -= 1) {
        if (set.has(inbox[i]!.id)) {
          inbox.splice(i, 1)
          n += 1
        }
      }
      return n
    },
  }
}
