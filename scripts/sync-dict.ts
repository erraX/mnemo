/**
 * 把 public/dict 里的 ECDICT 子集导入 D1，供 Worker 的 /lookup 使用。
 *
 * 用法（需已 `npx wrangler@4 login`，并在 worker/wrangler.toml 填好 database_id）：
 *   npx wrangler@4 d1 execute mnemo --remote --file=worker/schema.sql
 *   node --experimental-strip-types scripts/sync-dict.ts --dry-run   # 先看条数与体积
 *   node --experimental-strip-types scripts/sync-dict.ts             # 生成 SQL 并提示导入命令
 *
 * 生成的 SQL 落在 .cache/dict-import.sql（已 gitignore），不提交仓库。
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import type { DictEntry } from '../src/domain/types'

export interface SqlChunk {
  statements: string
  rows: number
}

function esc(s: string): string {
  return s.replace(/'/g, "''")
}

/** 生成 INSERT 语句：dict 与 dict_forms 成对写入，词头与变形一次导入 */
export function buildSql(entries: readonly DictEntry[], chunkSize = 500): string[] {
  const out: string[] = []
  for (let i = 0; i < entries.length; i += chunkSize) {
    const slice = entries.slice(i, i + chunkSize)
    const dictValues = slice
      .map((e) => `('${esc(e.word)}','${esc(e.phonetic)}','${esc(e.translation)}','${esc(JSON.stringify(e.forms))}')`)
      .join(',')
    const formValues = slice
      .flatMap((e) => e.forms.map((f) => `('${esc(f)}','${esc(e.word)}')`))
      .join(',')
    out.push(
      `INSERT OR REPLACE INTO dict (word, phonetic, translation, forms) VALUES ${dictValues};`,
      formValues ? `INSERT OR REPLACE INTO dict_forms (form, word) VALUES ${formValues};` : '',
    )
  }
  return out.filter(Boolean)
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const dir = 'public/dict'
  const file = (await readdir(dir)).find((f) => /^ecdict\.[0-9a-f]{8}\.json$/.test(f))
  if (!file) throw new Error(`public/dict 下没有 ecdict.<hash>.json，先跑 pnpm build:dict`)
  const entries = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as DictEntry[]

  const statements = buildSql(entries)
  const sql = statements.join('\n')
  const mb = (Buffer.byteLength(sql) / 1024 / 1024).toFixed(1)
  console.log(`${entries.length} 条 → ${statements.length} 条语句，${mb} MB SQL（来源 ${file}）`)
  if (dryRun) return

  await mkdir('.cache', { recursive: true })
  await writeFile('.cache/dict-import.sql', sql)
  console.log('已写入 .cache/dict-import.sql，导入：')
  console.log('  npx wrangler@4 d1 execute mnemo --remote --file=.cache/dict-import.sql')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
