import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlayer, prefetchAudio, unlockSpeech, youdaoUrl, type AudioElementLike } from './audio'

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

describe('unlockSpeech', () => {
  it('is a no-op without speechSynthesis and speaks one silent utterance once when it exists', () => {
    const g = globalThis as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown }
    const saved = { synth: g.speechSynthesis, utt: g.SpeechSynthesisUtterance }
    try {
      delete g.speechSynthesis
      delete g.SpeechSynthesisUtterance
      expect(() => unlockSpeech()).not.toThrow()

      const speak = vi.fn()
      class FakeUtterance { volume = 1; constructor(public text: string) {} }
      g.speechSynthesis = { speak }
      g.SpeechSynthesisUtterance = FakeUtterance
      unlockSpeech()
      unlockSpeech()
      expect(speak).toHaveBeenCalledTimes(1)
      const u = speak.mock.calls[0]![0] as FakeUtterance
      expect(u.text).toBe('')
      expect(u.volume).toBe(0)
    } finally {
      g.speechSynthesis = saved.synth
      g.SpeechSynthesisUtterance = saved.utt
    }
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

  it('speaks exactly once when the element both errors and rejects play()', async () => {
    // Simulates real browser: error event fires AND play() returns a rejected promise.
    // Without the settle-once guard, fallback() runs twice → speak() called twice.
    const listeners: Record<string, (() => void)[]> = {}
    const fakeAudio: AudioElementLike = {
      src: '',
      addEventListener(type, cb) { (listeners[type] ??= []).push(cb) },
      removeEventListener(type, cb) { listeners[type] = (listeners[type] ?? []).filter((x) => x !== cb) },
      play() {
        queueMicrotask(() => listeners['error']?.forEach((cb) => cb()))
        return Promise.reject(new Error('AbortError'))
      },
      pause() {},
    }
    const speak = vi.fn(() => true)
    const p = createPlayer({ createElement: () => fakeAudio, speak, timeoutMs: 3000 })
    const result = p.play('concern', 'us')
    await vi.advanceTimersByTimeAsync(0)
    expect(await result).toBe('tts')
    expect(speak).toHaveBeenCalledTimes(1)
  })

  it('a superseded play does not hijack the next one', async () => {
    // Simulates real browser: stop() → pause() → browser rejects the pending play() promise.
    // Without per-play cleanup isolation, stale fallback pauses B and strips B's listeners.
    let pendingReject: ((e: Error) => void) | undefined
    let playCount = 0
    const listeners: Record<string, (() => void)[]> = {}
    const fakeAudio: AudioElementLike = {
      src: '',
      addEventListener(type, cb) { (listeners[type] ??= []).push(cb) },
      removeEventListener(type, cb) { listeners[type] = (listeners[type] ?? []).filter((x) => x !== cb) },
      play() {
        playCount++
        if (playCount === 1) {
          // Play A: never resolves until pause() is called
          return new Promise<void>((_, reject) => { pendingReject = reject })
        }
        // Play B: fires playing event
        queueMicrotask(() => listeners['playing']?.forEach((cb) => cb()))
        return Promise.resolve()
      },
      pause() {
        const r = pendingReject; pendingReject = undefined
        r?.(new Error('AbortError'))
      },
    }
    const speak = vi.fn(() => true)
    const p = createPlayer({ createElement: () => fakeAudio, speak, timeoutMs: 3000 })
    const a = p.play('hello', 'us')   // silent — never fires playing
    const b = p.play('world', 'us')   // stop()→pause() rejects A's play(); B fires playing
    await vi.advanceTimersByTimeAsync(0)
    expect(await b).toBe('youdao')
    expect(speak).not.toHaveBeenCalled()
    expect(await a).toBe('none')
  })

  it('stop() resolves a pending play with none', async () => {
    FakeAudio.mode = 'silent'
    const speak = vi.fn(() => true)
    const p = createPlayer({ createElement: () => new FakeAudio(), speak, timeoutMs: 3000 })
    const result = p.play('concern', 'us')
    p.stop()
    expect(await result).toBe('none')
    expect(speak).not.toHaveBeenCalled()
  })
})
