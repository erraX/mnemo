import { useEffect, useReducer, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { db } from '@/db/db'
import { allTags, createNote, deleteNote, findDuplicate, getSettings, planNoteUpdate, previewNoteDeletion, updateNote } from '@/db/repo'
import { CARD_TYPES, CARD_TYPE_LABEL, DEFAULT_SETTINGS, type CardType, type Note } from '@/domain/types'
import { tokenize } from '@/lib/cloze'
import { lookupWord } from '@/lib/dict'
import { canSave, formAvailability, initialForm, reduceForm, saveBlocker, saveLabel, toNoteInput } from '@/lib/noteForm'
import { useAudio } from '@/app/useAudio'
import { ClozeEditor } from '@/components/ClozeEditor'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field } from '@/components/ui/Field'
import { SheetHeader } from '@/components/ui/SheetHeader'

export const LOOKUP_DEBOUNCE_MS = 300

const inputCls = 'w-full bg-transparent text-base placeholder:text-muted'

/** 只比"填了什么"：卡型勾选不拿来判脏，它的删除另有确认 */
function contentKey(f: { headword: string; phonetic?: string; meaning: string; examples: Array<{ text: string }>; tags: string | string[] }): string {
  const tags = (Array.isArray(f.tags) ? f.tags : f.tags.split(/[,，\s]+/)).map((t) => t.trim()).filter(Boolean)
  return JSON.stringify([
    f.headword.trim(), (f.phonetic ?? '').trim(), f.meaning.trim(), tags,
    f.examples.map((e) => e.text.trim()).filter(Boolean),
  ])
}

/** 按 id 和草稿重建编辑器：/note/new ↔ /note/:id、换草稿、/note/A → /note/B 之间不共用表单状态 */
export function NoteEditorRoute() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const draftId = params.get('draft') ?? ''
  return <NoteEditor key={`${id ?? 'new'}:${draftId}`} />
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
  // 三张确认面板共用一次渲染：离开未保存的表单、关闭卡型、删除记录
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [pendingTypeDelete, setPendingTypeDelete] = useState<{ types: CardType[]; cards: number; logs: number } | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<{ cards: number; logs: number } | undefined>(undefined)
  /** 删例句也要先问一句：它是用户抄进来的原文，连同挖空一起没了就找不回来 */
  const [pendingExampleDelete, setPendingExampleDelete] = useState<{ id: string; index: number; text: string } | undefined>(undefined)
  // 编辑模式下词头未改动前不查词典：否则每次打开都显示“已补全”/“改为原形”，误导用户
  const [headwordDirty, setHeadwordDirty] = useState(false)
  // 例句视图：同一时刻只渲染一层——要么 textarea，要么可点词的句子
  // 已经有挖空的例句默认直接进挖空视图，打开记录就能看到自己挖在哪里
  const [exampleView, setExampleView] = useState<Record<string, 'carve' | 'edit'>>({})
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
      const next = initialForm(settings.lastEnabledTypes, note)
      dispatch({ type: 'reset', state: next })
      // 打开已有记录时，已挖空的例句直接进可点视图；新建/正在写的例句不会被自动检测把输入框切走
      setExampleView(Object.fromEntries(next.examples.filter((e) => e.blanks.length > 0).map((e) => [e.id, 'carve' as const])))
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
  // 取消是 sticky 头部最左一格，正是拇指误触的落点：改过内容就先问一句，不直接丢
  const initialKey = contentKey(mode === 'edit' && note ? note : initialForm(DEFAULT_SETTINGS.lastEnabledTypes))
  const dirty = contentKey(form) !== initialKey
  const requestClose = () => { if (dirty) setConfirmLeave(true); else goBack() }
  const failureMessage = (e: unknown) => `操作失败：${e instanceof Error ? e.message : String(e)}`

  async function save(confirmed: CardType[] = []) {
    if (!canSave(form) || saving) return
    setSaving(true)
    setError(undefined)
    try {
      const input = toNoteInput(form)
      if (mode === 'new') {
        await createNote(db, input, Date.now(), undefined, { draftId })
      } else if (id) {
        const plan = await planNoteUpdate(db, id, input)
        if (plan.toDelete.some((t) => !confirmed.includes(t))) {
          const impact = await previewNoteDeletion(db, id, plan.toDelete)
          setPendingTypeDelete({ types: plan.toDelete, cards: impact.cards, logs: impact.logs })
          return
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

  async function requestRemove() {
    if (!id) return
    setError(undefined)
    try {
      setPendingDelete(await previewNoteDeletion(db, id))
    } catch (e) {
      setError(failureMessage(e))
    }
  }

  async function remove() {
    if (!id) return
    setSaving(true)
    setError(undefined)
    try {
      await deleteNote(db, id)
      goBack()
    } catch (e) {
      setError(failureMessage(e))
    } finally {
      setSaving(false)
      setPendingDelete(undefined)
    }
  }

  const tagList = form.tags.split(/[,，\s]+/).filter(Boolean)
  const tagSuggestions = tags.filter((t) => !tagList.includes(t.tag)).slice(0, 8)
  const appendTag = (tag: string) =>
    dispatch({ type: 'tags', value: form.tags.trim() ? `${form.tags.replace(/[,，\s]+$/, '')}, ${tag}` : tag })

  const dictHint =
    form.dict.status === 'hit' ? <span className="text-good-fg"><span aria-hidden="true">✓ </span>已从词典补全</span>
    : form.dict.status === 'miss' ? <span className="text-accent-ink">词典没有，手动填写</span>
    : null

  // 必须在所有 hook 之后早返回
  if (mode === 'edit' && noteState && !noteState.note) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <div className="text-[22px] font-bold leading-tight">记录不存在</div>
          <Button variant="secondary" className="mt-4" onClick={goBack}>返回</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-bg pb-10">
      <SheetHeader
        title={mode === 'new' ? '新卡片' : '编辑'}
        onCancel={requestClose}
        action={{ label: '保存', onClick: () => void save(), disabled: !canSave(form) || saving }}
      />
      <div className="mx-auto flex max-w-md flex-col gap-2 p-3">
        <Field label="单词 / 短语" hint={dictHint}>
          <input
            ref={headwordRef}
            aria-label="单词 / 短语"
            className={`${inputCls} text-[22px] font-bold`}
            value={form.headword}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => { setHeadwordDirty(true); dispatch({ type: 'headword', value: e.target.value }) }}
          />
          {form.pendingHeadwordPick && form.examples[0] && (
            <div className="mt-2 rounded-(--radius-field) bg-bg p-2">
              <div className="mb-1 text-[11px] text-muted">点一个词作为要记的词</div>
              <p className="leading-8">
                {tokenize(form.examples[0].text).map((t, i) =>
                  t.isWord ? (
                    <button key={i} type="button" aria-label={`选 ${t.text}`} className="rounded-full px-1 underline decoration-dotted underline-offset-4" onClick={() => { setHeadwordDirty(true); dispatch({ type: 'pickHeadword', word: t.text }) }}>
                      {t.text}
                    </button>
                  ) : <span key={i}>{t.text}</span>,
                )}
              </p>
            </div>
          )}
          {form.dict.lemma && (
            <button type="button" className="mt-1 text-sm text-accent-ink" onClick={() => dispatch({ type: 'acceptLemma' })}>
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
            <button type="button" aria-label="播放发音" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-easy-bg text-easy-fg" disabled={!form.headword.trim()} onClick={() => void audio.play(form.headword.trim())}>▶</button>
          </div>
        </Field>

        <Field label="释义" hint={form.touched.meaning ? '已手动编辑' : undefined}>
          <textarea aria-label="释义" rows={3} className={`${inputCls} resize-none whitespace-pre-line`} value={form.meaning} onChange={(e) => dispatch({ type: 'meaning', value: e.target.value })} />
        </Field>

        {form.examples.map((ex, i) => {
          const carving = exampleView[ex.id] === 'carve'
          const hasText = ex.text.trim().length > 0
          return (
            <Field
              key={ex.id}
              label={`例句 ${i + 1}`}
              hint={
                <>
                  {hasText && (
                    <button
                      type="button"
                      aria-pressed={carving}
                      className="min-h-6 underline underline-offset-4"
                      onClick={() => setExampleView({ ...exampleView, [ex.id]: carving ? 'edit' : 'carve' })}
                    >
                      {carving ? '改原句' : '点词挖空'}
                    </button>
                  )}
                  <button type="button" aria-label={`删除例句 ${i + 1}`} className="min-h-6 text-accent-ink" onClick={() => setPendingExampleDelete({ id: ex.id, index: i + 1, text: ex.text })}>删除</button>
                </>
              }
            >
              {carving ? (
                <ClozeEditor text={ex.text} blanks={ex.blanks} onChange={(blanks) => dispatch({ type: 'exampleBlanks', id: ex.id, blanks })} />
              ) : (
                <textarea
                  aria-label={`例句 ${i + 1}`}
                  rows={2}
                  placeholder="粘一段原文进来，效果比词典例句好"
                  className={`${inputCls} resize-none`}
                  value={ex.text}
                  onChange={(e) => dispatch({ type: 'exampleText', id: ex.id, value: e.target.value })}
                />
              )}
              <input aria-label={`来源 ${i + 1}`} className={`${inputCls} mt-1`} placeholder="来源：文章名 / 剧名（可空）" value={ex.source} onChange={(e) => dispatch({ type: 'exampleSource', id: ex.id, value: e.target.value })} />
            </Field>
          )
        })}
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
        {saveBlocker(form) && !saving && <p className="text-xs text-muted">{saveBlocker(form)}</p>}
        {error && <p role="alert" className="text-xs text-again-fg">{error}</p>}

        {mode === 'edit' && (
          <Button variant="ghost" className="mt-4 text-again-fg" onClick={() => void requestRemove()}>删除这条记录</Button>
        )}
      </div>

      {pendingExampleDelete && (
        <ConfirmSheet
          title={`删除例句 ${pendingExampleDelete.index}`}
          lines={[pendingExampleDelete.text.trim() || '（这句还是空的）']}
          message="这句例句和它上面的挖空会一起删掉；保存之后就不能撤销。"
          safeLabel="保留"
          dangerLabel="删除例句"
          onSafe={() => setPendingExampleDelete(undefined)}
          onDanger={() => { dispatch({ type: 'removeExample', id: pendingExampleDelete.id }); setPendingExampleDelete(undefined) }}
        />
      )}

      {confirmLeave && (
        <ConfirmSheet
          title="这条卡还没保存"
          message="离开会丢掉已经填好的单词、释义和例句。"
          safeLabel="继续编辑"
          dangerLabel="放弃修改"
          onSafe={() => setConfirmLeave(false)}
          onDanger={goBack}
        />
      )}

      {pendingTypeDelete && (
        <ConfirmSheet
          title="关闭卡型会删掉复习记录"
          lines={[
            `关闭 ${pendingTypeDelete.types.map((t) => CARD_TYPE_LABEL[t]).join('、')}`,
            `${pendingTypeDelete.cards} 张卡 · ${pendingTypeDelete.logs} 条复习记录`,
          ]}
          message="这些复习进度会永久删除，不可撤销；单词和例句保留。"
          safeLabel="继续编辑"
          dangerLabel="关闭并保存"
          busy={saving}
          onSafe={() => setPendingTypeDelete(undefined)}
          onDanger={() => { const types = pendingTypeDelete.types; setPendingTypeDelete(undefined); void save(types) }}
        />
      )}

      {pendingDelete && (
        <ConfirmSheet
          title="删除这条记录"
          lines={[
            `「${form.headword.trim() || '这条记录'}」及其 ${pendingDelete.cards} 张卡`,
            `${pendingDelete.logs} 条复习记录`,
          ]}
          message="这些都一起删掉，不能撤销。"
          safeLabel="保留"
          dangerLabel="确认删除"
          busy={saving}
          onSafe={() => setPendingDelete(undefined)}
          onDanger={() => void remove()}
        />
      )}
    </div>
  )
}
