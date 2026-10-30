import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parse } from 'csv-parse'
import { shouldInclude, toEntry, type RawRow } from './dict-transform'
import type { DictEntry } from '../src/domain/types'

const SOURCE = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv'
const CACHE = '.cache/ecdict.csv'
const OUT_DIR = 'public/dict'
const VERSION_FILE = 'src/generated/dict-version.ts'

async function download(): Promise<void> {
  if (existsSync(CACHE)) return
  await mkdir('.cache', { recursive: true })
  console.log(`downloading ${SOURCE} …`)
  const res = await fetch(SOURCE)
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(CACHE))
}

async function collect(): Promise<DictEntry[]> {
  const byWord = new Map<string, DictEntry>()
  const parser = createReadStream(CACHE).pipe(
    parse({ columns: true, bom: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true }),
  )
  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    const row: RawRow = {
      word: record.word ?? '', phonetic: record.phonetic ?? '', translation: record.translation ?? '',
      pos: record.pos ?? '', tag: record.tag ?? '', frq: record.frq ?? '', exchange: record.exchange ?? '',
    }
    if (!row.word || !shouldInclude(row)) continue
    const entry = toEntry(row)
    if (!entry.translation) continue
    if (!byWord.has(entry.word)) byWord.set(entry.word, entry)
  }
  return Array.from(byWord.values()).sort((a, b) => (a.word < b.word ? -1 : 1))
}

async function main() {
  await download()
  const entries = await collect()
  const json = JSON.stringify(entries)
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 8)

  await mkdir(OUT_DIR, { recursive: true })
  for (const f of await readdir(OUT_DIR)) if (/^ecdict\.[0-9a-f]{8}\.json$/.test(f)) await rm(`${OUT_DIR}/${f}`)
  const file = `dict/ecdict.${hash}.json`
  await writeFile(`public/${file}`, json)

  await mkdir('src/generated', { recursive: true })
  await writeFile(
    VERSION_FILE,
    `// 由 scripts/build-dict.ts 生成，勿手改\nexport const DICT_VERSION = '${hash}'\nexport const DICT_FILE = '${file}'\n`,
  )
  console.log(`${entries.length} entries → public/${file} (${(json.length / 1024 / 1024).toFixed(1)} MB)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
