import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { db } from '@/db/db'
import { applyBulkNotes, planBulkNotes, type BulkAction, type BulkPlan, type BulkSummary, type TypeChanges } from '@/db/bulkNotes'
import { CARD_TYPES, CARD_TYPE_LABEL } from '@/domain/types'
import { Button } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'

interface Props {
  noteIds: string[]
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onComplete: (summary: BulkSummary, action: BulkAction) => void
}

/** 选择变化时由父组件重建，不能把旧范围的预览应用到新选择。 */
export function BulkNoteActions({ noteIds, disabled, onBusyChange, onComplete }: Props) {
  const [editing, setEditing] = useState(false)
  const [changes, setChanges] = useState<TypeChanges>({ zh2en: 'keep', cloze: 'keep', en2zh: 'keep' })
  const [plan, setPlan] = useState<BulkPlan>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const working = useRef(false)
  const previewRef = useRef<HTMLElement>(null)
  useEffect(() => { if (plan) previewRef.current?.focus() }, [plan])
  const locked = disabled || busy
  const hasChanges = CARD_TYPES.some((type) => changes[type] !== 'keep')
  const typePlan = plan?.action.kind === 'types' ? plan.action : undefined

  async function preview(action: BulkAction) {
    if (disabled || working.current) return
    working.current = true
    setBusy(true)
    onBusyChange(true)
    setError(undefined)
    setPlan(undefined)
    try {
      setPlan(await planBulkNotes(db, noteIds, action))
    } catch (e) {
      setError(`预览失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      working.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  async function confirm() {
    if (!plan || disabled || working.current) return
    working.current = true
    setBusy(true)
    onBusyChange(true)
    setError(undefined)
    try {
      const summary = await applyBulkNotes(db, plan)
      onComplete(summary, plan.action)
    } catch (e) {
      setPlan(undefined)
      setError(`操作失败，未写入任何更改：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      working.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <section aria-label="批量操作" className="flex flex-col gap-3 rounded-(--radius-card) bg-panel p-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={locked} aria-expanded={editing}
          onClick={() => { setEditing(!editing); setPlan(undefined); setError(undefined) }}>
          {editing ? '收起卡型编辑' : '编辑卡片类型'}
        </Button>
        <Button variant="ghost" className="text-again-fg" disabled={locked} onClick={() => void preview({ kind: 'delete' })}>删除单词</Button>
      </div>
      {editing && (
        <fieldset disabled={locked} className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">批量编辑卡片类型</legend>
          {CARD_TYPES.map((type) => (
            <label key={type} className="flex items-center justify-between gap-3 text-sm">
              {CARD_TYPE_LABEL[type]}
              <select aria-label={`${CARD_TYPE_LABEL[type]}操作`} className="min-h-11 rounded-(--radius-field) border border-line bg-bg px-3"
                value={changes[type]} onChange={(e) => {
                  setChanges({ ...changes, [type]: e.target.value })
                  setPlan(undefined)
                  setError(undefined)
                }}>
                <option value="keep">保持不变</option>
                <option value="enable">启用</option>
                <option value="disable">关闭</option>
              </select>
            </label>
          ))}
          <p className="text-xs text-muted">启用只补建缺少的卡；关闭会删除该卡型及其复习记录，保留单词和例句。其他卡的进度不变。</p>
          <Button variant="secondary" disabled={locked || !hasChanges} onClick={() => void preview({ kind: 'types', changes })}>预览卡型修改</Button>
        </fieldset>
      )}
      {busy && <p role="status" className="text-sm text-muted">正在处理，请稍候…</p>}
      {error && <p role="alert" className="text-sm text-again-fg">{error}</p>}
      {plan && plan.action.kind === 'delete' && (
        <ConfirmSheet
          title="删除单词预览"
          lines={[
            `涉及 ${plan.summary.notes} 个单词`,
            `删除 ${plan.summary.deletedCards} 张卡 · ${plan.summary.deletedLogs} 条复习记录`,
          ]}
          message="这些单词及其全部卡片、复习记录将永久删除，不可撤销。建议先到设置 → 备份到文件 导出一份。"
          safeLabel="取消操作"
          dangerLabel={`确认删除 ${plan.summary.notes} 个单词`}
          busy={locked}
          onSafe={() => setPlan(undefined)}
          onDanger={() => void confirm()}
        />
      )}
      {plan && plan.action.kind === 'types' && (
        <section aria-label="批量操作预览" tabIndex={-1} ref={previewRef} className="flex flex-col gap-2 rounded-(--radius-field) border border-notice-line bg-notice-bg p-3">
          <h2 className="font-semibold">卡型修改预览</h2>
          <p className="text-sm">涉及 {plan.summary.notes} 个单词</p>
          {typePlan && (
            <>
              <p className="text-sm">{CARD_TYPES.filter((type) => typePlan.changes[type] !== 'keep').map((type) =>
                `${CARD_TYPE_LABEL[type]}：${typePlan.changes[type] === 'enable' ? '启用' : '关闭'}`,
              ).join('；')}</p>
              <p className="text-sm">新增 {plan.summary.createdCards} 张卡</p>
              <p className="text-sm">删除 {plan.summary.deletedCards} 张卡 · {plan.summary.deletedLogs} 条复习记录</p>
              {plan.summary.skippedCards > 0 && <p className="text-xs text-muted">{plan.summary.skippedCards} 张卡因缺少例句挖空等必要内容，无法启用，将跳过。</p>}
            </>
          )}
          <p className="text-sm text-notice-fg">单词和例句会保留，即使关闭所有卡型。被关闭卡片的复习进度将永久删除，不可撤销。</p>
          <p className="text-xs text-notice-fg">建议先到<Link to="/settings" className="underline" aria-disabled={locked} tabIndex={locked ? -1 : undefined} onClick={(e) => { if (locked) e.preventDefault() }}>设置导出备份</Link>。</p>
          <Button disabled={locked || plan.summary.notes === 0} onClick={() => void confirm()}>
            确认修改卡片类型
          </Button>
          <Button variant="ghost" disabled={locked} onClick={() => setPlan(undefined)}>取消操作</Button>
        </section>
      )}
    </section>
  )
}
