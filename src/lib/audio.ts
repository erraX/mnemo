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
