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
