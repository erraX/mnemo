import type { MnemoDB } from '@/db/db'
import { addDrafts, getSettings, importNotes, updateSettings, type NoteInput } from '@/db/repo'
import { detectBlanks } from '@/lib/cloze'
import type { CloudConfig } from '@/domain/types'

/** 云端收集箱里的一条待收录内容（快捷指令提交的形状） */
export interface CloudItem {
  id: string
  word?: string
  meaning?: string
  sentence?: string
  createdAt: number
}

export interface PullResult {
  /** 本次从云端拿到的条目数 */
  fetched: number
  /** 直接建卡的条目数（单词 + 已确认释义） */
  direct: number
  /** 落进收集箱的草稿数 */
  drafts: number
  /** 与已有记录重复而跳过的条目数 */
  duplicates: number
}

/** token 无效或过期：需要到 设置 → 云端收集 更新 */
export class CloudAuthError extends Error {
  constructor(message = '云端收集的令牌无效，请到设置里更新') {
    super(message)
    this.name = 'CloudAuthError'
  }
}

/** 网络 / 服务端故障：稍后重试 */
export class CloudNetworkError extends Error {
  constructor(message = '连不上云端收集箱，稍后自动重试') {
    super(message)
    this.name = 'CloudNetworkError'
  }
}

export async function pullCloudInbox(db: MnemoDB, cfg: CloudConfig, now = Date.now()): Promise<PullResult> {
  let res: Response
  try {
    res = await fetch(`${cfg.url}/inbox`, { headers: { authorization: `Bearer ${cfg.token}` } })
  } catch {
    throw new CloudNetworkError()
  }
  if (res.status === 401 || res.status === 403) throw new CloudAuthError()
  if (!res.ok) throw new CloudNetworkError(`云端返回 ${res.status}`)
  let data: { items?: CloudItem[] }
  try {
    data = (await res.json()) as { items?: CloudItem[] }
  } catch {
    throw new CloudNetworkError('云端响应不是合法 JSON')
  }
  const items = data.items ?? []
  const settings = await getSettings(db)

  const inputs: NoteInput[] = []
  const lines: Array<{ raw: string; kind: 'headword' | 'sentence'; origin: 'cloud' }> = []
  for (const item of items) {
    if (item.word && item.meaning) {
      inputs.push({
        headword: item.word,
        meaning: item.meaning,
        examples: item.sentence ? [{ text: item.sentence, blanks: detectBlanks(item.sentence, item.word) }] : [],
        tags: [],
        enabledTypes: settings.lastEnabledTypes,
      })
    } else if (item.sentence) {
      lines.push({ raw: item.sentence, kind: 'sentence', origin: 'cloud' })
    } else if (item.word) {
      lines.push({ raw: item.word, kind: 'headword', origin: 'cloud' })
    }
  }
  const { skipped } = await importNotes(db, inputs, now)
  const added = await addDrafts(db, lines, now)

  const ids = items.map((i) => i.id)
  if (ids.length > 0) {
    let del: Response
    try {
      del = await fetch(`${cfg.url}/inbox/delete`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ ids }),
      })
    } catch {
      throw new CloudNetworkError('内容已收下，但云端没清掉；下次会自动重试')
    }
    if (del.status === 401 || del.status === 403) throw new CloudAuthError()
    if (!del.ok) throw new CloudNetworkError('内容已收下，但云端没清掉；下次会自动重试')
  }
  await updateSettings(db, { lastCloudPullAt: now })
  return { fetched: items.length, direct: inputs.length - skipped, drafts: added.length, duplicates: skipped }
}
