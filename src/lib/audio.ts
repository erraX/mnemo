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
  // abortCurrent tracks the in-flight play so finish() and stop() can
  // guard by reference-equality and avoid touching a newer play's state.
  let abortCurrent: (() => void) | undefined

  function stop() {
    abortCurrent?.()
    abortCurrent = undefined
    el?.pause()
  }

  function play(text: string, accent: Accent): Promise<PlayOutcome> {
    stop()
    el ??= deps.createElement()
    const audio = el
    return new Promise<PlayOutcome>((resolve) => {
      let settled = false
      // finish and fallback reference localCleanup/localAbort which are
      // declared below; safe because they are only called asynchronously
      // (event listeners / timer / promise rejection) after all consts are set.
      const finish = (o: PlayOutcome) => {
        if (settled) return
        localCleanup()
        if (abortCurrent === localAbort) abortCurrent = undefined
        resolve(o)
      }
      const fallback = () => {
        if (settled) return           // guard: prevent double side-effects when
        audio.pause()                 // error event AND play() rejection both fire
        finish(deps.speak(text, accent) ? 'tts' : 'none')
      }
      const onPlaying = () => finish('youdao')
      const onError = () => fallback()
      const timer = setT(fallback, timeoutMs)
      // Per-play cleanup: marks this play settled before removing listeners so
      // that any stale async callback (e.g. rejected play() promise) exits early.
      const localCleanup = () => {
        settled = true
        clearT(timer)
        audio.removeEventListener('playing', onPlaying)
        audio.removeEventListener('error', onError)
      }
      // localAbort is called by stop() to cancel this play gracefully with 'none'.
      const localAbort = () => {
        if (settled) return
        localCleanup()
        if (abortCurrent === localAbort) abortCurrent = undefined
        resolve('none')
      }
      abortCurrent = localAbort
      audio.addEventListener('playing', onPlaying)
      audio.addEventListener('error', onError)
      audio.src = youdaoUrl(text, accent)
      audio.play().catch(() => fallback())
    })
  }

  return { play, stop }
}

let speechUnlocked = false

/**
 * iOS 上页面首次 speak 若不在用户手势内会静音，而 TTS 降级发生在超时 / error 之后（已离开手势）。
 * 在点击里先说一句静音空话把 speechSynthesis 解锁；永不抛错。
 */
export function unlockSpeech(): void {
  if (speechUnlocked) return
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return
  try {
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    speechSynthesis.speak(u)
    speechUnlocked = true
  } catch {
    /* 解锁失败不影响播放；下次手势再试 */
  }
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
