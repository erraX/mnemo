import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/test/db'
import { addDrafts, getSettings, importNotes } from '@/db/repo'
import { pullCloudInbox, CloudAuthError, CloudCleanupError, CloudNetworkError, type CloudItem } from './pull'

const NOW = new Date(2026, 10, 13, 12).getTime()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

interface Call { url: string; method: string; body?: string; auth?: string }

afterEach(() => vi.unstubAllGlobals())

/** 记录全部 fetch 调用；路由外的请求返回 404，让测试暴露意外调用 */
function stubFetch(routes: Array<(c: Call) => Response | undefined>, log: Call[]) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const c: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      auth: (init?.headers as Record<string, string> | undefined)?.authorization,
    }
    log.push(c)
    for (const route of routes) {
      const res = route(c)
      if (res) return res
    }
    return jsonResponse({ error: 'not found' }, 404)
  }))
}

describe('pullCloudInbox', () => {
  it('单词+释义的条目直接建卡（沿用上次卡型），写入成功后从云端删除', async () => {
    const db = createTestDb()
    const item: CloudItem = { id: 'i1', word: 'ephemeral', meaning: 'adj. 短暂的', createdAt: NOW - 1000 }
    const calls: Call[] = []
    stubFetch([
      (c) => (c.url === 'https://cf.example/inbox' && c.method === 'GET' ? jsonResponse({ items: [item] }) : undefined),
      (c) => (c.url === 'https://cf.example/inbox/delete' ? jsonResponse({ ok: true, deleted: 1 }) : undefined),
    ], calls)

    const result = await pullCloudInbox(db, { url: 'https://cf.example', token: 't0k' }, NOW)

    expect(result).toEqual({ fetched: 1, direct: 1, drafts: 0, duplicates: 0 })
    const [note] = await db.notes.toArray()
    expect(note?.headword).toBe('ephemeral')
    expect(note?.meaning).toBe('adj. 短暂的')
    const types = (await db.cards.toArray()).map((c) => c.type).sort()
    expect(types).toEqual(['en2zh', 'zh2en']) // 没有例句，cloze 自动不可用
    expect(calls[0]).toMatchObject({ url: 'https://cf.example/inbox', method: 'GET', auth: 'Bearer t0k' })
    expect(calls[1]?.url).toBe('https://cf.example/inbox/delete')
    expect(JSON.parse(calls[1]?.body ?? '{}')).toEqual({ ids: ['i1'] })
  })

  it('带原句的直接建卡会自动挖空，生成例句挖空卡', async () => {
    const db = createTestDb()
    const item: CloudItem = { id: 'i1', word: 'ephemeral', meaning: 'adj. 短暂的', sentence: 'Fame is ephemeral.', createdAt: NOW - 1000 }
    stubFetch([
      (c) => (c.url === 'https://cf.example/inbox' && c.method === 'GET' ? jsonResponse({ items: [item] }) : undefined),
      (c) => (c.url === 'https://cf.example/inbox/delete' ? jsonResponse({ ok: true, deleted: 1 }) : undefined),
    ], [])

    await pullCloudInbox(db, { url: 'https://cf.example', token: 't0k' }, NOW)

    const [note] = await db.notes.toArray()
    expect(note?.examples).toHaveLength(1)
    expect(note?.examples[0]?.text).toBe('Fame is ephemeral.')
    expect(note?.examples[0]?.blanks).toHaveLength(1)
    const types = (await db.cards.toArray()).map((c) => c.type).sort()
    expect(types).toEqual(['cloze', 'en2zh', 'zh2en'])
  })

  it('无释义的条目分流为草稿并标出来源：纯词→词头，带句或纯句→句子', async () => {
    const db = createTestDb()
    const items: CloudItem[] = [
      { id: 'w1', word: 'serendipity', createdAt: NOW - 3000 },
      { id: 'w2', word: 'platitude', sentence: 'That is a mere platitude.', createdAt: NOW - 2000 },
      { id: 's1', sentence: 'The economy works only if everyone plays by the rules.', createdAt: NOW - 1000 },
    ]
    const calls: Call[] = []
    stubFetch([
      (c) => (c.url === 'https://cf.example/inbox' && c.method === 'GET' ? jsonResponse({ items }) : undefined),
      (c) => (c.url === 'https://cf.example/inbox/delete' ? jsonResponse({ ok: true, deleted: 3 }) : undefined),
    ], calls)

    const result = await pullCloudInbox(db, { url: 'https://cf.example', token: 't0k' }, NOW)

    expect(result).toEqual({ fetched: 3, direct: 0, drafts: 3, duplicates: 0 })
    const drafts = await db.drafts.orderBy('createdAt').toArray()
    expect(drafts.map((d) => [d.raw, d.kind, d.origin])).toEqual([
      ['serendipity', 'headword', 'cloud'],
      ['That is a mere platitude.', 'sentence', 'cloud'],
      ['The economy works only if everyone plays by the rules.', 'sentence', 'cloud'],
    ])
    expect(await db.notes.count()).toBe(0)
    expect(JSON.parse(calls[1]?.body ?? '{}').ids).toHaveLength(3)
  })

  it('token 失效抛 CloudAuthError，不写库也不删云端', async () => {
    const db = createTestDb()
    const calls: Call[] = []
    stubFetch([
      (c) => (c.url.endsWith('/inbox') && c.method === 'GET' ? jsonResponse({ error: 'unauthorized' }, 401) : undefined),
    ], calls)

    await expect(pullCloudInbox(db, { url: 'https://cf.example', token: 'bad' }, NOW)).rejects.toBeInstanceOf(CloudAuthError)
    expect(await db.notes.count()).toBe(0)
    expect(await db.drafts.count()).toBe(0)
    expect(calls).toHaveLength(1) // 只有拉取，没有删除
  })

  it('删云端失败时本地已写入的数据保留并报 CloudNetworkError，重拉不重复入库', async () => {
    const db = createTestDb()
    const item: CloudItem = { id: 'i1', word: 'ephemeral', meaning: 'adj. 短暂的', createdAt: NOW - 1000 }
    stubFetch([
      (c) => (c.url === 'https://cf.example/inbox' && c.method === 'GET' ? jsonResponse({ items: [item] }) : undefined),
      (c) => (c.url === 'https://cf.example/inbox/delete' ? jsonResponse({ error: 'boom' }, 500) : undefined),
    ], [])

    await expect(pullCloudInbox(db, { url: 'https://cf.example', token: 't0k' }, NOW)).rejects.toBeInstanceOf(CloudCleanupError)
    expect(await db.notes.count()).toBe(1) // 已写入的不回滚

    await expect(pullCloudInbox(db, { url: 'https://cf.example', token: 't0k' }, NOW)).rejects.toBeInstanceOf(CloudNetworkError)
    expect(await db.notes.count()).toBe(1) // 重拉靠去重兑底，不重复建卡
    expect(await db.cards.count()).toBe(2)
  })

  it('成功拉取会后写 lastCloudPullAt，失败的拉取不动它', async () => {
    const db = createTestDb()
    stubFetch([
      (c) => (c.url.endsWith('/inbox') && c.method === 'GET' ? jsonResponse({ items: [{ id: 'i1', word: 'platitude', meaning: '陈词滥调', createdAt: NOW }] }) : undefined),
      (c) => (c.url.endsWith('/inbox/delete') ? jsonResponse({ ok: true }) : undefined),
    ], [])
    await pullCloudInbox(db, { url: 'https://cf.example', token: 't0k' }, NOW)
    expect((await getSettings(db)).lastCloudPullAt).toBe(NOW)
  })

  it('缺 id 的脏条目被忽略，也不会污染删除请求', async () => {
    const db = createTestDb()
    const calls: Call[] = []
    stubFetch([
      (c) => (c.url === 'https://cf.example/inbox' && c.method === 'GET' ? jsonResponse({ items: [
        { word: 'no-id', meaning: '无 id', createdAt: NOW },
        { id: 'ok', word: 'ephemeral', meaning: 'adj. 短暂的', createdAt: NOW },
      ] }) : undefined),
      (c) => (c.url === 'https://cf.example/inbox/delete' ? jsonResponse({ ok: true }) : undefined),
    ], calls)

    const result = await pullCloudInbox(db, { url: 'https://cf.example', token: 't0k' }, NOW)

    expect(result.fetched).toBe(1)
    expect(await db.notes.count()).toBe(1)
    expect(JSON.parse(calls[1]?.body ?? '{}')).toEqual({ ids: ['ok'] })
  })

  it('重复内容幂等跳过（大小写不敏感），但仍从云端删除', async () => {
    const db = createTestDb()
    await importNotes(db, [{ headword: 'ephemeral', meaning: '旧释义', examples: [], tags: [], enabledTypes: ['zh2en'] }], NOW)
    await addDrafts(db, [{ raw: 'serendipity', kind: 'headword' }], NOW)
    const items: CloudItem[] = [
      { id: 'd1', word: '  EPHEMERAL ', meaning: '新释义', createdAt: NOW - 2000 },
      { id: 'd2', word: 'serendipity', createdAt: NOW - 1000 },
    ]
    const calls: Call[] = []
    stubFetch([
      (c) => (c.url === 'https://cf.example/inbox' && c.method === 'GET' ? jsonResponse({ items }) : undefined),
      (c) => (c.url === 'https://cf.example/inbox/delete' ? jsonResponse({ ok: true, deleted: 2 }) : undefined),
    ], calls)

    const result = await pullCloudInbox(db, { url: 'https://cf.example', token: 't0k' }, NOW)

    expect(result).toEqual({ fetched: 2, direct: 0, drafts: 0, duplicates: 1 })
    const [note] = await db.notes.where('headwordKey').equals('ephemeral').toArray()
    expect(note?.meaning).toBe('旧释义') // 不覆盖已有释义
    expect(await db.notes.count()).toBe(1)
    expect(await db.drafts.count()).toBe(1) // 不重复入草稿
    expect(JSON.parse(calls[1]?.body ?? '{}').ids).toEqual(['d1', 'd2'])
  })
})
