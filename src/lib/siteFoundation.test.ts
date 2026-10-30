import { describe, expect, it } from 'vitest'
import { capTracking, familiesNamed, FOUNDATION_START, siteFontFiles, withSiteFoundation, withoutFoundation } from './siteFoundation'
import { createDefaultSiteDocument } from './siteDocument'
import { checkSite, planBuild } from './buildSite'
import { previewDocument } from './preview'

const author = `:root{--ink:#fff}
body{font:17px/1.6 Inter,system-ui,sans-serif}
.brand small{font:700 10px/1.1 "JetBrains Mono",ui-monospace,monospace}
h1{font-size:var(--step-5);letter-spacing:-.06em}
h2{letter-spacing:-0.02em}`

describe('the stylesheet foundation', () => {
  it('opens every stylesheet with tokens, safe defaults and self-hosted faces for the open faces it names', () => {
    const css = withSiteFoundation(author)
    expect(css.startsWith(FOUNDATION_START)).toBe(true)
    expect(css).toContain(`@font-face { font-family: 'Inter'; src: url("../assets/fonts/inter.woff2")`)
    expect(css).toContain(`@font-face { font-family: 'JetBrains Mono'; src: url("../assets/fonts/jetbrains-mono.woff2")`)
    expect(css).toContain('--gutter: clamp(20px, 5vw, 56px)')
    expect(css).toContain('--step-5: clamp(')
    expect(css).toContain(':where(button, .button, .btn, a[role="button"]) { white-space: nowrap; }')
    expect(css).not.toMatch(/https?:\/\//)
    expect(familiesNamed(author)).toEqual(['Inter', 'JetBrains Mono'])
    expect(siteFontFiles(css)).toEqual(['fonts/inter.woff2', 'fonts/jetbrains-mono.woff2'])
  })

  it('is replaced, never stacked, and leaves an unchanged stylesheet byte for byte', () => {
    const once = withSiteFoundation(author)
    expect(withSiteFoundation(once)).toBe(once)
    expect(once.split(FOUNDATION_START)).toHaveLength(2)
    expect(withoutFoundation(once).startsWith(':root{--ink:#fff}')).toBe(true)
  })

  it('caps tracking so heavy letters never touch, and leaves the rest alone', () => {
    const { css, capped } = capTracking(author)
    expect(capped).toBe(1)
    expect(css).toContain('h1{font-size:var(--step-5);letter-spacing: -0.035em}')
    expect(css).toContain('letter-spacing:-0.02em')
    expect(withSiteFoundation(author)).toContain('letter-spacing: -0.035em')
  })

  it('starts a new site in scale and counts its fonts as package files for the checks and the build', () => {
    const site = createDefaultSiteDocument()
    expect(site.styles.startsWith(FOUNDATION_START)).toBe(true)
    expect(site.styles).toContain('padding: var(--space-xl) var(--gutter) var(--space-section)')
    const branded = { ...site, styles: withSiteFoundation(author) }
    expect(checkSite(branded, [], { 'index.html': [] }).filter(f => f.code === 'missing-asset')).toEqual([])
    expect(planBuild(branded, []).assets).toEqual(expect.arrayContaining(['fonts/inter.woff2']))
    // The preview shows the face from the app, without reading the package.
    const html = previewDocument({ html: site.pages['index.html'], styles: branded.styles, assets: {} })
    expect(html).toContain('data:font/woff2')
  })
})
