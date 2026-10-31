import { useEffect, useReducer, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { db } from '@/db/db'
import { allTags, createNote, deleteNote, findDuplicate, getSettings, planNoteUpdate, updateNote } from '@/db/repo'
import { CARD_TYPES, CARD_TYPE_LABEL, DEFAULT_SETTINGS, type Note } from '@/domain/types'
import { tokenize } from '@/lib/cloze'
import { lookupWord } from '@/lib/dict'
import { canSave, formAvailability, initialForm, reduceForm, saveLabel, toNoteInput } from '@/lib/noteForm'
import { useAudio } from '@/app/useAudio'
import { ClozeEditor } from '@/components/ClozeEditor'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field } from '@/components/ui/Field'
import { SheetHeader } from '@/components/ui/SheetHeader'

export const LOOKUP_DEBOUNCE_MS = 300

const inputCls = 'w-full bg-transparent text-base outline-none placeholder:text-muted'

/** 按 id 重建编辑器：/note/new ↔ /note/:id、/note/A → /note/B 之间不共用表单状态 */
export function NoteEditorRoute() {
  const { id } = useParams<{ id: string }>()
  return <NoteEditor key={id ?? 'new'} />
}

export function NoteEditor() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const draftId = params.get('draft') ?? undefined
  const location = useLocation()
  const navigate = useNavigate()
  const audio = useAudio()
  const mode: 'new' | 'edit' = id ? 'edit' : 'new'

  const settings = useLiveQuery(() => getSettings(db), [])
  // 包一层对象以区分“还在查”（undefined）和“查了但不存在”（{ note: undefined }）
  const noteState = useLiveQuery(async () => ({ note: id ? await db.notes.get(id) : undefined }), [id])
  const note = noteState?.note
  const draft = useLiveQuery(() => (draftId ? db.drafts.get(draftId) : undefined), [draftId])
  const tags = useLiveQuery(() => allTags(db), [], [])
  const [form, dispatch] = useReducer(reduceForm, undefined, () => initialForm(DEFAULT_SETTINGS.lastEnabledTypes))
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined)
  const [prefilledFor, setPrefilledFor] = useState<string | undefined>(undefined)
  const [duplicate, setDuplicate] = useState<Note | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  // 编辑模式下词头未改动前不查词典：否则每次打开都显示“已补全”/“改为原形”，误导用户
  const [headwordDirty, setHeadwordDirty] = useState(false)
  const lookupEnabled = mode === 'new' || headwordDirty
  const headwordRef = useRef<HTMLInputElement>(null)

  // 初始化（各只做一次）：新建等 settings 到位后只接管上次勾选的卡型，不覆盖用户在此之前已输入的内容；
  // 带 ?draft= 时再用草稿预填（独立守卫，先 types 后 draft）；编辑等记录到位后用记录内容
  useEffect(() => {
    if (!settings) return
    if (mode === 'new') {
      if (loadedFor === undefined) {
        dispatch({ type: 'reset', state: { ...form, types: initialForm(settings.lastEnabledTypes).types } })
        setLoadedFor('new')
        headwordRef.current?.focus()
      }
      if (draft && prefilledFor !== draft.id) {
        dispatch({ type: 'prefillDraft', draft })
        setPrefilledFor(draft.id)
        setHeadwordDirty(true)
      }
    }
    if (mode === 'edit' && note && loadedFor !== note.id) {
      dispatch({ type: 'reset', state: initialForm(settings.lastEnabledTypes, note) })
      setLoadedFor(note.id)
    }
  }, [mode, note, draft, settings, loadedFor, prefilledFor, form])

  // 词典查询与查重（防抖）
  useEffect(() => {
    const headword = form.headword.trim()
    if (!headword) { setDuplicate(undefined); return }
    let cancelled = false
    const t = setTimeout(() => {
      if (lookupEnabled) void lookupWord(db, headword).then((result) => { if (!cancelled) dispatch({ type: 'dictResult', result }) })
      void findDuplicate(db, headword, id).then((d) => { if (!cancelled) setDuplicate(d) })
    }, LOOKUP_DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(t) }
  }, [form.headword, id, lookupEnabled])

  const availability = formAvailability(form)
  // 有来路就回上一屏（复习 / 卡片列表）；直接打开的页面 location.key 是 'default'，回首页
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/', { replace: true }))
  const failureMessage = (e: unknown) => `操作失败：${e instanceof Error ? e.message : String(e)}`

  async function save() {
    if (!canSave(form) || saving) return
    setSaving(true)
    setError(undefined)
    try {
      const input = toNoteInput(form)
      if (mode === 'new') {
        await createNote(db, input, Date.now(), undefined, { draftId })
      } else if (id) {
        const plan = await planNoteUpdate(db, id, input)
        if (plan.toDelete.length > 0) {
          const names = plan.toDelete.map((t) => CARD_TYPE_LABEL[t]).join('、')
          if (!window.confirm(`将删除「${names}」卡片及其复习记录，确定吗？`)) return
        }
        await updateNote(db, id, input, Date.now(), undefined, plan.toDelete)
      }
      void audio.prefetch(input.headword)
      goBack()
    } catch (e) {
      setError(failureMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!id) return
    if (!window.confirm('删除这条记录和它的全部卡片、复习记录？')) return
    setError(undefined)
    try {
      await deleteNote(db, id)
      goBack()
    } catch (e) {
      setError(failureMessage(e))
    }
  }

  const tagList = form.tags.split(/[,，\s]+/).filter(Boolean)
  const tagSuggestions = tags.filter((t) => !tagList.includes(t.tag)).slice(0, 8)
  const appendTag = (tag: string) =>
    dispatch({ type: 'tags', value: form.tags.trim() ? `${form.tags.replace(/[,，\s]+$/, '')}, ${tag}` : tag })

  const dictHint =
    form.dict.status === 'hit' ? <span className="text-good-fg"><span aria-hidden="true">✓ </span>已从词典补全</span>
    : form.dict.status === 'miss' ? <span className="text-accent">词典没有，手动填写</span>
    : null

  // 必须在所有 hook 之后早返回
  if (mode === 'edit' && noteState && !noteState.note) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <div className="text-xl font-semibold">记录不存在</div>
          <Button variant="secondary" className="mt-4" onClick={goBack}>返回</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-bg pb-10">
      <SheetHeader
        title={mode === 'new' ? '新卡片' : '编辑'}
        onCancel={goBack}
        action={{ label: '保存', onClick: () => void save(), disabled: !canSave(form) || saving }}
      />
      <div className="mx-auto flex max-w-md flex-col gap-2 p-3">
        <Field label="单词 / 短语" hint={dictHint}>
          <input
            ref={headwordRef}
            aria-label="单词 / 短语"
            className={`${inputCls} text-xl font-semibold`}
            value={form.headword}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => { setHeadwordDirty(true); dispatch({ type: 'headword', value: e.target.value }) }}
          />
          {form.pendingHeadwordPick && form.examples[0] && (
            <div className="mt-2 rounded-(--radius-field) bg-bg p-2">
              <div className="mb-1 text-[10px] text-muted">点一个词作为要记的词</div>
              <p className="leading-8">
                {tokenize(form.examples[0].text).map((t, i) =>
                  t.isWord ? (
                    <button key={i} type="button" aria-label={`选 ${t.text}`} className="rounded-sm px-0.5 underline decoration-dotted underline-offset-4" onClick={() => { setHeadwordDirty(true); dispatch({ type: 'pickHeadword', word: t.text }) }}>
                      {t.text}
                    </button>
                  ) : <span key={i}>{t.text}</span>,
                )}
              </p>
            </div>
          )}
          {form.dict.lemma && (
            <button type="button" className="mt-1 text-sm text-accent" onClick={() => dispatch({ type: 'acceptLemma' })}>
              改为原形 {form.dict.lemma}
            </button>
          )}
          {duplicate && (
            <p className="mt-1 text-xs text-notice-fg">
              已有同名记录 · <Link className="underline" to={`/note/${duplicate.id}`}>查看</Link>
            </p>
          )}
        </Field>

        <Field label="音标">
          <div className="flex items-center gap-2">
            <input aria-label="音标" className={inputCls} value={form.phonetic} placeholder="短语可留空" onChange={(e) => dispatch({ type: 'phonetic', value: e.target.value })} />
            <button type="button" aria-label="播放发音" className="grid h-8 w-8 place-items-center rounded-full bg-easy-bg text-accent" disabled={!form.headword.trim()} onClick={() => void audio.play(form.headword.trim())}>▶</button>
          </div>
        </Field>

        <Field label="释义" hint={form.touched.meaning ? '已手动编辑' : undefined}>
          <textarea aria-label="释义" rows={3} className={`${inputCls} resize-none whitespace-pre-line`} value={form.meaning} onChange={(e) => dispatch({ type: 'meaning', value: e.target.value })} />
        </Field>

        {form.examples.map((ex, i) => (
          <Field key={ex.id} label={`例句 ${i + 1}`} hint={<button type="button" aria-label={`删除例句 ${i + 1}`} className="text-accent" onClick={() => dispatch({ type: 'removeExample', id: ex.id })}>删除</button>}>
            <textarea
              aria-label={`例句 ${i + 1}`}
              rows={2}
              placeholder="粘一段原文进来，效果比词典例句好"
              className={`${inputCls} resize-none`}
              value={ex.text}
              onChange={(e) => dispatch({ type: 'exampleText', id: ex.id, value: e.target.value })}
            />
            {ex.text.trim() && (
              <>
                <div className="mt-1 text-[10px] text-muted">点词改挖空</div>
                <ClozeEditor text={ex.text} blanks={ex.blanks} onChange={(blanks) => dispatch({ type: 'exampleBlanks', id: ex.id, blanks })} />
              </>
            )}
            <input aria-label={`来源 ${i + 1}`} className={`${inputCls} mt-1`} placeholder="来源：文章名 / 剧名（可空）" value={ex.source} onChange={(e) => dispatch({ type: 'exampleSource', id: ex.id, value: e.target.value })} />
          </Field>
        ))}
        <Button variant="secondary" onClick={() => dispatch({ type: 'addExample' })}>+ 添加例句</Button>

        <Field label="标签">
          <input aria-label="标签" className={inputCls} placeholder="逗号分隔，可空" value={form.tags} onChange={(e) => dispatch({ type: 'tags', value: e.target.value })} />
          {tagSuggestions.length > 0 && (
            <div className="mt-1">
              {tagSuggestions.map((t) => (
                <button key={t.tag} type="button" aria-label={`添加标签 ${t.tag}`} className="mr-1 mt-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted" onClick={() => appendTag(t.tag)}>
                  {t.tag}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="卡片类型（多选）">
          <div className="flex flex-wrap gap-2">
            {CARD_TYPES.map((t) => (
              <Chip key={t} selected={form.types.includes(t)} disabled={!availability[t].ok} reason={availability[t].reason} onToggle={() => dispatch({ type: 'toggleType', cardType: t })}>
                {CARD_TYPE_LABEL[t]}
              </Chip>
            ))}
          </div>
          {CARD_TYPES.filter((t) => !availability[t].ok).map((t) => (
            <p key={t} className="mt-1 text-xs text-muted">{CARD_TYPE_LABEL[t]}：{availability[t].reason}</p>
          ))}
        </Field>

        <Button size="lg" className="mt-2" disabled={!canSave(form) || saving} onClick={() => void save()}>
          {saveLabel(form, mode)}
        </Button>
        {error && <p role="alert" className="text-xs text-again-fg">{error}</p>}

        {mode === 'edit' && (
          <Button variant="ghost" className="mt-4 text-again-fg" onClick={() => void remove()}>删除这条记录</Button>
        )}
      </div>
    </div>
  )
}
