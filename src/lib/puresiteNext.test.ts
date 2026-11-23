// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { checkSite } from './buildSite'
import {
  contrastRatio,
  DESIGN_PRESETS,
  readDesignTokens,
  STUDIO_TOKENS_END,
  STUDIO_TOKENS_START,
  wcagGrade,
  withDesignTokens,
} from './designTokens'
import {
  duplicateElement,
  moveElement,
  readElement,
  setElementAlt,
  setElementLayout,
  setElementLink,
} from './pages'
import { runPreflightAudit } from './preflightAudit'
import { internalLinks } from './preview'
import {
  insertSectionIntoPage,
  SECTION_LIBRARY,
  SECTION_STYLES_START,
  withSectionLibraryStyles,
} from './sectionLibrary'
import { createDefaultSiteDocument } from './siteDocument'
import { admitSiteEdit } from './siteDoor'
import { withSiteFoundation } from './siteFoundation'
import { siteHash } from './siteHash'
import { createSiteFromTemplate, SITE_TEMPLATES } from './siteTemplates'

const bridgeCallMock = vi.hoisted(() => vi.fn())
vi.mock('../bridge/platformBridge', async importOriginal => {
  const actual = await importOriginal<typeof import('../bridge/platformBridge')>()
  return {
    ...actual,
    bridge: {
      ...actual.bridge,
      call: bridgeCallMock,
    },
  }
})

import {
  buildCloudSiteFiles,
  deleteCloudFormSubmission,
  getCloudPublishStatus,
  listCloudFormSubmissions,
  publishCloudSite,
  rollbackCloudSiteVersion,
  slugifySiteTitle,
} from './pureCloudSiteClient'

describe('PureSite Next: Visual Section Library', () => {
  it('provides 10 accessible Swiss-editorial sections including FAQ <details> and PureCloud contact form', () => {
    expect(SECTION_LIBRARY).toHaveLength(10)
    const ids = SECTION_LIBRARY.map(s => s.id)
    expect(ids).toEqual([
      'hero',
      'editorial-split',
      'feature-grid',
      'metrics-strip',
      'pricing-tiers',
      'testimonials',
      'faq-accordion',
      'contact-form',
      'cta-banner',
      'site-footer',
    ])

    const faq = SECTION_LIBRARY.find(s => s.id === 'faq-accordion')!
    expect(faq.html).toContain('<details')
    expect(faq.html).toContain('<summary>')

    const form = SECTION_LIBRARY.find(s => s.id === 'contact-form')!
    expect(form.html).toContain('method="POST"')
    expect(form.html).toContain('action="_forms/contact"')
    expect(form.html).toContain('name="_gotcha"')
  })

  it('inserts sections cleanly into <main> through admitSiteEdit and attaches section CSS once', () => {
    const base = createDefaultSiteDocument()
    const outcome = admitSiteEdit(
      {
        next: doc => insertSectionIntoPage(doc, 'index.html', 'pricing-tiers'),
        origin: 'manual',
      },
      { content: base, hash: siteHash(base) },
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.content.pages['index.html']).toContain('Transparent pricing')
    expect(outcome.content.styles).toContain(SECTION_STYLES_START)

    // Inserting a second section should not duplicate the section stylesheet block.
    const second = insertSectionIntoPage(outcome.content, 'index.html', 'faq-accordion')
    expect(second.pages['index.html']).toContain('Frequently asked questions')
    expect(second.styles.split(SECTION_STYLES_START).length - 1).toBe(1)
    expect(withSectionLibraryStyles(second.styles)).toBe(second.styles)
  })
})

describe('PureSite Next: Design Tokens & WCAG 2.1 Contrast Studio', () => {
  it('computes accurate WCAG 2.1 contrast ratios and grades', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 2)
    expect(wcagGrade(21)).toBe('AAA')
    expect(wcagGrade(5.0)).toBe('AA')
    expect(wcagGrade(3.2)).toBe('Fail')
    expect(wcagGrade(3.2, true)).toBe('AA')
    expect(wcagGrade(4.6, true)).toBe('AAA')
  })

  it('ensures all 5 curated presets pass WCAG AA for body and muted ink', () => {
    expect(DESIGN_PRESETS).toHaveLength(5)
    for (const preset of DESIGN_PRESETS) {
      const bodyRatio = contrastRatio(preset.tokens.ink, preset.tokens.ground)
      const mutedRatio = contrastRatio(preset.tokens.inkSoft, preset.tokens.ground)
      expect(bodyRatio, `${preset.name} body contrast`).toBeGreaterThanOrEqual(7)
      expect(mutedRatio, `${preset.name} muted contrast`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('roundtrips design tokens through managed CSS block and triggers bundled WOFF2 @font-face', () => {
    const base = createDefaultSiteDocument()
    const warm = DESIGN_PRESETS.find(p => p.id === 'warm-paper')!.tokens
    const custom = { ...warm, measureCh: 74, radiusPx: 10, rhythmScale: 1.2 }

    const updatedCss = withSiteFoundation(withDesignTokens(base.styles, custom))
    expect(updatedCss).toContain(STUDIO_TOKENS_START)
    expect(updatedCss).toContain(STUDIO_TOKENS_END)
    expect(updatedCss).toContain("font-family: 'Newsreader'")
    expect(updatedCss).toContain('newsreader.woff2')
    expect(updatedCss).toContain("font-family: 'Plus Jakarta Sans'")

    const parsed = readDesignTokens(updatedCss)
    expect(parsed).toEqual(custom)

    // Re-writing replaces the single managed block rather than duplicating it.
    const obsidian = DESIGN_PRESETS.find(p => p.id === 'obsidian-ink')!.tokens
    const secondCss = withSiteFoundation(withDesignTokens(updatedCss, obsidian))
    expect(secondCss.split(STUDIO_TOKENS_START).length - 1).toBe(1)
    expect(readDesignTokens(secondCss)).toEqual(obsidian)
  })
})

describe('PureSite Next: Visual Element DOM Helpers', () => {
  const sampleHtml = `<!DOCTYPE html>
<html lang="en">
  <head><title>Sample</title></head>
  <body>
    <main>
      <h1 id="hero-title">Hello</h1>
      <p>First paragraph</p>
      <a href="/work/">View work</a>
      <img src="assets/photo.png" alt="Initial alt" />
    </main>
  </body>
</html>`

  it('reads DOM breadcrumbs and metadata, reorders, duplicates without ID collision, and edits links/alt/layout', () => {
    const pInfo = readElement(sampleHtml, '0/1')!
    expect(pInfo.tagName).toBe('p')
    expect(pInfo.breadcrumb).toEqual(['main', 'p'])
    expect(pInfo.canMoveUp).toBe(true)
    expect(pInfo.canMoveDown).toBe(true)

    const movedUp = moveElement(sampleHtml, '0/1', 'up')
    expect(movedUp.nextPath).toBe('0/0')
    expect(readElement(movedUp.html, '0/0')?.tagName).toBe('p')

    const movedDown = moveElement(movedUp.html, '0/0', 'down')
    expect(movedDown.nextPath).toBe('0/1')

    const duplicated = duplicateElement(sampleHtml, '0/0')
    expect(duplicated.nextPath).toBe('0/1')
    expect(duplicated.html.match(/id="hero-title"/g)?.length).toBe(1)

    const linked = setElementLink(sampleHtml, '0/2', { href: 'https://example.org', newTab: true })
    const linkInfo = readElement(linked, '0/2')!
    expect(linkInfo.href).toBe('https://example.org')
    expect(linkInfo.newTab).toBe(true)
    expect(linked).toContain('rel="noopener noreferrer"')

    // Unsafe javascript: scheme is blocked
    expect(setElementLink(sampleHtml, '0/2', { href: 'javascript:alert(1)' })).toBe(sampleHtml)

    const alted = setElementAlt(sampleHtml, '0/3', 'Studio exhibition hall')
    expect(readElement(alted, '0/3')?.alt).toBe('Studio exhibition hall')

    const laidOut = setElementLayout(sampleHtml, '0/1', { align: 'center', spacing: 'loose' })
    const layoutInfo = readElement(laidOut, '0/1')!
    expect(layoutInfo.align).toBe('center')
    expect(layoutInfo.spacing).toBe('loose')
    expect(laidOut).toContain('text-align: center')
    expect(laidOut).toContain('padding-block: var(--space-xl)')
  })
})

describe('PureSite Next: Unified Live Pre-Flight Auditor', () => {
  it('flags SEO, accessibility, contrast, and missing 404 issues with actionable fixes', () => {
    const doc = createDefaultSiteDocument()
    doc.pages['index.html'] = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>Home</title><link rel="stylesheet" href="styles/site.css" /></head>
  <body>
    <main>
      <h1>One</h1>
      <h1>Two</h1>
      <h3>Skipped heading</h3>
      <img src="assets/pic.png" />
      <a href="/nowhere"></a>
    </main>
  </body>
</html>`
    doc.styles = withDesignTokens(doc.styles, {
      ...DESIGN_PRESETS[0]!.tokens,
      ground: '#ffffff',
      ink: '#cccccc',
    })

    const report = runPreflightAudit({
      document: doc,
      selectedPage: 'index.html',
      findings: [],
    })

    expect(report.counts.errors).toBeGreaterThanOrEqual(4)
    expect(report.grade).toBe('Fix before launch')
    expect(report.items.some(i => i.id.startsWith('a11y:lang:'))).toBe(true)
    expect(report.items.some(i => i.id.startsWith('a11y:multi-h1:'))).toBe(true)
    expect(report.items.some(i => i.id.startsWith('a11y:heading-skip:'))).toBe(true)
    expect(report.items.some(i => i.id.startsWith('a11y:img-alt:'))).toBe(true)
    expect(report.items.some(i => i.id.startsWith('a11y:empty-interactive:'))).toBe(true)
    expect(report.items.some(i => i.id === 'a11y:contrast-body')).toBe(true)
    expect(report.items.some(i => i.fixAction?.kind === 'add-404')).toBe(true)
    expect(report.preview.title).toBe('Home')
  })

  it('gives clean multi-page templates a high Ready launch score', () => {
    const site = createSiteFromTemplate('studio-agency')
    const linksByPage = Object.fromEntries(
      Object.entries(site.pages).map(([p, html]) => [p, internalLinks(html, p)]),
    )
    const findings = checkSite(site, [], linksByPage)
    const report = runPreflightAudit({
      document: site,
      selectedPage: 'index.html',
      findings,
    })
    expect(report.counts.errors).toBe(0)
    expect(report.score).toBeGreaterThanOrEqual(90)
    expect(report.grade).toBe('Ready')
  })
})

describe('PureSite Next: Multi-Page Starter Templates', () => {
  it('builds 5 clean multi-page Swiss-editorial templates with zero checkSite errors and PureCloud forms', () => {
    expect(SITE_TEMPLATES).toHaveLength(5)
    for (const template of SITE_TEMPLATES) {
      const doc = createSiteFromTemplate(template.id)
      expect(Object.keys(doc.pages).length).toBeGreaterThanOrEqual(4)
      expect(doc.pages['index.html']).toBeDefined()
      expect(doc.pages['contact.html']).toContain('action="_forms/contact"')
      expect(doc.pages['contact.html']).toContain('name="_gotcha"')
      expect(doc.pages['index.html']).toContain('details class="site-menu"')

      const linksByPage = Object.fromEntries(
        Object.entries(doc.pages).map(([p, html]) => [p, internalLinks(html, p)]),
      )
      const findings = checkSite(doc, [], linksByPage)
      expect(
        findings.filter(f => f.severity === 'error'),
        `${template.name} should have zero blocking findings`,
      ).toEqual([])
    }
  })
})

describe('PureSite Next: PureCloud Publish Client', () => {
  it('slugifies titles, builds publish file payloads, degrades offline, and calls PureServer publish actions', async () => {
    expect(slugifySiteTitle('Atelier Nord — Studio!')).toBe('atelier-nord-studio')

    const site = createSiteFromTemplate('studio-agency')
    const files = buildCloudSiteFiles(site, {
      'logo.png': 'data:image/png;base64,iVBORw0KGgo=',
    })
    expect(files.some(f => f.path === 'index.html' && typeof f.text === 'string')).toBe(true)
    expect(files.some(f => f.path === 'styles/site.css' && typeof f.text === 'string')).toBe(true)
    expect(files.some(f => f.path === 'llms.txt' && typeof f.text === 'string')).toBe(true)
    expect(files.some(f => f.path === 'assets/logo.png' && f.base64 === 'iVBORw0KGgo=')).toBe(true)

    // Graceful offline fallback
    bridgeCallMock.mockRejectedValueOnce(new Error('Bridge offline'))
    const offline = await getCloudPublishStatus()
    expect(offline.connected).toBe(false)
    expect(offline.reason).toContain('Bridge offline')

    // Connected publish, rollback, form inbox
    bridgeCallMock.mockResolvedValueOnce({
      item: { id: 'site-1', slug: 'atelier-nord', title: 'Atelier Nord', url: 'https://cloud.test/s/atelier-nord/', activeVersion: 1 },
      version: 1,
      contentHash: 'abc123',
    })
    const published = await publishCloudSite({
      slug: 'atelier-nord',
      title: 'Atelier Nord',
      files,
      allowForms: true,
    })
    expect(published.item.url).toBe('https://cloud.test/s/atelier-nord/')
    expect(bridgeCallMock).toHaveBeenLastCalledWith('cloud.call', [
      expect.objectContaining({ service: 'publish', action: 'publishSite' }),
    ])

    bridgeCallMock.mockResolvedValueOnce({
      item: { id: 'site-1', slug: 'atelier-nord', title: 'Atelier Nord', url: 'https://cloud.test/s/atelier-nord/', activeVersion: 1 },
    })
    await rollbackCloudSiteVersion('site-1', 1)
    expect(bridgeCallMock).toHaveBeenLastCalledWith('cloud.call', [
      { service: 'publish', action: 'rollbackVersion', input: { id: 'site-1', version: 1 } },
    ])

    bridgeCallMock.mockResolvedValueOnce({
      submissions: [{ id: 'sub-1', formName: 'contact', fields: { name: 'Ada' }, createdAt: '2026-11-22T00:00:00Z' }],
    })
    const inbox = await listCloudFormSubmissions('site-1')
    expect(inbox.submissions).toHaveLength(1)

    bridgeCallMock.mockResolvedValueOnce({})
    await deleteCloudFormSubmission('site-1', 'sub-1')
    expect(bridgeCallMock).toHaveBeenLastCalledWith('cloud.call', [
      { service: 'publish', action: 'deleteFormSubmission', input: { id: 'site-1', submissionId: 'sub-1' } },
    ])
  })
})
