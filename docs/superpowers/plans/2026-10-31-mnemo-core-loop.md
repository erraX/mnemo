# Mnemo 核心闭环（Plan 2 / 3）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Mnemo 可以真正用起来：输入一个词 → 自动补全、粘原句、挖空、选卡型、保存 → 在复习界面按 FSRS 复习、打分、撤销、听发音，直到今日队列清空。

**Architecture:** 延续 Plan 1：业务逻辑继续写成纯函数（表单状态、会话状态、发音决策）放在 `src/lib`，用 Vitest 测；React 组件只做渲染与事件转发，用 @testing-library/react + jsdom 测关键交互。发音走 spike 验证过的方案 A：有道 URL 交给 `<audio>`，Service Worker 的 `mnemo-audio` CacheFirst 负责离线；失败/超时降级 `speechSynthesis`。

**Tech Stack:** 同 Plan 1（pnpm 11 · Vite 8 · React 19 · TS 7 · Tailwind 4 · Dexie 4 · react-router 7 HashRouter · Vitest 5）+ `@testing-library/react@^16` + `@testing-library/user-event@^14`（仅测试）。

**Spec:** `docs/superpowers/specs/2026-10-30-mnemo-design.md`（§5.4 建卡、§5.6 复习、§5.7 发音、§5.2 卡型）。Mockup：`docs/mockups/mnemo-mockups.html` 第 1、2 节。Spike 结论：`docs/superpowers/spikes/2026-10-30-spike-results.md`（方案 A 可行）。

## Global Constraints

- 所有 Plan 1 的约束继续有效（`/mnemo/` base、DB 名 `mnemo`、ts-fsrs 只在 `scheduler.ts`、04:00 边界、UUID + epoch ms）
- 卡型三种：`zh2en`（正面释义）、`cloze`（正面第一条带挖空的例句，不给中文）、`en2zh`（正面单词 + 音标 + 发音按钮，不自动播）；背面三种共用（规范 §5.2）
- 四档打分按钮文案 `忘了 / 困难 / 记得 / 简单`，下方显示 `scheduler.previewIntervals` 的预计间隔；按钮高 52px、在拇指区（规范 §5.3、§5.6）
- 每打分 20 张插入歇脚页：`已复习 20 张` / `还剩 N 张`，按钮 `继续` / `今天到这`（规范 §5.6）
- 完成页：`今天的复习完成了`、复习数 / 新学数 / 分钟数、`再学 10 张新卡`（调 `addExtraNewToday(db, 10)`）、`回到首页`
- 每次打分立即落库；打分后、撤销后都**重新查询** `getTodayQueue`，不用本地队列推进（最终审查建议）
- 翻面时若 `settings.autoPlayOnReveal` 自动朗读 headword；`en2zh` 正面不自动播但有发音按钮
- 发音：`https://dict.youdao.com/dictvoice?audio=<encodeURIComponent(text)>&type=<1 uk | 2 us>`；3 秒内未开始播放或出错 → `speechSynthesis` 降级（`en-US` / `en-GB`）；`speak` 前 `cancel()`
- 保存记录时预热发音缓存：`fetch(url, { mode: 'no-cors' })`，失败静默
- 建卡：输入停顿 300 ms 查词典，命中填音标 + 释义（不覆盖用户已手改的内容）；变形命中时提示改为原形；查重提示但不阻止；例句改动后重新识别挖空，但用户手动点过的例句不再自动重算；卡型 chip 默认 `settings.lastEnabledTypes`，前提不满足的 chip 置灰并显示原因；保存按钮 `保存 · 生成 N 张卡`
- 编辑记录时若会删卡型：先 `planNoteUpdate`，`window.confirm` 列出将删除的卡型及其复习记录，用户确认后再 `updateNote(..., confirmDelete)`；取消则不保存
- 输入框字号 ≥ 16px（`text-base`）；UI 中文；深色模式跟随系统
- Conventional Commits，英文，不加 Co-Authored-By；每个任务结束 `pnpm test && pnpm build` 通过

## 文件结构

```
src/lib/format.ts              到期/相对时间文案（纯函数）
src/lib/audio.ts               有道 URL、预热、播放器工厂（可注入依赖）、系统 TTS
src/app/useAudio.ts            绑定 settings.accent 的 hook
src/lib/noteForm.ts            建卡表单状态 reducer（纯函数）
src/lib/session.ts             复习会话状态（纯函数）
src/components/ui/Button.tsx   主/次/幽灵按钮
src/components/ui/Field.tsx    标签 + 内容的字段容器
src/components/ui/Chip.tsx     可选 chip（含置灰 + 原因）
src/components/ui/SheetHeader.tsx  取消 / 标题 / 右侧动作
src/components/ClozeText.tsx   按 blanks 渲染：挖空 or 高亮
src/components/ClozeEditor.tsx 点词切换挖空
src/components/review/CardFront.tsx
src/components/review/CardBack.tsx
src/components/review/GradeBar.tsx
src/components/review/BreatherPage.tsx
src/components/review/DonePage.tsx
src/screens/NoteEditor.tsx     /note/new 与 /note/:id
src/screens/Review.tsx         /review
src/app/App.tsx                新路由；/review 下隐藏 UpdatePrompt
src/spikes/AudioSpike.tsx      改为从 lib/audio 导入 youdaoUrl
src/test/render.tsx            testing-library 渲染工具（含 MemoryRouter）
```

---

### Task 1: 测试工具、UI 原语、文案格式化

**Files:**
- Modify: `package.json`
- Create: `src/test/render.tsx`, `src/lib/format.ts`, `src/components/ui/Button.tsx`, `src/components/ui/Field.tsx`, `src/components/ui/Chip.tsx`, `src/components/ui/SheetHeader.tsx`
- Test: `src/lib/format.test.ts`, `src/components/ui/Chip.test.tsx`

**Interfaces:**
- Produces:
  - `dueLabel(due: number, state: FsrsState, now: number): string` — `新` / `今天` / `明天` / `N 天后` / `N 个月后` / `已过期`
  - `minutesBetween(a: number, b: number): number`（四舍五入，最小 1）
  - `Button` props `{ variant?: 'primary' | 'secondary' | 'ghost'; size?: 'md' | 'lg'; className?; disabled?; onClick?; type?; children; 'aria-label'? }`
  - `Field` props `{ label: string; hint?: ReactNode; children }`
  - `Chip` props `{ selected: boolean; disabled?: boolean; reason?: string; onToggle(): void; children }`
  - `SheetHeader` props `{ title: string; onCancel(): void; cancelLabel?: string; action?: { label: string; onClick(): void; disabled?: boolean } }`
  - `renderWithRouter(ui, { route?: string })` from `src/test/render.tsx`

- [ ] **Step 1: 加测试依赖**

```bash
pnpm add -D @testing-library/react@^16.3.3 @testing-library/user-event@^14.6.1 @testing-library/dom@^10.4.0
```

- [ ] **Step 2: 写失败测试**

`src/lib/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { dueLabel, minutesBetween } from './format'

const local = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime()
const NOW = local(2026, 10, 31, 10)

describe('dueLabel', () => {
  it('labels new, today, tomorrow, N days, months, overdue', () => {
    expect(dueLabel(NOW, 0, NOW)).toBe('新')
    expect(dueLabel(local(2026, 10, 31, 23), 2, NOW)).toBe('今天')
    expect(dueLabel(local(2026, 11, 1, 9), 2, NOW)).toBe('明天')
    expect(dueLabel(local(2026, 11, 3, 9), 2, NOW)).toBe('3 天后')
    expect(dueLabel(local(2027, 1, 15, 9), 2, NOW)).toBe('3 个月后')
    expect(dueLabel(local(2026, 10, 29, 9), 2, NOW)).toBe('已过期')
  })
  it('learning cards due within the hour show minutes', () => {
    expect(dueLabel(NOW + 10 * 60_000, 1, NOW)).toBe('10 分钟后')
  })
})

describe('minutesBetween', () => {
  it('rounds and floors at 1', () => {
    expect(minutesBetween(NOW, NOW + 90_000)).toBe(2)
    expect(minutesBetween(NOW, NOW + 10_000)).toBe(1)
  })
})
```

`src/components/ui/Chip.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Chip } from './Chip'

describe('Chip', () => {
  it('toggles when enabled and shows the reason when disabled', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<Chip selected={false} onToggle={onToggle}>中 → 英</Chip>)
    fireEvent.click(screen.getByRole('button', { name: '中 → 英' }))
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<Chip selected={false} disabled reason="先填写释义" onToggle={onToggle}>中 → 英</Chip>)
    const btn = screen.getByRole('button', { name: /中 → 英/ })
    expect(btn).toBeDisabled()
    expect(btn.getAttribute('title')).toBe('先填写释义')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
  it('marks selection with aria-pressed', () => {
    render(<Chip selected onToggle={() => {}}>例句挖空</Chip>)
    expect(screen.getByRole('button', { name: '例句挖空' }).getAttribute('aria-pressed')).toBe('true')
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm vitest run src/lib/format.test.ts src/components/ui/Chip.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现**

`src/lib/format.ts`:
```ts
import type { FsrsState } from '@/domain/types'
import { learningDayStart } from './day'

const DAY = 86_400_000

export function minutesBetween(a: number, b: number): number {
  return Math.max(1, Math.round(Math.abs(b - a) / 60_000))
}

/** 卡片列表 / 背面用的到期文案 */
export function dueLabel(due: number, state: FsrsState, now: number): string {
  if (state === 0) return '新'
  if (state === 1 || state === 3) {
    if (due <= now) return '现在'
    if (due - now < 60 * 60_000) return `${minutesBetween(now, due)} 分钟后`
  }
  const dayDiff = Math.round((learningDayStart(due) - learningDayStart(now)) / DAY)
  if (dayDiff < 0) return '已过期'
  if (dayDiff === 0) return '今天'
  if (dayDiff === 1) return '明天'
  if (dayDiff < 60) return `${dayDiff} 天后`
  return `${Math.round(dayDiff / 30)} 个月后`
}
```

`src/components/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-white',
  secondary: 'bg-easy-bg text-accent',
  ghost: 'bg-transparent text-accent',
}
const SIZE: Record<Size, string> = { md: 'h-11 px-4 text-[15px]', lg: 'h-[50px] px-5 text-base' }

export function Button({
  variant = 'primary', size = 'md', className = '', children, type = 'button', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <button
      type={type}
      className={`rounded-(--radius-card) font-semibold disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
```

`src/components/ui/Field.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-(--radius-field) bg-panel px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
        <span>{label}</span>
        {hint && <span className="normal-case tracking-normal">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
```

`src/components/ui/Chip.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Chip({
  selected, disabled = false, reason, onToggle, children,
}: { selected: boolean; disabled?: boolean; reason?: string; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={disabled ? reason : undefined}
      onClick={onToggle}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
        selected ? 'border-ink bg-ink text-bg' : 'border-line bg-panel text-ink'
      }`}
    >
      {children}
    </button>
  )
}
```

`src/components/ui/SheetHeader.tsx`:
```tsx
export function SheetHeader({
  title, onCancel, cancelLabel = '取消', action,
}: { title: string; onCancel: () => void; cancelLabel?: string; action?: { label: string; onClick: () => void; disabled?: boolean } }) {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel/95 px-4 pb-2 backdrop-blur"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
    >
      <button type="button" className="min-w-12 text-left text-[15px] text-accent" onClick={onCancel}>{cancelLabel}</button>
      <h1 className="text-[15px] font-semibold">{title}</h1>
      {action ? (
        <button type="button" className="min-w-12 text-right text-[15px] font-semibold text-accent disabled:opacity-40" disabled={action.disabled} onClick={action.onClick}>
          {action.label}
        </button>
      ) : <span className="min-w-12" />}
    </header>
  )
}
```

`src/test/render.tsx`:
```tsx
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

/** 把组件放进 MemoryRouter；path 可带参数（如 /note/:id），route 是初始地址 */
export function renderWithRouter(ui: ReactElement, { route = '/', path = '*' }: { route?: string; path?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
        <Route path="*" element={<div data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>,
  )
}
```

- [ ] **Step 5: 运行测试与构建**

Run: `pnpm vitest run src/lib/format.test.ts src/components/ui/Chip.test.tsx && pnpm test && pnpm build`
Expected: 新增 5 个用例通过；全量通过；构建通过

- [ ] **Step 6: 提交**

```bash
git add package.json pnpm-lock.yaml src/test/render.tsx src/lib/format.ts src/lib/format.test.ts src/components/ui
git commit -m "feat(ui): button, field, chip, sheet header primitives and due-label formatting"
```

---

### Task 2: 发音模块 `audio.ts` + `useAudio`

**Files:**
- Create: `src/lib/audio.ts`, `src/app/useAudio.ts`
- Modify: `src/spikes/AudioSpike.tsx`（改为 `import { youdaoUrl } from '@/lib/audio'`，删除本地定义）
- Test: `src/lib/audio.test.ts`

**Interfaces:**
- Produces:
  - `youdaoUrl(text: string, accent: Accent): string`
  - `prefetchAudio(text: string, accent: Accent, fetchImpl?: typeof fetch): Promise<void>` — 静默失败
  - `interface AudioElementLike { src: string; play(): Promise<void>; pause(): void; addEventListener(type: 'playing' | 'error' | 'ended', cb: () => void): void; removeEventListener(type: 'playing' | 'error' | 'ended', cb: () => void): void }`
  - `interface PlayerDeps { createElement(): AudioElementLike; speak(text: string, accent: Accent): boolean; timeoutMs?: number; setTimeout?: typeof setTimeout; clearTimeout?: typeof clearTimeout }`
  - `createPlayer(deps: PlayerDeps): { play(text: string, accent: Accent): Promise<'youdao' | 'tts' | 'none'>; stop(): void }`
  - `systemSpeak(text: string, accent: Accent): boolean` — 浏览器实现，无 `speechSynthesis` 时返回 false
  - `useAudio(): { play(text: string): Promise<'youdao' | 'tts' | 'none'>; prefetch(text: string): Promise<void>; accent: Accent }`

- [ ] **Step 1: 写失败测试**

`src/lib/audio.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlayer, prefetchAudio, youdaoUrl, type AudioElementLike } from './audio'

class FakeAudio implements AudioElementLike {
  src = ''
  paused = true
  listeners: Record<string, Array<() => void>> = {}
  static instances: FakeAudio[] = []
  static mode: 'playing' | 'error' | 'silent' = 'playing'
  constructor() { FakeAudio.instances.push(this) }
  addEventListener(type: string, cb: () => void) { (this.listeners[type] ??= []).push(cb) }
  removeEventListener(type: string, cb: () => void) { this.listeners[type] = (this.listeners[type] ?? []).filter((x) => x !== cb) }
  async play() {
    this.paused = false
    if (FakeAudio.mode === 'playing') queueMicrotask(() => this.listeners.playing?.forEach((cb) => cb()))
    if (FakeAudio.mode === 'error') queueMicrotask(() => this.listeners.error?.forEach((cb) => cb()))
  }
  pause() { this.paused = true }
}

describe('youdaoUrl', () => {
  it('encodes text and maps accent to type', () => {
    expect(youdaoUrl('have some concerns', 'us')).toBe('https://dict.youdao.com/dictvoice?audio=have%20some%20concerns&type=2')
    expect(youdaoUrl('concern', 'uk')).toBe('https://dict.youdao.com/dictvoice?audio=concern&type=1')
  })
})

describe('prefetchAudio', () => {
  it('fetches with no-cors and swallows errors', async () => {
    const ok = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    await prefetchAudio('concern', 'us', ok)
    expect(ok).toHaveBeenCalledWith(youdaoUrl('concern', 'us'), { mode: 'no-cors' })
    const bad = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(prefetchAudio('concern', 'us', bad)).resolves.toBeUndefined()
  })
})

describe('createPlayer', () => {
  beforeEach(() => { vi.useFakeTimers(); FakeAudio.instances = []; FakeAudio.mode = 'playing' })
  afterEach(() => vi.useRealTimers())

  it('resolves youdao when playback starts', async () => {
    const speak = vi.fn(() => true)
    const p = createPlayer({ createElement: () => new FakeAudio(), speak, timeoutMs: 3000 })
    const result = p.play('concern', 'us')
    await vi.advanceTimersByTimeAsync(0)
    expect(await result).toBe('youdao')
    expect(FakeAudio.instances[0]!.src).toBe(youdaoUrl('concern', 'us'))
    expect(speak).not.toHaveBeenCalled()
  })

  it('falls back to tts on error', async () => {
    FakeAudio.mode = 'error'
    const speak = vi.fn(() => true)
    const p = createPlayer({ createElement: () => new FakeAudio(), speak, timeoutMs: 3000 })
    const result = p.play('concern', 'uk')
    await vi.advanceTimersByTimeAsync(0)
    expect(await result).toBe('tts')
    expect(speak).toHaveBeenCalledWith('concern', 'uk')
  })

  it('falls back to tts after the timeout when nothing starts', async () => {
    FakeAudio.mode = 'silent'
    const speak = vi.fn(() => true)
    const p = createPlayer({ createElement: () => new FakeAudio(), speak, timeoutMs: 3000 })
    const result = p.play('concern', 'us')
    await vi.advanceTimersByTimeAsync(2999)
    expect(speak).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toBe('tts')
  })

  it('returns none when tts is unavailable too', async () => {
    FakeAudio.mode = 'error'
    const p = createPlayer({ createElement: () => new FakeAudio(), speak: () => false, timeoutMs: 3000 })
    const result = p.play('concern', 'us')
    await vi.advanceTimersByTimeAsync(0)
    expect(await result).toBe('none')
  })

  it('reuses one element and stops the previous playback', async () => {
    const p = createPlayer({ createElement: () => new FakeAudio(), speak: () => true, timeoutMs: 3000 })
    void p.play('a', 'us')
    await vi.advanceTimersByTimeAsync(0)
    void p.play('b', 'us')
    await vi.advanceTimersByTimeAsync(0)
    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.instances[0]!.src).toBe(youdaoUrl('b', 'us'))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/audio.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/audio.ts`:
```ts
import type { Accent } from '@/domain/types'

export function youdaoUrl(text: string, accent: Accent): string {
  const type = accent === 'uk' ? 1 : 2
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${type}`
}

/** 预热 Service Worker 的 mnemo-audio 缓存；离线或失败时静默 */
export async function prefetchAudio(text: string, accent: Accent, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl(youdaoUrl(text, accent), { mode: 'no-cors' })
  } catch {
    /* 离线：复习时会走 TTS 降级 */
  }
}

export interface AudioElementLike {
  src: string
  play(): Promise<void>
  pause(): void
  addEventListener(type: 'playing' | 'error' | 'ended', cb: () => void): void
  removeEventListener(type: 'playing' | 'error' | 'ended', cb: () => void): void
}

export interface PlayerDeps {
  createElement(): AudioElementLike
  /** 返回 false 表示系统 TTS 不可用 */
  speak(text: string, accent: Accent): boolean
  timeoutMs?: number
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

export type PlayOutcome = 'youdao' | 'tts' | 'none'

export function createPlayer(deps: PlayerDeps) {
  const timeoutMs = deps.timeoutMs ?? 3000
  const setT = deps.setTimeout ?? setTimeout
  const clearT = deps.clearTimeout ?? clearTimeout
  let el: AudioElementLike | undefined
  let cleanup: (() => void) | undefined

  function stop() {
    cleanup?.()
    cleanup = undefined
    el?.pause()
  }

  function play(text: string, accent: Accent): Promise<PlayOutcome> {
    stop()
    el ??= deps.createElement()
    const audio = el
    return new Promise<PlayOutcome>((resolve) => {
      let settled = false
      const finish = (outcome: PlayOutcome) => {
        if (settled) return
        settled = true
        cleanup?.()
        cleanup = undefined
        resolve(outcome)
      }
      const fallback = () => {
        audio.pause()
        finish(deps.speak(text, accent) ? 'tts' : 'none')
      }
      const onPlaying = () => finish('youdao')
      const onError = () => fallback()
      const timer = setT(fallback, timeoutMs)
      cleanup = () => {
        clearT(timer)
        audio.removeEventListener('playing', onPlaying)
        audio.removeEventListener('error', onError)
      }
      audio.addEventListener('playing', onPlaying)
      audio.addEventListener('error', onError)
      audio.src = youdaoUrl(text, accent)
      audio.play().catch(() => fallback())
    })
  }

  return { play, stop }
}

/** 浏览器实现：speechSynthesis；首次必须由用户手势触发 */
export function systemSpeak(text: string, accent: Accent): boolean {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return false
  const lang = accent === 'uk' ? 'en-GB' : 'en-US'
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
    ?? speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('en'))
  if (voice) u.voice = voice
  speechSynthesis.speak(u)
  return true
}
```

`src/app/useAudio.ts`:
```ts
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/db/db'
import { getSettings } from '@/db/repo'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { createPlayer, prefetchAudio, systemSpeak, type PlayOutcome } from '@/lib/audio'

let shared: ReturnType<typeof createPlayer> | undefined
function player() {
  shared ??= createPlayer({ createElement: () => new Audio(), speak: systemSpeak })
  return shared
}

export function useAudio(): { play(text: string): Promise<PlayOutcome>; prefetch(text: string): Promise<void>; accent: 'us' | 'uk' } {
  const settings = useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS)
  const accent = settings.accent
  return useMemo(
    () => ({
      accent,
      play: (text: string) => player().play(text, accent),
      prefetch: (text: string) => prefetchAudio(text, accent),
    }),
    [accent],
  )
}
```

`src/spikes/AudioSpike.tsx`：删除文件内的 `type Accent` 与 `export function youdaoUrl(...)`，改为顶部 `import { youdaoUrl } from '@/lib/audio'` 和 `import type { Accent } from '@/domain/types'`。其余不变。

- [ ] **Step 4: 运行测试与构建**

Run: `pnpm vitest run src/lib/audio.test.ts && pnpm test && pnpm build`
Expected: 7 个新用例通过；全量通过；构建通过（AudioSpike 仍可编译）

- [ ] **Step 5: 提交**

```bash
git add src/lib/audio.ts src/lib/audio.test.ts src/app/useAudio.ts src/spikes/AudioSpike.tsx
git commit -m "feat(audio): Youdao player with system TTS fallback and cache prefetch"
```

---

### Task 3: 挖空渲染与编辑组件

**Files:**
- Create: `src/components/ClozeText.tsx`, `src/components/ClozeEditor.tsx`
- Test: `src/components/ClozeText.test.tsx`, `src/components/ClozeEditor.test.tsx`

**Interfaces:**
- Consumes: `segments, tokenize, toggleBlank` from `@/lib/cloze`; `Blank`
- Produces:
  - `ClozeText` props `{ text: string; blanks: Blank[]; mode: 'blank' | 'highlight'; className? }` — `blank` 模式把挖空渲染成下划线空格（宽度 ≈ 字数 × 0.6em，最小 3em），`highlight` 模式渲染成高亮
  - `ClozeEditor` props `{ text: string; blanks: Blank[]; onChange(blanks: Blank[]): void }` — 每个词 token 是一个按钮，点击切换

- [ ] **Step 1: 写失败测试**

`src/components/ClozeText.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ClozeText } from './ClozeText'

const text = 'I have some concerns about it.'
const blanks = [{ start: 12, end: 20 }]

describe('ClozeText', () => {
  it('renders a blank placeholder without the word in blank mode', () => {
    const { container } = render(<ClozeText text={text} blanks={blanks} mode="blank" />)
    expect(container.textContent).not.toContain('concerns')
    const blank = container.querySelector('[data-blank]')!
    expect(blank.getAttribute('aria-label')).toBe('空格')
    expect((blank as HTMLElement).style.minWidth).toBe('4.8em')
  })
  it('renders the word highlighted in highlight mode', () => {
    const { container } = render(<ClozeText text={text} blanks={blanks} mode="highlight" />)
    expect(container.textContent).toBe(text)
    expect(container.querySelector('mark')!.textContent).toBe('concerns')
  })
})
```

`src/components/ClozeEditor.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClozeEditor } from './ClozeEditor'

describe('ClozeEditor', () => {
  it('toggles a blank when a word is tapped and reports sorted blanks', () => {
    const onChange = vi.fn()
    render(<ClozeEditor text="I have some concerns." blanks={[{ start: 12, end: 20 }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'have' }))
    expect(onChange).toHaveBeenCalledWith([{ start: 2, end: 6 }, { start: 12, end: 20 }])
    fireEvent.click(screen.getByRole('button', { name: 'concerns' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
  it('marks blanked words with aria-pressed', () => {
    render(<ClozeEditor text="I have some concerns." blanks={[{ start: 12, end: 20 }]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'concerns' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'have' }).getAttribute('aria-pressed')).toBe('false')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/components/ClozeText.test.tsx src/components/ClozeEditor.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/components/ClozeText.tsx`:
```tsx
import type { Blank } from '@/domain/types'
import { segments } from '@/lib/cloze'

export function ClozeText({
  text, blanks, mode, className = '',
}: { text: string; blanks: Blank[]; mode: 'blank' | 'highlight'; className?: string }) {
  return (
    <span className={className}>
      {segments(text, blanks).map((seg, i) =>
        !seg.blank ? (
          <span key={i}>{seg.text}</span>
        ) : mode === 'highlight' ? (
          <mark key={i} className="rounded-sm bg-cloze px-0.5 text-ink">{seg.text}</mark>
        ) : (
          <span
            key={i}
            data-blank
            role="img"
            aria-label="空格"
            className="mx-0.5 inline-block border-b-2 border-accent align-baseline"
            style={{ minWidth: `${Math.max(3, seg.text.length * 0.6)}em` }}
          >
            &nbsp;
          </span>
        ),
      )}
    </span>
  )
}
```

`src/components/ClozeEditor.tsx`:
```tsx
import type { Blank } from '@/domain/types'
import { tokenize, toggleBlank } from '@/lib/cloze'

export function ClozeEditor({ text, blanks, onChange }: { text: string; blanks: Blank[]; onChange: (blanks: Blank[]) => void }) {
  const isBlank = (start: number, end: number) => blanks.some((b) => b.start === start && b.end === end)
  return (
    <p className="text-base leading-8">
      {tokenize(text).map((t, i) =>
        t.isWord ? (
          <button
            key={i}
            type="button"
            aria-pressed={isBlank(t.start, t.end)}
            onClick={() => onChange(toggleBlank(blanks, t))}
            className={`rounded-sm px-0.5 ${isBlank(t.start, t.end) ? 'bg-cloze text-ink underline decoration-2 underline-offset-4' : ''}`}
          >
            {t.text}
          </button>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </p>
  )
}
```

- [ ] **Step 4: 运行测试与构建**

Run: `pnpm vitest run src/components/ClozeText.test.tsx src/components/ClozeEditor.test.tsx && pnpm test && pnpm build`
Expected: 4 个新用例通过；全量通过；构建通过

- [ ] **Step 5: 提交**

```bash
git add src/components/ClozeText.tsx src/components/ClozeText.test.tsx src/components/ClozeEditor.tsx src/components/ClozeEditor.test.tsx
git commit -m "feat(cloze): blank/highlight renderer and tap-to-toggle editor"
```

---

### Task 4: 建卡表单状态 `noteForm.ts`（纯函数）

**Files:**
- Create: `src/lib/noteForm.ts`
- Test: `src/lib/noteForm.test.ts`

**Interfaces:**
- Consumes: `detectBlanks` from `@/lib/cloze`; `availableTypes, filterEnabled` from `@/lib/cardTypes`; `CardType, DictEntry, Note, Blank`; `NoteInput` from `@/db/repo`
- Produces:
  - `interface ExampleDraft { id: string; text: string; source: string; blanks: Blank[]; manual: boolean }`
  - `interface NoteFormState { headword: string; phonetic: string; meaning: string; examples: ExampleDraft[]; tags: string; types: CardType[]; touched: { phonetic: boolean; meaning: boolean }; dict: { status: 'idle' | 'hit' | 'miss'; forms: string[]; lemma?: string } }`
  - `type NoteFormAction = { type: 'reset'; state: NoteFormState } | { type: 'headword'; value: string } | { type: 'dictResult'; result: { entry: DictEntry; viaForm: boolean } | undefined } | { type: 'acceptLemma' } | { type: 'phonetic'; value: string } | { type: 'meaning'; value: string } | { type: 'tags'; value: string } | { type: 'addExample' } | { type: 'removeExample'; id: string } | { type: 'exampleText'; id: string; value: string } | { type: 'exampleSource'; id: string; value: string } | { type: 'exampleBlanks'; id: string; blanks: Blank[] } | { type: 'toggleType'; cardType: CardType }`
  - `initialForm(defaults: CardType[], note?: Note): NoteFormState`
  - `reduceForm(state, action): NoteFormState`
  - `toNoteInput(state): NoteInput`
  - `formAvailability(state)` → `availableTypes(...)` 结果
  - `effectiveTypes(state): CardType[]` — 勾选 ∩ 前提满足
  - `canSave(state): boolean`
  - `saveLabel(state, mode: 'new' | 'edit'): string` — `保存 · 生成 N 张卡` / `保存修改`

- [ ] **Step 1: 写失败测试**

`src/lib/noteForm.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { DictEntry, Note } from '@/domain/types'
import { canSave, effectiveTypes, initialForm, reduceForm, saveLabel, toNoteInput, type NoteFormState } from './noteForm'

const concern: DictEntry = { word: 'concern', phonetic: "kən'sə:n", translation: 'n. 关心, 忧虑\nvt. 与...有关', forms: ['concerns', 'concerned', 'concerning'] }
const ALL = ['zh2en', 'cloze', 'en2zh'] as const

function run(state: NoteFormState, ...actions: Parameters<typeof reduceForm>[1][]) {
  return actions.reduce(reduceForm, state)
}

describe('dictionary fill', () => {
  it('fills phonetic and meaning on hit, but never overwrites user edits', () => {
    const s0 = initialForm([...ALL])
    const s1 = run(s0, { type: 'headword', value: 'concern' }, { type: 'dictResult', result: { entry: concern, viaForm: false } })
    expect(s1.phonetic).toBe("kən'sə:n")
    expect(s1.meaning).toBe('n. 关心, 忧虑\nvt. 与...有关')
    expect(s1.dict).toEqual({ status: 'hit', forms: concern.forms, lemma: undefined })

    const s2 = run(s1, { type: 'meaning', value: '担忧' }, { type: 'dictResult', result: { entry: concern, viaForm: false } })
    expect(s2.meaning).toBe('担忧')
    expect(s2.touched.meaning).toBe(true)
  })
  it('records a miss and keeps fields', () => {
    const s = run(initialForm([...ALL]), { type: 'headword', value: 'ticking time bomb' }, { type: 'dictResult', result: undefined })
    expect(s.dict.status).toBe('miss')
    expect(s.phonetic).toBe('')
  })
  it('offers the lemma when matched via an inflection and applies it on acceptLemma', () => {
    const s1 = run(initialForm([...ALL]), { type: 'headword', value: 'concerns' }, { type: 'dictResult', result: { entry: concern, viaForm: true } })
    expect(s1.dict.lemma).toBe('concern')
    const s2 = reduceForm(s1, { type: 'acceptLemma' })
    expect(s2.headword).toBe('concern')
    expect(s2.dict.lemma).toBeUndefined()
  })
  it('a new headword resets dict status to idle', () => {
    const s = run(initialForm([...ALL]), { type: 'dictResult', result: { entry: concern, viaForm: false } }, { type: 'headword', value: 'lev' })
    expect(s.dict.status).toBe('idle')
  })
})

describe('examples and cloze detection', () => {
  const base = run(initialForm([...ALL]), { type: 'headword', value: 'concern' }, { type: 'dictResult', result: { entry: concern, viaForm: false } }, { type: 'addExample' })
  const id = () => base.examples[0]!.id

  it('auto-detects blanks when example text changes', () => {
    const s = reduceForm(base, { type: 'exampleText', id: id(), value: 'I have some concerns about it.' })
    expect(s.examples[0]!.blanks).toEqual([{ start: 12, end: 20 }])
    expect(s.examples[0]!.manual).toBe(false)
  })
  it('re-detects for non-manual examples when the headword changes', () => {
    const s1 = reduceForm(base, { type: 'exampleText', id: id(), value: 'I have some concerns about it.' })
    const s2 = reduceForm(s1, { type: 'headword', value: 'have' })
    expect(s2.examples[0]!.blanks).toEqual([{ start: 2, end: 6 }])
  })
  it('stops auto-detection once the user toggled blanks manually', () => {
    const s1 = reduceForm(base, { type: 'exampleText', id: id(), value: 'I have some concerns about it.' })
    const s2 = reduceForm(s1, { type: 'exampleBlanks', id: id(), blanks: [{ start: 2, end: 6 }] })
    const s3 = reduceForm(s2, { type: 'exampleText', id: id(), value: 'I have some concerns about it!' })
    expect(s3.examples[0]!.manual).toBe(true)
    expect(s3.examples[0]!.blanks).toEqual([{ start: 2, end: 6 }])
  })
  it('removes examples and edits sources', () => {
    const s1 = reduceForm(base, { type: 'exampleSource', id: id(), value: 'The Economist' })
    expect(s1.examples[0]!.source).toBe('The Economist')
    expect(reduceForm(s1, { type: 'removeExample', id: id() }).examples).toHaveLength(0)
  })
})

describe('types, save label, note input', () => {
  it('effective types exclude unavailable ones and the label counts them', () => {
    const s = run(initialForm([...ALL]), { type: 'headword', value: 'concern' })
    expect(effectiveTypes(s)).toEqual(['en2zh'])
    expect(saveLabel(s, 'new')).toBe('保存 · 生成 1 张卡')
    expect(saveLabel(s, 'edit')).toBe('保存修改')
    const withMeaning = reduceForm(s, { type: 'meaning', value: '担忧' })
    expect(effectiveTypes(withMeaning)).toEqual(['zh2en', 'en2zh'])
  })
  it('toggleType flips membership and keeps canonical order', () => {
    const s = run(initialForm(['en2zh']), { type: 'toggleType', cardType: 'zh2en' })
    expect(s.types).toEqual(['zh2en', 'en2zh'])
    expect(reduceForm(s, { type: 'toggleType', cardType: 'en2zh' }).types).toEqual(['zh2en'])
  })
  it('canSave needs a headword and at least one effective type', () => {
    expect(canSave(initialForm([...ALL]))).toBe(false)
    expect(canSave(run(initialForm([...ALL]), { type: 'headword', value: 'x' }))).toBe(true)
    expect(canSave(run(initialForm([]), { type: 'headword', value: 'x' }))).toBe(false)
  })
  it('toNoteInput trims, splits tags on commas/spaces, drops empty examples', () => {
    const s = run(initialForm([...ALL]),
      { type: 'headword', value: ' concern ' }, { type: 'meaning', value: '担忧' },
      { type: 'tags', value: 'cet4, 工作 经济' }, { type: 'addExample' }, { type: 'addExample' })
    const withText = reduceForm(s, { type: 'exampleText', id: s.examples[0]!.id, value: 'I have concerns.' })
    const input = toNoteInput(withText)
    expect(input.headword).toBe('concern')
    expect(input.tags).toEqual(['cet4', '工作', '经济'])
    expect(input.examples).toEqual([{ text: 'I have concerns.', source: undefined, blanks: [{ start: 7, end: 15 }] }])
    expect(input.enabledTypes).toEqual(['zh2en', 'cloze', 'en2zh'])
  })
  it('initialForm from an existing note restores fields and marks examples manual', () => {
    const note: Note = {
      id: 'n1', headword: 'concern', headwordKey: 'concern', phonetic: 'x', meaning: 'm',
      examples: [{ text: 'I have concerns.', source: 's', blanks: [{ start: 7, end: 15 }] }],
      tags: ['a', 'b'], enabledTypes: ['cloze'], createdAt: 1, updatedAt: 1,
    }
    const s = initialForm(['zh2en'], note)
    expect(s).toMatchObject({ headword: 'concern', phonetic: 'x', meaning: 'm', tags: 'a, b', types: ['cloze'], touched: { phonetic: true, meaning: true } })
    expect(s.examples[0]).toMatchObject({ text: 'I have concerns.', source: 's', manual: true })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/noteForm.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/noteForm.ts`:
```ts
import type { NoteInput } from '@/db/repo'
import { CARD_TYPES, type Blank, type CardType, type DictEntry, type Note } from '@/domain/types'
import { availableTypes, filterEnabled } from './cardTypes'
import { detectBlanks } from './cloze'

export interface ExampleDraft {
  id: string
  text: string
  source: string
  blanks: Blank[]
  /** 用户手动点过挖空后不再自动重算 */
  manual: boolean
}

export interface NoteFormState {
  headword: string
  phonetic: string
  meaning: string
  examples: ExampleDraft[]
  tags: string
  types: CardType[]
  touched: { phonetic: boolean; meaning: boolean }
  dict: { status: 'idle' | 'hit' | 'miss'; forms: string[]; lemma?: string }
}

export type NoteFormAction =
  | { type: 'reset'; state: NoteFormState }
  | { type: 'headword'; value: string }
  | { type: 'dictResult'; result: { entry: DictEntry; viaForm: boolean } | undefined }
  | { type: 'acceptLemma' }
  | { type: 'phonetic'; value: string }
  | { type: 'meaning'; value: string }
  | { type: 'tags'; value: string }
  | { type: 'addExample' }
  | { type: 'removeExample'; id: string }
  | { type: 'exampleText'; id: string; value: string }
  | { type: 'exampleSource'; id: string; value: string }
  | { type: 'exampleBlanks'; id: string; blanks: Blank[] }
  | { type: 'toggleType'; cardType: CardType }

const canonical = (types: CardType[]) => CARD_TYPES.filter((t) => types.includes(t))

export function initialForm(defaults: CardType[], note?: Note): NoteFormState {
  if (!note) {
    return {
      headword: '', phonetic: '', meaning: '', examples: [], tags: '',
      types: canonical(defaults), touched: { phonetic: false, meaning: false }, dict: { status: 'idle', forms: [] },
    }
  }
  return {
    headword: note.headword,
    phonetic: note.phonetic ?? '',
    meaning: note.meaning,
    examples: note.examples.map((e) => ({ id: crypto.randomUUID(), text: e.text, source: e.source ?? '', blanks: e.blanks, manual: true })),
    tags: note.tags.join(', '),
    types: canonical(note.enabledTypes),
    touched: { phonetic: true, meaning: true },
    dict: { status: 'idle', forms: [] },
  }
}

function redetect(examples: ExampleDraft[], headword: string, forms: string[]): ExampleDraft[] {
  return examples.map((e) => (e.manual ? e : { ...e, blanks: detectBlanks(e.text, headword, forms) }))
}

export function reduceForm(s: NoteFormState, a: NoteFormAction): NoteFormState {
  switch (a.type) {
    case 'reset':
      return a.state
    case 'headword':
      return { ...s, headword: a.value, dict: { status: 'idle', forms: [] }, examples: redetect(s.examples, a.value, []) }
    case 'dictResult': {
      if (!a.result) return { ...s, dict: { status: 'miss', forms: [] } }
      const { entry, viaForm } = a.result
      return {
        ...s,
        phonetic: s.touched.phonetic ? s.phonetic : entry.phonetic,
        meaning: s.touched.meaning ? s.meaning : entry.translation,
        dict: { status: 'hit', forms: entry.forms, lemma: viaForm ? entry.word : undefined },
        examples: redetect(s.examples, s.headword, entry.forms),
      }
    }
    case 'acceptLemma':
      if (!s.dict.lemma) return s
      return { ...s, headword: s.dict.lemma, dict: { ...s.dict, lemma: undefined }, examples: redetect(s.examples, s.dict.lemma, s.dict.forms) }
    case 'phonetic':
      return { ...s, phonetic: a.value, touched: { ...s.touched, phonetic: true } }
    case 'meaning':
      return { ...s, meaning: a.value, touched: { ...s.touched, meaning: true } }
    case 'tags':
      return { ...s, tags: a.value }
    case 'addExample':
      return { ...s, examples: [...s.examples, { id: crypto.randomUUID(), text: '', source: '', blanks: [], manual: false }] }
    case 'removeExample':
      return { ...s, examples: s.examples.filter((e) => e.id !== a.id) }
    case 'exampleText':
      return {
        ...s,
        examples: s.examples.map((e) =>
          e.id !== a.id ? e : { ...e, text: a.value, blanks: e.manual ? e.blanks : detectBlanks(a.value, s.headword, s.dict.forms) }),
      }
    case 'exampleSource':
      return { ...s, examples: s.examples.map((e) => (e.id === a.id ? { ...e, source: a.value } : e)) }
    case 'exampleBlanks':
      return { ...s, examples: s.examples.map((e) => (e.id === a.id ? { ...e, blanks: a.blanks, manual: true } : e)) }
    case 'toggleType':
      return { ...s, types: canonical(s.types.includes(a.cardType) ? s.types.filter((t) => t !== a.cardType) : [...s.types, a.cardType]) }
  }
}

export function toNoteInput(s: NoteFormState): NoteInput {
  return {
    headword: s.headword.trim(),
    phonetic: s.phonetic.trim() || undefined,
    meaning: s.meaning.trim(),
    examples: s.examples
      .filter((e) => e.text.trim().length > 0)
      .map((e) => ({ text: e.text, source: e.source.trim() || undefined, blanks: e.blanks })),
    tags: s.tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean),
    enabledTypes: s.types,
  }
}

export function formAvailability(s: NoteFormState) {
  return availableTypes(toNoteInput(s))
}

export function effectiveTypes(s: NoteFormState): CardType[] {
  return filterEnabled(toNoteInput(s), s.types)
}

export function canSave(s: NoteFormState): boolean {
  return s.headword.trim().length > 0 && effectiveTypes(s).length > 0
}

export function saveLabel(s: NoteFormState, mode: 'new' | 'edit'): string {
  return mode === 'edit' ? '保存修改' : `保存 · 生成 ${effectiveTypes(s).length} 张卡`
}
```

- [ ] **Step 4: 运行测试与构建**

Run: `pnpm vitest run src/lib/noteForm.test.ts && pnpm test && pnpm build`
Expected: 13 个用例通过；全量通过；构建通过

- [ ] **Step 5: 提交**

```bash
git add src/lib/noteForm.ts src/lib/noteForm.test.ts
git commit -m "feat(editor): note form reducer with dictionary fill and cloze re-detection"
```

---

### Task 5: 建卡 / 编辑界面 `NoteEditor.tsx`

**Files:**
- Create: `src/screens/NoteEditor.tsx`
- Modify: `src/app/App.tsx`（路由 `/note/new`、`/note/:id`）
- Test: `src/screens/NoteEditor.test.tsx`

**Interfaces:**
- Consumes: `db`; `createNote, updateNote, planNoteUpdate, deleteNote, findDuplicate, getSettings, lookupWord`；`scheduler`；`noteForm` 全部；`useAudio`；`ClozeEditor`；UI 原语；`CARD_TYPE_LABEL`
- Produces: 路由组件 `NoteEditor`（读 `useParams().id`，`useSearchParams().get('from')`）；常量 `LOOKUP_DEBOUNCE_MS = 300`

- [ ] **Step 1: 写失败测试**

`src/screens/NoteEditor.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote } from '@/db/repo'
import { renderWithRouter } from '@/test/render'
import { NoteEditor } from './NoteEditor'

vi.mock('@/app/useAudio', () => ({
  useAudio: () => ({ accent: 'us', play: vi.fn(async () => 'youdao'), prefetch: vi.fn(async () => undefined) }),
}))

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.dict.put({ word: 'concern', phonetic: "kən'sə:n", translation: 'n. 担忧', forms: ['concerns', 'concerned'] })
})
afterEach(() => vi.restoreAllMocks())

describe('NoteEditor (new)', () => {
  it('fills from the dictionary via an inflection and offers the lemma', async () => {
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'concerns' } })
    await waitFor(() => expect(screen.getByText('已从词典补全')).toBeTruthy())
    expect((screen.getByLabelText('音标') as HTMLInputElement).value).toBe("kən'sə:n")
    expect((screen.getByLabelText('释义') as HTMLTextAreaElement).value).toBe('n. 担忧')
    fireEvent.click(screen.getByRole('button', { name: '改为原形 concern' }))
    expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern')
  })

  it('saves a note with the chosen types and auto-detected cloze', async () => {
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'concern' } })
    await waitFor(() => expect(screen.getByText('已从词典补全')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '+ 添加例句' }))
    fireEvent.change(screen.getByLabelText('例句 1'), { target: { value: 'I have some concerns about it.' } })
    expect(screen.getByRole('button', { name: 'concerns' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /保存 · 生成 3 张卡/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /保存 · 生成 3 张卡/ }))
    await waitFor(async () => expect(await db.notes.count()).toBe(1))
    const note = (await db.notes.toArray())[0]!
    expect(note.examples[0]!.blanks).toEqual([{ start: 12, end: 20 }])
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(3)
  })

  it('warns about duplicates without blocking', async () => {
    await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<NoteEditor />, { route: '/note/new', path: '/note/new' })
    fireEvent.change(screen.getByLabelText('单词 / 短语'), { target: { value: 'Concern' } })
    await waitFor(() => expect(screen.getByText(/已有同名记录/)).toBeTruthy())
    expect((screen.getByRole('button', { name: /保存 · 生成/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('NoteEditor (edit)', () => {
  it('asks for confirmation before removing a card type and aborts on cancel', async () => {
    const note = await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['zh2en', 'en2zh'] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderWithRouter(<NoteEditor />, { route: `/note/${note.id}`, path: '/note/:id' })
    await waitFor(() => expect((screen.getByLabelText('单词 / 短语') as HTMLInputElement).value).toBe('concern'))
    fireEvent.click(screen.getByRole('button', { name: '中 → 英' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm.mock.calls[0]![0]).toContain('中 → 英')
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(2)
  })

  it('deletes the note after confirmation', async () => {
    const note = await createNote(db, { headword: 'concern', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithRouter(<NoteEditor />, { route: `/note/${note.id}`, path: '/note/:id' })
    await waitFor(() => expect(screen.getByRole('button', { name: '删除这条记录' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '删除这条记录' }))
    await waitFor(async () => expect(await db.notes.count()).toBe(0))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/screens/NoteEditor.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现界面**

`src/screens/NoteEditor.tsx`:
```tsx
import { useEffect, useReducer, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { db } from '@/db/db'
import { createNote, deleteNote, findDuplicate, getSettings, planNoteUpdate, updateNote } from '@/db/repo'
import { CARD_TYPES, CARD_TYPE_LABEL, DEFAULT_SETTINGS, type Note } from '@/domain/types'
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

export function NoteEditor() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const audio = useAudio()
  const mode: 'new' | 'edit' = id ? 'edit' : 'new'

  const settings = useLiveQuery(() => getSettings(db), [])
  const note = useLiveQuery(() => (id ? db.notes.get(id) : Promise.resolve(undefined)), [id])
  const [form, dispatch] = useReducer(reduceForm, undefined, () => initialForm(DEFAULT_SETTINGS.lastEnabledTypes))
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined)
  const [duplicate, setDuplicate] = useState<Note | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const headwordRef = useRef<HTMLInputElement>(null)

  // 初始化（各只做一次）：新建等 settings 到位后用上次勾选；编辑等记录到位后用记录内容
  useEffect(() => {
    if (!settings) return
    if (mode === 'new' && loadedFor === undefined) {
      dispatch({ type: 'reset', state: initialForm(settings.lastEnabledTypes) })
      setLoadedFor('new')
      headwordRef.current?.focus()
    }
    if (mode === 'edit' && note && loadedFor !== note.id) {
      dispatch({ type: 'reset', state: initialForm(settings.lastEnabledTypes, note) })
      setLoadedFor(note.id)
    }
  }, [mode, note, settings, loadedFor])

  // 词典查询与查重（防抖）
  useEffect(() => {
    const headword = form.headword.trim()
    if (!headword) { setDuplicate(undefined); return }
    const t = setTimeout(() => {
      void lookupWord(db, headword).then((result) => dispatch({ type: 'dictResult', result }))
      void findDuplicate(db, headword, id).then(setDuplicate)
    }, LOOKUP_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [form.headword, id])

  const availability = formAvailability(form)
  const goBack = () => (params.get('from') === 'review' ? navigate(-1) : navigate('/'))

  async function save() {
    if (!canSave(form) || saving) return
    setSaving(true)
    try {
      const input = toNoteInput(form)
      if (mode === 'new') {
        await createNote(db, input)
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
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!id) return
    if (!window.confirm('删除这条记录和它的全部卡片、复习记录？')) return
    await deleteNote(db, id)
    navigate('/')
  }

  const dictHint =
    form.dict.status === 'hit' ? <span className="text-good-fg">✓ 已从词典补全</span>
    : form.dict.status === 'miss' ? <span className="text-accent">词典没有，手动填写</span>
    : null

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
            onChange={(e) => dispatch({ type: 'headword', value: e.target.value })}
          />
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
          <Field key={ex.id} label={`例句 ${i + 1}`} hint={<button type="button" className="text-accent" onClick={() => dispatch({ type: 'removeExample', id: ex.id })}>删除</button>}>
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
            <input aria-label={`来源 ${i + 1}`} className={`${inputCls} mt-1 text-sm`} placeholder="来源：文章名 / 剧名（可空）" value={ex.source} onChange={(e) => dispatch({ type: 'exampleSource', id: ex.id, value: e.target.value })} />
          </Field>
        ))}
        <Button variant="secondary" onClick={() => dispatch({ type: 'addExample' })}>+ 添加例句</Button>

        <Field label="标签">
          <input aria-label="标签" className={inputCls} placeholder="逗号分隔，可空" value={form.tags} onChange={(e) => dispatch({ type: 'tags', value: e.target.value })} />
        </Field>

        <Field label="卡片类型（多选）">
          <div className="flex flex-wrap gap-2">
            {CARD_TYPES.map((t) => (
              <Chip key={t} selected={form.types.includes(t)} disabled={!availability[t].ok} reason={availability[t].reason} onToggle={() => dispatch({ type: 'toggleType', cardType: t })}>
                {CARD_TYPE_LABEL[t]}
              </Chip>
            ))}
          </div>
          {CARD_TYPES.filter((t) => form.types.includes(t) && !availability[t].ok).map((t) => (
            <p key={t} className="mt-1 text-xs text-muted">{CARD_TYPE_LABEL[t]}：{availability[t].reason}</p>
          ))}
        </Field>

        <Button size="lg" className="mt-2" disabled={!canSave(form) || saving} onClick={() => void save()}>
          {saveLabel(form, mode)}
        </Button>

        {mode === 'edit' && (
          <Button variant="ghost" className="mt-4 text-again-fg" onClick={() => void remove()}>删除这条记录</Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 路由**

`src/app/App.tsx`：
- `import { NoteEditor } from '@/screens/NoteEditor'`
- 把 `<Route path="/note/new" element={<Placeholder title="新卡片" />} />` 换成：
```tsx
        <Route path="/note/new" element={<NoteEditor />} />
        <Route path="/note/:id" element={<NoteEditor />} />
```

- [ ] **Step 5: 运行测试与构建**

Run: `pnpm vitest run src/screens/NoteEditor.test.tsx src/lib/noteForm.test.ts && pnpm test && pnpm build`
Expected: 5 个界面用例通过（`waitFor` 默认 1 s 超时足以覆盖 300 ms 防抖）；全量通过；构建通过

- [ ] **Step 6: 本地手动检查**

Run: `pnpm dev`，打开 `http://localhost:5173/mnemo/#/note/new`：输入 `concerns` → 音标/释义自动填、出现"改为原形 concern"；添加例句粘 `I have some concerns about the proposed timeline.` → `concerns` 高亮，点其他词可切换；保存按钮显示"保存 · 生成 3 张卡"；保存后回到首页，新卡数变 1（队列按记录去重）。

- [ ] **Step 7: 提交**

```bash
git add src/screens/NoteEditor.tsx src/screens/NoteEditor.test.tsx src/lib/noteForm.ts src/app/App.tsx
git commit -m "feat(editor): note editor with dictionary autofill, cloze editing, type chips and safe edits"
```

---

### Task 6: 复习会话状态 `session.ts`（纯函数）

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Consumes: `Card`
- Produces:
  - `BREATHER_EVERY = 20`
  - `interface SessionStats { reviewed: number; learned: number; startedAt: number }`
  - `interface SessionState { phase: 'loading' | 'card' | 'breather' | 'done'; queue: Card[]; revealed: boolean; stats: SessionStats; sinceBreather: number; canUndo: boolean }`
  - `initialSession(now: number): SessionState`
  - `withQueue(state, queue: Card[]): SessionState` — `card` 或 `done`，`revealed=false`
  - `reveal(state): SessionState`
  - `afterGrade(state, args: { wasNew: boolean; queue: Card[] }): SessionState` — 统计 +1，每 20 张且还有剩余 → `breather`
  - `continueAfterBreather(state): SessionState`
  - `afterUndo(state, args: { wasNew: boolean; queue: Card[] }): SessionState` — 统计 −1（不低于 0），`canUndo=false`
  - `elapsedMinutes(state, now: number): number`

- [ ] **Step 1: 写失败测试**

`src/lib/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Card } from '@/domain/types'
import { BREATHER_EVERY, afterGrade, afterUndo, continueAfterBreather, elapsedMinutes, initialSession, reveal, withQueue } from './session'

const NOW = 1_700_000_000_000
let n = 0
const card = (): Card => ({
  id: `c${++n}`, noteId: `n${n}`, type: 'en2zh', due: NOW, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
  learning_steps: 0, reps: 0, lapses: 0, state: 0, createdAt: NOW,
})
const many = (k: number) => Array.from({ length: k }, card)

describe('session', () => {
  it('starts loading, becomes card with a queue, done when empty', () => {
    const s0 = initialSession(NOW)
    expect(s0.phase).toBe('loading')
    expect(withQueue(s0, many(2)).phase).toBe('card')
    expect(withQueue(s0, []).phase).toBe('done')
  })
  it('reveal flips revealed; a new queue resets it', () => {
    const s = reveal(withQueue(initialSession(NOW), many(2)))
    expect(s.revealed).toBe(true)
    expect(withQueue(s, many(1)).revealed).toBe(false)
  })
  it('afterGrade counts reviewed and learned, enables undo, and moves on', () => {
    const s0 = withQueue(initialSession(NOW), many(2))
    const s1 = afterGrade(reveal(s0), { wasNew: true, queue: many(1) })
    expect(s1.stats).toMatchObject({ reviewed: 1, learned: 1 })
    expect(s1.canUndo).toBe(true)
    expect(s1.phase).toBe('card')
    expect(s1.revealed).toBe(false)
    expect(afterGrade(s1, { wasNew: false, queue: [] }).phase).toBe('done')
  })
  it('shows a breather every 20 grades when cards remain, not when the queue is empty', () => {
    let s = withQueue(initialSession(NOW), many(30))
    for (let i = 0; i < BREATHER_EVERY - 1; i += 1) s = afterGrade(s, { wasNew: false, queue: many(5) })
    expect(s.phase).toBe('card')
    s = afterGrade(s, { wasNew: false, queue: many(5) })
    expect(s.phase).toBe('breather')
    expect(s.queue).toHaveLength(5)
    s = continueAfterBreather(s)
    expect(s.phase).toBe('card')
    expect(s.sinceBreather).toBe(0)

    let t = withQueue(initialSession(NOW), many(20))
    for (let i = 0; i < BREATHER_EVERY; i += 1) t = afterGrade(t, { wasNew: false, queue: i === BREATHER_EVERY - 1 ? [] : many(1) })
    expect(t.phase).toBe('done')
  })
  it('afterUndo decrements stats (floored at 0) and disables undo', () => {
    const s0 = afterGrade(withQueue(initialSession(NOW), many(2)), { wasNew: true, queue: many(1) })
    const s1 = afterUndo(s0, { wasNew: true, queue: many(2) })
    expect(s1.stats).toMatchObject({ reviewed: 0, learned: 0 })
    expect(s1.canUndo).toBe(false)
    expect(s1.phase).toBe('card')
    expect(afterUndo(s1, { wasNew: false, queue: many(2) }).stats.reviewed).toBe(0)
  })
  it('elapsedMinutes rounds up to at least 1', () => {
    expect(elapsedMinutes(initialSession(NOW), NOW + 20_000)).toBe(1)
    expect(elapsedMinutes(initialSession(NOW), NOW + 9.6 * 60_000)).toBe(10)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/session.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/session.ts`:
```ts
import type { Card } from '@/domain/types'

export const BREATHER_EVERY = 20

export interface SessionStats {
  reviewed: number
  learned: number
  startedAt: number
}

export interface SessionState {
  phase: 'loading' | 'card' | 'breather' | 'done'
  queue: Card[]
  revealed: boolean
  stats: SessionStats
  sinceBreather: number
  canUndo: boolean
}

export function initialSession(now: number): SessionState {
  return { phase: 'loading', queue: [], revealed: false, stats: { reviewed: 0, learned: 0, startedAt: now }, sinceBreather: 0, canUndo: false }
}

export function withQueue(s: SessionState, queue: Card[]): SessionState {
  return { ...s, queue, revealed: false, phase: queue.length === 0 ? 'done' : 'card' }
}

export function reveal(s: SessionState): SessionState {
  return { ...s, revealed: true }
}

export function afterGrade(s: SessionState, { wasNew, queue }: { wasNew: boolean; queue: Card[] }): SessionState {
  const stats = { ...s.stats, reviewed: s.stats.reviewed + 1, learned: s.stats.learned + (wasNew ? 1 : 0) }
  const sinceBreather = s.sinceBreather + 1
  const next = withQueue({ ...s, stats, sinceBreather, canUndo: true }, queue)
  if (sinceBreather >= BREATHER_EVERY && next.phase === 'card') return { ...next, phase: 'breather', sinceBreather: 0 }
  return next
}

export function continueAfterBreather(s: SessionState): SessionState {
  return { ...s, phase: s.queue.length === 0 ? 'done' : 'card', revealed: false }
}

export function afterUndo(s: SessionState, { wasNew, queue }: { wasNew: boolean; queue: Card[] }): SessionState {
  const stats = {
    ...s.stats,
    reviewed: Math.max(0, s.stats.reviewed - 1),
    learned: Math.max(0, s.stats.learned - (wasNew ? 1 : 0)),
  }
  return withQueue({ ...s, stats, sinceBreather: Math.max(0, s.sinceBreather - 1), canUndo: false }, queue)
}

export function elapsedMinutes(s: SessionState, now: number): number {
  return Math.max(1, Math.round((now - s.stats.startedAt) / 60_000))
}
```

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm vitest run src/lib/session.test.ts && pnpm test`
Expected: 6 个用例通过；全量通过

```bash
git add src/lib/session.ts src/lib/session.test.ts
git commit -m "feat(review): session state with breather and undo bookkeeping"
```

---

### Task 7: 复习界面与组件

**Files:**
- Create: `src/components/review/CardFront.tsx`, `src/components/review/CardBack.tsx`, `src/components/review/GradeBar.tsx`, `src/components/review/BreatherPage.tsx`, `src/components/review/DonePage.tsx`, `src/screens/Review.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/components/review/CardFront.test.tsx`, `src/screens/Review.test.tsx`

**Interfaces:**
- Consumes: `db`; `getTodayQueue, gradeCard, undoLastReview, addExtraNewToday, getSettings`; `scheduler.previewIntervals`; `primaryClozeExample`; session 全部; `useAudio`; `ClozeText`; `Button`; `Rating, Card, Note, CARD_TYPE_LABEL`
- Produces:
  - `CardFront` props `{ card: Card; note: Note; onPlay(): void }`
  - `CardBack` props `{ note: Note; onPlay(): void }`
  - `GradeBar` props `{ labels: Record<Rating, string>; onGrade(r: Rating): void; disabled?: boolean }` — 按钮文案 `忘了 / 困难 / 记得 / 简单`
  - `BreatherPage` props `{ reviewed: number; remaining: number; onContinue(): void; onStop(): void }`
  - `DonePage` props `{ reviewed: number; learned: number; minutes: number; onMore(): void; onHome(): void; moreDisabled?: boolean }`
  - 路由组件 `Review`

- [ ] **Step 1: 写失败测试**

`src/components/review/CardFront.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Card, Note } from '@/domain/types'
import { CardFront } from './CardFront'

const note: Note = {
  id: 'n1', headword: 'concern', headwordKey: 'concern', phonetic: '/kənˈsɜːrn/', meaning: 'n. 担忧，顾虑\nv. 涉及',
  examples: [{ text: 'I have some concerns about it.', source: 'The Economist', blanks: [{ start: 12, end: 20 }] }],
  tags: [], enabledTypes: ['zh2en', 'cloze', 'en2zh'], createdAt: 0, updatedAt: 0,
}
const card = (type: Card['type']): Card => ({
  id: 'c', noteId: 'n1', type, due: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, createdAt: 0,
})

describe('CardFront', () => {
  it('zh2en shows the meaning and not the headword', () => {
    render(<CardFront card={card('zh2en')} note={note} onPlay={() => {}} />)
    expect(screen.getByText('说出英文')).toBeTruthy()
    expect(screen.getByText(/担忧，顾虑/)).toBeTruthy()
    expect(screen.queryByText('concern')).toBeNull()
  })
  it('cloze shows the blanked sentence and source, without the word or the meaning', () => {
    const { container } = render(<CardFront card={card('cloze')} note={note} onPlay={() => {}} />)
    expect(screen.getByText('填上这个词')).toBeTruthy()
    expect(container.textContent).not.toContain('concerns')
    expect(container.textContent).not.toContain('担忧')
    expect(screen.getByText(/The Economist/)).toBeTruthy()
  })
  it('en2zh shows headword, phonetic and a play button', () => {
    render(<CardFront card={card('en2zh')} note={note} onPlay={() => {}} />)
    expect(screen.getByText('concern')).toBeTruthy()
    expect(screen.getByText('/kənˈsɜːrn/')).toBeTruthy()
    expect(screen.getByRole('button', { name: '播放发音' })).toBeTruthy()
    expect(screen.queryByText(/担忧/)).toBeNull()
  })
})
```

`src/screens/Review.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db } from '@/db/db'
import { createNote } from '@/db/repo'
import { renderWithRouter } from '@/test/render'
import { Review } from './Review'

const play = vi.fn(async () => 'youdao' as const)
vi.mock('@/app/useAudio', () => ({ useAudio: () => ({ accent: 'us', play, prefetch: vi.fn(async () => undefined) }) }))

beforeEach(async () => { await db.delete(); await db.open(); play.mockClear() })
afterEach(() => vi.restoreAllMocks())

describe('Review', () => {
  it('reveals, grades, auto-plays on reveal, and reaches the done page', async () => {
    await createNote(db, { headword: 'concern', meaning: 'n. 担忧', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    await screen.findByRole('button', { name: '看答案' })
    expect(screen.getByText('剩余 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '看答案' }))
    expect(play).toHaveBeenCalledWith('concern')
    const easy = await screen.findByRole('button', { name: /简单/ })
    expect(easy.textContent).toMatch(/天/)
    fireEvent.click(easy)
    await screen.findByText('今天的复习完成了')
    expect(screen.getByText('1', { selector: '[data-stat="reviewed"]' })).toBeTruthy()
    expect(await db.reviewLogs.count()).toBe(1)
  })

  it('undo restores the card and the counter', async () => {
    await createNote(db, { headword: 'concern', meaning: 'n. 担忧', examples: [], tags: [], enabledTypes: ['en2zh'] })
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    fireEvent.click(await screen.findByRole('button', { name: '看答案' }))
    fireEvent.click(await screen.findByRole('button', { name: /简单/ }))
    await screen.findByText('今天的复习完成了')
    fireEvent.click(screen.getByRole('button', { name: '撤销上一步' }))
    await screen.findByRole('button', { name: '看答案' })
    expect(await db.reviewLogs.count()).toBe(0)
  })

  it('shows a breather after 20 grades when cards remain', async () => {
    await db.settings.put({ id: 'settings', newCardsPerDay: 30, accent: 'us', autoPlayOnReveal: false, lastEnabledTypes: ['en2zh'] })
    for (let i = 0; i < 21; i += 1) {
      await createNote(db, { headword: `w${i}`, meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] }, Date.now() - (21 - i) * 1000)
    }
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(await screen.findByRole('button', { name: '看答案' }))
      fireEvent.click(await screen.findByRole('button', { name: /简单/ }))
    }
    await screen.findByText('已复习 20 张')
    expect(screen.getByText('还剩 1 张')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    await screen.findByRole('button', { name: '看答案' })
  })

  it('"再学 10 张新卡" pulls cards beyond the daily limit', async () => {
    await db.settings.put({ id: 'settings', newCardsPerDay: 1, accent: 'us', autoPlayOnReveal: false, lastEnabledTypes: ['en2zh'] })
    await createNote(db, { headword: 'a', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] }, Date.now() - 2000)
    await createNote(db, { headword: 'b', meaning: 'x', examples: [], tags: [], enabledTypes: ['en2zh'] }, Date.now() - 1000)
    renderWithRouter(<Review />, { route: '/review', path: '/review' })
    fireEvent.click(await screen.findByRole('button', { name: '看答案' }))
    fireEvent.click(await screen.findByRole('button', { name: /简单/ }))
    await screen.findByText('今天的复习完成了')
    fireEvent.click(screen.getByRole('button', { name: '再学 10 张新卡' }))
    await screen.findByRole('button', { name: '看答案' })
    expect(screen.getByText('剩余 1')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/components/review/CardFront.test.tsx src/screens/Review.test.tsx`
Expected: FAIL

- [ ] **Step 3: 组件**

`src/components/review/CardFront.tsx`:
```tsx
import type { Card, Note } from '@/domain/types'
import { primaryClozeExample } from '@/lib/cardTypes'
import { ClozeText } from '@/components/ClozeText'

function Label({ children }: { children: string }) {
  return <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{children}</div>
}

export function PlayButton({ onPlay, className = '' }: { onPlay: () => void; className?: string }) {
  return (
    <button type="button" aria-label="播放发音" onClick={onPlay} className={`grid h-7 w-7 place-items-center rounded-full bg-easy-bg text-xs text-accent ${className}`}>▶</button>
  )
}

export function CardFront({ card, note, onPlay }: { card: Card; note: Note; onPlay: () => void }) {
  if (card.type === 'zh2en') {
    return (
      <div className="flex flex-col gap-3">
        <Label>说出英文</Label>
        <p className="whitespace-pre-line text-2xl font-semibold leading-snug">{note.meaning}</p>
      </div>
    )
  }
  if (card.type === 'cloze') {
    const ex = primaryClozeExample(note.examples)
    return (
      <div className="flex flex-col gap-3">
        <Label>填上这个词</Label>
        {ex ? (
          <>
            <ClozeText text={ex.text} blanks={ex.blanks} mode="blank" className="text-[19px] leading-relaxed" />
            {ex.source && <div className="text-xs text-muted">— {ex.source}</div>}
          </>
        ) : (
          <p className="text-sm text-muted">这条记录没有带挖空的例句</p>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Label>这个词什么意思</Label>
      <div className="text-[30px] font-bold tracking-tight">{note.headword}</div>
      <div className="flex items-center gap-2 text-[15px] text-muted">
        {note.phonetic && <span>{note.phonetic}</span>}
        <PlayButton onPlay={onPlay} />
      </div>
    </div>
  )
}
```

`src/components/review/CardBack.tsx`:
```tsx
import type { Note } from '@/domain/types'
import { ClozeText } from '@/components/ClozeText'
import { PlayButton } from './CardFront'

export function CardBack({ note, onPlay }: { note: Note; onPlay: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[30px] font-bold tracking-tight">{note.headword}</div>
      <div className="flex items-center gap-2 text-[15px] text-muted">
        {note.phonetic && <span>{note.phonetic}</span>}
        <PlayButton onPlay={onPlay} />
      </div>
      <p className="whitespace-pre-line text-base leading-relaxed">{note.meaning}</p>
      {note.examples.map((ex, i) => (
        <div key={i} className="mt-1">
          <ClozeText text={ex.text} blanks={ex.blanks} mode="highlight" className="text-base leading-relaxed" />
          {ex.source && <div className="mt-0.5 text-xs text-muted">— {ex.source}</div>}
        </div>
      ))}
      {note.tags.length > 0 && <div className="text-xs text-muted">{note.tags.map((t) => `#${t}`).join(' ')}</div>}
    </div>
  )
}
```

`src/components/review/GradeBar.tsx`:
```tsx
import type { Rating } from '@/domain/types'

const BUTTONS: Array<{ rating: Rating; label: string; cls: string }> = [
  { rating: 1, label: '忘了', cls: 'bg-again-bg text-again-fg' },
  { rating: 2, label: '困难', cls: 'bg-hard-bg text-hard-fg' },
  { rating: 3, label: '记得', cls: 'bg-good-bg text-good-fg' },
  { rating: 4, label: '简单', cls: 'bg-easy-bg text-easy-fg' },
]

export function GradeBar({ labels, onGrade, disabled = false }: { labels: Record<Rating, string>; onGrade: (r: Rating) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {BUTTONS.map((b) => (
        <button
          key={b.rating}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(b.rating)}
          className={`flex h-[52px] flex-col items-center justify-center rounded-xl text-[13px] font-semibold disabled:opacity-40 ${b.cls}`}
        >
          <span>{b.label}</span>
          <span className="text-[10px] font-normal opacity-75">{labels[b.rating]}</span>
        </button>
      ))}
    </div>
  )
}
```

`src/components/review/BreatherPage.tsx`:
```tsx
import { Button } from '@/components/ui/Button'

export function BreatherPage({ reviewed, remaining, onContinue, onStop }: { reviewed: number; remaining: number; onContinue: () => void; onStop: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-easy-bg text-3xl">☕</div>
        <h2 className="mt-2 text-[22px] font-bold">已复习 {reviewed} 张</h2>
        <p className="text-sm text-muted">还剩 {remaining} 张</p>
      </div>
      <div className="flex flex-col gap-2 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}>
        <Button size="lg" onClick={onContinue}>继续</Button>
        <Button size="lg" variant="secondary" onClick={onStop}>今天到这</Button>
      </div>
    </div>
  )
}
```

`src/components/review/DonePage.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

export function DonePage({
  reviewed, learned, minutes, onMore, onHome, moreDisabled = false, extra,
}: { reviewed: number; learned: number; minutes: number; onMore: () => void; onHome: () => void; moreDisabled?: boolean; extra?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-good-bg text-3xl text-good-fg">✓</div>
        <h2 className="mt-2 text-[22px] font-bold">今天的复习完成了</h2>
        <div className="mt-3 flex gap-5 text-xs text-muted">
          <div><b className="block text-xl text-ink" data-stat="reviewed">{reviewed}</b>复习</div>
          <div><b className="block text-xl text-ink" data-stat="learned">{learned}</b>新学</div>
          <div><b className="block text-xl text-ink" data-stat="minutes">{minutes}</b>分钟</div>
        </div>
        {extra}
      </div>
      <div className="flex flex-col gap-2 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}>
        <Button size="lg" variant="secondary" onClick={onMore} disabled={moreDisabled}>再学 10 张新卡</Button>
        <Button size="lg" onClick={onHome}>回到首页</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 复习界面**

`src/screens/Review.tsx`:
```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db } from '@/db/db'
import { addExtraNewToday, getSettings, getTodayQueue, gradeCard, undoLastReview } from '@/db/repo'
import { DEFAULT_SETTINGS, type Rating } from '@/domain/types'
import { scheduler } from '@/lib/scheduler'
import { afterGrade, afterUndo, continueAfterBreather, elapsedMinutes, initialSession, reveal, withQueue } from '@/lib/session'
import { useAudio } from '@/app/useAudio'
import { Button } from '@/components/ui/Button'
import { BreatherPage } from '@/components/review/BreatherPage'
import { CardBack } from '@/components/review/CardBack'
import { CardFront } from '@/components/review/CardFront'
import { DonePage } from '@/components/review/DonePage'
import { GradeBar } from '@/components/review/GradeBar'

export function Review() {
  const navigate = useNavigate()
  const audio = useAudio()
  const settings = useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS)
  const [session, setSession] = useState(() => initialSession(Date.now()))
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | undefined>(undefined)

  const current = session.queue[0]
  const note = useLiveQuery(() => (current ? db.notes.get(current.noteId) : Promise.resolve(undefined)), [current?.noteId])

  const requery = useCallback(() => getTodayQueue(db), [])

  useEffect(() => {
    let cancelled = false
    void requery().then((q) => { if (!cancelled) setSession((s) => withQueue(s, q)) })
    return () => { cancelled = true }
  }, [requery])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(undefined), 1500)
    return () => clearTimeout(t)
  }, [toast])

  const playHeadword = () => { if (note) void audio.play(note.headword) }

  // fuzz 开启时每次调用结果可能略有不同，按卡片固定一次，避免按钮文案抖动
  const labels = useMemo(
    () => (session.revealed && current ? scheduler.previewIntervals(current, Date.now()) : undefined),
    [session.revealed, current],
  )

  function onReveal() {
    setSession(reveal)
    if (settings.autoPlayOnReveal) playHeadword()
  }

  async function onGrade(rating: Rating) {
    if (!current || busy) return
    setBusy(true)
    try {
      const { log } = await gradeCard(db, current.id, rating)
      const queue = await requery()
      setSession((s) => afterGrade(s, { wasNew: log.state === 0, queue }))
    } finally {
      setBusy(false)
    }
  }

  async function onUndo() {
    if (!session.canUndo || busy) return
    setBusy(true)
    try {
      const restored = await undoLastReview(db)
      const queue = await requery()
      setSession((s) => afterUndo(s, { wasNew: restored?.state === 0, queue }))
      setToast('已撤销')
    } finally {
      setBusy(false)
    }
  }

  async function onMore() {
    await addExtraNewToday(db, 10)
    const queue = await requery()
    setSession((s) => ({ ...withQueue(s, queue), sinceBreather: 0 }))
    if (queue.length === 0) setToast('没有更多新卡了')
  }

  if (session.phase === 'loading') return <div className="grid min-h-dvh place-items-center text-muted">加载中…</div>
  if (session.phase === 'breather') {
    return <BreatherPage reviewed={session.stats.reviewed} remaining={session.queue.length} onContinue={() => setSession(continueAfterBreather)} onStop={() => navigate('/')} />
  }
  if (session.phase === 'done' || !current) {
    return (
      <DonePage
        reviewed={session.stats.reviewed}
        learned={session.stats.learned}
        minutes={elapsedMinutes(session, Date.now())}
        onMore={() => void onMore()}
        onHome={() => navigate('/')}
        extra={session.canUndo ? <Button variant="ghost" className="mt-2" onClick={() => void onUndo()}>撤销上一步</Button> : undefined}
      />
    )
  }


  return (
    <div className="flex min-h-dvh flex-col bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <button type="button" aria-label="关闭" className="text-muted" onClick={() => navigate('/')}>✕</button>
        <span className="font-semibold">剩余 {session.queue.length}</span>
        <div className="flex gap-4">
          <button type="button" className="text-accent disabled:opacity-40" disabled={!session.canUndo || busy} onClick={() => void onUndo()}>撤销上一步</button>
          <button type="button" className="text-accent" onClick={() => navigate(`/note/${current.noteId}?from=review`)}>编辑</button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-4">
        {note ? (
          session.revealed ? <CardBack note={note} onPlay={playHeadword} /> : <CardFront card={current} note={note} onPlay={playHeadword} />
        ) : (
          <p className="text-sm text-muted">记录不存在</p>
        )}
      </div>

      <div className="mx-auto w-full max-w-md px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
        {session.revealed && labels ? (
          <GradeBar labels={labels} onGrade={(r) => void onGrade(r)} disabled={busy} />
        ) : (
          <>
            <p className="mb-2 text-center text-xs text-muted">想好了再翻</p>
            <Button size="lg" className="w-full" onClick={onReveal} disabled={!note}>看答案</Button>
          </>
        )}
      </div>

      {toast && <div className="pointer-events-none fixed inset-x-0 bottom-28 text-center"><span className="rounded-full bg-ink px-3 py-1 text-xs text-bg">{toast}</span></div>}
    </div>
  )
}
```

- [ ] **Step 5: 路由与更新提示**

`src/app/App.tsx` 改为（在 `/review` 下不渲染 `UpdatePrompt`）：
```tsx
import { HashRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { UpdatePrompt } from './UpdatePrompt'
import { useDictLoader } from './useDictLoader'
import { TabBar } from '@/components/TabBar'
import { NoteEditor } from '@/screens/NoteEditor'
import { Placeholder } from '@/screens/Placeholder'
import { Review } from '@/screens/Review'
import { SettingsStub } from '@/screens/SettingsStub'
import { Today } from '@/screens/Today'
import { AudioSpike } from '@/spikes/AudioSpike'
import { TtsSpike } from '@/spikes/TtsSpike'

function WithTabs() {
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  )
}

function Shell() {
  const dict = useDictLoader()
  const { pathname } = useLocation()
  return (
    <>
      <Routes>
        <Route element={<WithTabs />}>
          <Route path="/" element={<Today dict={dict} />} />
          <Route path="/cards" element={<Placeholder title="卡片" />} />
          <Route path="/settings" element={<SettingsStub />} />
        </Route>
        <Route path="/review" element={<Review />} />
        <Route path="/inbox" element={<Placeholder title="收集箱" />} />
        <Route path="/note/new" element={<NoteEditor />} />
        <Route path="/note/:id" element={<NoteEditor />} />
        <Route path="/spike/audio" element={<AudioSpike />} />
        <Route path="/spike/tts" element={<TtsSpike />} />
        <Route path="*" element={<Placeholder title="未找到" />} />
      </Routes>
      {pathname !== '/review' && <UpdatePrompt />}
    </>
  )
}

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
```

- [ ] **Step 6: 运行测试与构建**

Run: `pnpm vitest run src/components/review/CardFront.test.tsx src/screens/Review.test.tsx && pnpm test && pnpm build`
Expected: 7 个新用例通过；全量通过；构建通过。若 Review 测试在"再学 10 张"用例中找不到第二张卡，检查 `addExtraNewToday` 后的 `requery` 是否在 `settings` 写入提交后执行（`await` 顺序）。

- [ ] **Step 7: 本地手动检查**

`pnpm dev` → 先建两条记录（一条勾三种卡型并带挖空例句），回首页点"开始复习"：正面按卡型渲染；点"看答案"自动朗读；四个按钮下有预计间隔；打分后下一张；"撤销上一步"可回退；"编辑"进编辑器、保存后回到复习；清空后出现完成页，"再学 10 张新卡"无新卡时提示。

- [ ] **Step 8: 提交**

```bash
git add src/components/review src/screens/Review.tsx src/screens/Review.test.tsx src/app/App.tsx
git commit -m "feat(review): review session screen with FSRS grading, undo, breather and done page"
```

---

### Task 8: 收尾与真机验收

**Files:**
- Modify: `src/main.tsx`, `src/index.css`, `src/screens/Today.tsx`
- Create: `src/app/useVisibilityTick.ts`
- Test: `src/app/useVisibilityTick.test.tsx`

**Interfaces:**
- Produces: `useVisibilityTick(): number` — 文档每次回到前台时 +1，用作 `useLiveQuery` 的依赖让"今日"计数在回到前台时重算

- [ ] **Step 1: 写失败测试**

`src/app/useVisibilityTick.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useVisibilityTick } from './useVisibilityTick'

describe('useVisibilityTick', () => {
  it('increments when the document becomes visible again', () => {
    const { result } = renderHook(() => useVisibilityTick())
    expect(result.current).toBe(0)
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(0)
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/app/useVisibilityTick.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现与接线**

`src/app/useVisibilityTick.ts`:
```ts
import { useEffect, useState } from 'react'

/** iOS 主屏 PWA 多是"恢复"而不是重新启动；回到前台时触发一次重算 */
export function useVisibilityTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const onChange = () => { if (document.visibilityState === 'visible') setTick((t) => t + 1) }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return tick
}
```

`src/screens/Today.tsx`：
- `import { useVisibilityTick } from '@/app/useVisibilityTick'`
- 在组件内加 `const tick = useVisibilityTick()`，把 `getTodayCounts` 的 live query 改为 `useLiveQuery(() => getTodayCounts(db), [tick], { due: 0, fresh: 0 })`，并让日期行用 `todayLabel()` 在同一渲染里重算（它本来就是每次渲染调用，无需改）。

`src/main.tsx`：在 `createRoot(...)` 之前加
```ts
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => undefined)
}
```

`src/index.css` 深色块加一行：`--color-cloze: color-mix(in srgb, #ffd60a 28%, transparent);`

- [ ] **Step 4: 运行测试与构建，提交**

Run: `pnpm test && pnpm build`
Expected: 全部通过

```bash
git add src/app/useVisibilityTick.ts src/app/useVisibilityTick.test.tsx src/screens/Today.tsx src/main.tsx src/index.css
git commit -m "feat: recompute today counts on foreground, request persistent storage, dark cloze token"
```

- [ ] **Step 5: 人工验收（作者在 iPhone 上，推送后）**

对照规范第 8 节，本计划负责的项：
- [ ] 输入 `concerns` 自动补全为 `concern` 的音标与释义（点"改为原形"）；粘贴含 `concerns` 的句子自动挖空；点词可改
- [ ] 勾选三个卡型保存 → 首页新卡 1（按记录计数）；复习时三张卡分三天出现
- [ ] 四个按钮显示预计间隔，打分后下次到期符合预期；撤销可回退
- [ ] 翻面自动朗读；离线（飞行模式）仍出声（已预热）；关掉有道（断网且未预热的新词）走系统 TTS
- [ ] 20 张后出现歇脚页；清空后完成页；"再学 10 张新卡"生效
- [ ] 深色模式下挖空高亮与打分按钮可读；安全区正常；输入不触发缩放

---

## 自检记录（写计划时完成）

**规范覆盖（本计划负责）**

| 规范条目 | 任务 |
|---|---|
| 5.4 建卡全部行为（防抖查词、变形提示、查重、照单全收可编辑、例句/来源/挖空识别/点词、标签、卡型 chip 默认与置灰、保存文案、不覆盖手改） | Task 4, 5 |
| 5.2 编辑时删卡型二次确认、取消不保存 | Task 5（`planNoteUpdate` + `confirm` + `updateNote(..., confirmDelete)`） |
| 5.6 复习界面：顶部剩余/关闭/撤销/编辑、正面按卡型、翻面、背面完整记录、四档打分、拇指区、自动朗读、编辑回流、歇脚页、完成页、再学 10 张 | Task 6, 7 |
| 5.7 发音两级（有道 + TTS 降级 3 s）、保存时预热、口音 | Task 2, 5, 7 |
| 5.3 预计间隔格式、打分即落库、重查队列 | Task 7（`scheduler.previewIntervals`、`gradeCard` 后 `getTodayQueue`） |
| 5.10 更新提示不打断复习；回到前台刷新；`storage.persist` | Task 7, 8 |
| 5.12 视觉 token（挖空、打分色、深色） | Task 1, 3, 8 |
| 8 验收（本计划项） | Task 8 Step 5 |

**留给 Plan 3**：5.5 收集箱 UI、5.9 备份/恢复 UI（分享面板、`markBackedUp`）、5.11 卡片列表与设置页、`dictVersion` 迁出 `settings`（如需要）、标签联想。

**类型一致性**：`Chip/Button/Field/SheetHeader` 在 Task 1 定义、Task 5/7 使用同名 props；`ClozeEditor` `onChange(blanks)` 与 `noteForm` 的 `exampleBlanks` 动作对接；`useAudio().play/prefetch` 在 Task 2 定义、Task 5/7 消费（测试里以 `vi.mock('@/app/useAudio')` 替身）；`session.ts` 的 `afterGrade/afterUndo` 参数 `{ wasNew, queue }` 与 `Review.tsx` 调用一致；`updateNote` 第 6 个参数 `confirmDelete` 来自 Plan 1 修复波；`DonePage` 的 `data-stat` 属性被 Review 测试选择器使用。
