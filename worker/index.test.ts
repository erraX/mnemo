import { describe, expect, it } from 'vitest'
import { createMemoryStore, handle, type Env } from './index'

const TOKEN = 'secret-token'

function req(path: string, init: RequestInit = {}, token = TOKEN): Request {
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  return new Request(`https://cf.example${path}`, { ...init, headers })
}

const env = (): Env => ({ DB: createMemoryStore(), TOKEN })

describe('worker: 认证', () => {
  it('缺少或错误的 token 一律返回 401 且不读写任何数据', async () => {
    const e = env()
    expect((await handle(req('/inbox', {}, ''), e)).status).toBe(401)
    expect((await handle(req('/inbox', {}, 'wrong'), e)).status).toBe(401)
    expect((await handle(req('/lookup?word=ephemeral', {}, 'wrong'), e)).status).toBe(401)
    expect(await e.DB.listInbox()).toEqual([])
  })
})

describe('worker: /lookup', () => {
  it('按词直接命中返回音标与释义，变形也能查到', async () => {
    const e = env()
    await e.DB.insertDict([
      { word: 'concern', phonetic: "kən'sə:n", translation: 'n. 关心\nv. 涉及', forms: ['concerns', 'concerned'] },
    ])
    const hit = await handle(req('/lookup?word=concern'), e)
    expect(hit.status).toBe(200)
    expect(await hit.json()).toMatchObject({ word: 'concern', phonetic: "kən'sə:n", translation: 'n. 关心\nv. 涉及' })
    const viaForm = await handle(req('/lookup?word=Concerned'), e)
    expect(await viaForm.json()).toMatchObject({ word: 'concern' })
  })

  it('查不到返回 200 + found:false，而不是错误', async () => {
    const res = await handle(req('/lookup?word=zzzz'), env())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: false })
  })
})

describe('worker: /inbox', () => {
  it('提交一条内容后能在待收取列表里读到，并保持字段原样', async () => {
    const e = env()
    const post = await handle(req('/inbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ word: 'ephemeral', meaning: 'adj. 短暂的', sentence: 'Fame is ephemeral.' }),
    }), e)
    expect(post.status).toBe(201)
    const items = (await (await handle(req('/inbox'), e)).json()) as { items: Array<Record<string, unknown>> }
    expect(items.items).toHaveLength(1)
    expect(items.items[0]).toMatchObject({ word: 'ephemeral', meaning: 'adj. 短暂的', sentence: 'Fame is ephemeral.' })
    expect(typeof items.items[0]?.id).toBe('string')
    expect(typeof items.items[0]?.createdAt).toBe('number')
  })

  it('删除接口按 id 移除，重复 id 与不存在的 id 都安全', async () => {
    const e = env()
    const ids: string[] = []
    for (const word of ['a', 'b']) {
      const r = await handle(req('/inbox', { method: 'POST', body: JSON.stringify({ word }) }), e)
      ids.push(((await r.json()) as { id: string }).id)
    }
    const del = await handle(req('/inbox/delete', { method: 'POST', body: JSON.stringify({ ids: [ids[0], ids[0], 'missing'] }) }), e)
    expect(await del.json()).toEqual({ ok: true, deleted: 1 })
    expect((await e.DB.listInbox()).map((i) => i.id)).toEqual([ids[1]])
  })

  it('空内容被拒；超长内容按上限截断而不是 500', async () => {
    const e = env()
    expect((await handle(req('/inbox', { method: 'POST', body: JSON.stringify({}) }), e)).status).toBe(400)
    const long = 'x'.repeat(5000)
    const r = await handle(req('/inbox', { method: 'POST', body: JSON.stringify({ word: long }) }), e)
    expect(r.status).toBe(201)
    const saved = (await e.DB.listInbox())[0]
    expect(saved?.word?.length).toBe(200)
  })
})
