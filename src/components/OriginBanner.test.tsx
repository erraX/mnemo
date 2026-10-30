// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OriginBanner } from './OriginBanner'

describe('OriginBanner', () => {
  it('renders nothing on the production origin', () => {
    expect(renderToStaticMarkup(<OriginBanner current="https://mni.github.io" production="https://mni.github.io" />)).toBe('')
  })
  it('warns elsewhere', () => {
    const html = renderToStaticMarkup(<OriginBanner current="http://localhost:5173" production="https://mni.github.io" />)
    expect(html).toContain('这不是正式地址')
  })
})
