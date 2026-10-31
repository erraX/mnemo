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
