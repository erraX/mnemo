import { describe, expect, it } from 'vitest'
import { isProductionOrigin } from './env'

describe('isProductionOrigin', () => {
  it('matches exact origin', () => {
    expect(isProductionOrigin('https://mni.github.io', 'https://mni.github.io')).toBe(true)
  })
  it('ignores trailing slash and case', () => {
    expect(isProductionOrigin('https://MNI.github.io/', 'https://mni.github.io')).toBe(true)
  })
  it('is false for localhost or missing production origin', () => {
    expect(isProductionOrigin('http://localhost:5173', 'https://mni.github.io')).toBe(false)
    expect(isProductionOrigin('https://mni.github.io', undefined)).toBe(false)
  })
})
