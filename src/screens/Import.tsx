import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { db } from '@/db/db'
import { getSettings, importNotes, previewNoteImport, type NoteImportPreview } from '@/db/repo'
import { MAX_IMPORT_BYTES, parseVocabularyImport, type ParsedVocabularyImport } from '@/lib/vocabularyImport'
import { prefetchHeadwords } from '@/lib/prefetchAll'
import { Button } from '@/components/ui/Button'

interface Selection {
  filename: string
  parsed: ParsedVocabularyImport
  preview: NoteImportPreview
}

export function Import() {
  const [selection, setSelection] = useState<Selection | undefined>()
  const [phase, setPhase] = useState<'idle' | 'reading' | 'importing'>('idle')
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState<string | undefined>()
  const working = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const alive = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; generation.current += 1 }
  }, [])

  async function selectFile(file: File | undefined) {
    if (!file || working.current) return
    working.current = true
    const id = ++generation.current
    const current = () => alive.current && generation.current === id
    setSelection(undefined)
    setError(undefined)
    setResult(undefined)
    setPhase('reading')
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('文件不能超过 5 MB，请拆分后导入')
      let text: string
      try { text = await file.text() } catch { throw new Error('读取文件失败，请重试') }
      if (!current()) return
      const parsed = parseVocabularyImport(text)
      let preview: NoteImportPreview
      try { preview = await previewNoteImport(db, parsed.entries) } catch { throw new Error('读取词库失败，请重试') }
      if (current()) setSelection({ filename: file.name, parsed, preview })
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : '读取文件失败，请重试')
    } finally {
      working.current = false
      if (current()) setPhase('idle')
    }
  }

  async function confirmImport() {
    if (!selection || working.current || selection.preview.entries.length === 0) return
    working.current = true
    setPhase('importing')
    setError(undefined)
    try {
      // 必须使用完整有效输入重新去重，而不是直接写预览的待新增列表。
      const imported = await importNotes(db, selection.parsed.entries)
      if (alive.current) {
        setResult(`已导入 ${imported.notes.length} 条记录 · ${imported.cardCount} 张卡；跳过 ${imported.skipped} 条重复、${selection.parsed.invalidRows.length} 条无效记录`)
        setSelection(undefined)
      }
      // 入库已经成功，预热失败不能回到「导入失败」；离线也能完成导入。
      if (imported.notes.length) {
        void getSettings(db)
          .then((settings) => prefetchHeadwords(imported.notes.map((n) => n.headword), settings.accent))
          .catch(() => undefined)
      }
    } catch {
      if (alive.current) setError('导入失败，未写入任何词条，请重试')
    } finally {
      working.current = false
      if (alive.current) setPhase('idle')
    }
  }

  const busy = phase !== 'idle'
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pb-10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <Link to="/settings" className="flex min-h-11 items-center text-accent">返回设置</Link>
      <h1 className="text-[30px] font-bold leading-tight tracking-tight">导入词库</h1>
      <p className="text-sm text-muted">只追加新词，已有词自动跳过，不改变现有卡片和复习进度。</p>
      <section className="rounded-(--radius-card) bg-panel p-4">
        <h2 className="font-semibold">支持的格式</h2>
        <p className="mt-2 text-sm text-muted">Vocably 导出的 CSV / TSV：列间选 Comma 或 Tab，记录间选 New line。</p>
        <p className="mt-2 text-sm text-muted">保留词头、中文释义、IPA 和例句；不导入英文释义、词性、时态和旧复习进度。新词会按每日额度开始学习。</p>
        <p className="mt-2 text-sm text-muted">上限 5 MB、10000 条。Mnemo 的 JSON 备份请在设置中使用「从文件恢复」，恢复会覆盖全部数据。</p>
      </section>
      <Button size="lg" className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>选择文件</Button>
      <input ref={fileRef} type="file" aria-label="选择词库文件" className="sr-only" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void selectFile(file)
        }} />
      {busy && <p role="status" className="text-sm text-muted">{phase === 'reading' ? '正在读取文件…' : '正在导入，请稍候…'}</p>}
      {error && <p role="alert" className="text-sm text-again-fg">{error}</p>}
      {selection && (
        <section className="flex flex-col gap-3 rounded-(--radius-card) bg-panel p-4" aria-label="导入预览">
          <h2 className="font-semibold">导入预览</h2>
          <p className="break-all text-sm text-muted">{selection.filename}</p>
          <p className="text-sm">识别格式：{selection.parsed.format}</p>
          <p className="text-sm">共 {selection.parsed.total} 条 · 重复 {selection.preview.skipped} 条 · 无效 {selection.parsed.invalidRows.length} 条</p>
          <p className="font-semibold">将新增 {selection.preview.entries.length} 条记录 · {selection.preview.cardCount} 张卡</p>
          {selection.parsed.invalidRows.length > 0 && (
            <p className="text-xs text-muted">无效记录序号：{selection.parsed.invalidRows.slice(0, 20).join('、')}{selection.parsed.invalidRows.length > 20 ? '…' : ''}（词头或释义为空，将跳过）</p>
          )}
          <ul className="divide-y divide-line">
            {selection.preview.entries.slice(0, 5).map((entry) => (
              <li key={entry.headword} className="py-2">
                <div className="font-semibold">{entry.headword}</div>
                <div className="whitespace-pre-line text-sm text-muted">{entry.meaning}</div>
              </li>
            ))}
          </ul>
          {selection.preview.entries.length > 5 && <p className="text-xs text-muted">仅预览前 5 条词条</p>}
          <p className="text-xs text-muted">自动生成中→英、英→中；例句能挖空时再生成挖空卡。重复词按忽略大小写和首尾空格判断。</p>
          <Button size="lg" disabled={busy || selection.preview.entries.length === 0} onClick={() => void confirmImport()}>
            {selection.preview.entries.length ? `导入 ${selection.preview.entries.length} 条` : '没有可新增的词条'}
          </Button>
        </section>
      )}
      {result && <p role="status" className="text-sm text-ink">{result}</p>}
    </main>
  )
}
