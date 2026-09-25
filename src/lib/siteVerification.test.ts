import { describe, expect, it } from 'vitest'
import { createDefaultSiteDocument } from './siteDocument'
import { addPage } from './pages'
import {
  exportRefusalMessage,
  pageRenderHash,
  verifySite,
  type PageEvidence,
} from './siteVerification'

const FINGERPRINT = 'viewport:1280x900|fonts|dpr1'

function evidenceFor(
  document: ReturnType<typeof createDefaultSiteDocument>,
  page: string,
  overrides: Partial<PageEvidence> = {},
): PageEvidence {
  return {
    page,
    measured: true,
    fontsStatus: 'loaded',
    fingerprint: FINGERPRINT,
    renderHash: pageRenderHash(document, page),
    overflowX: false,
    height: 900,
    at: 1,
    ...overrides,
  }
}

describe('verifying a site', () => {
  it('is verified when every page measured cleanly under the current conditions', () => {
    const document = addPage(createDefaultSiteDocument(), { path: 'about' })
    const result = verifySite({
      document,
      findings: [],
      evidence: {
        'index.html': evidenceFor(document, 'index.html'),
        'about/index.html': evidenceFor(document, 'about/index.html'),
      },
      currentFingerprint: FINGERPRINT,
      viewportWidth: 1280,
    })
    expect(result.state).toBe('verified')
    expect(result.reasons).toEqual([])
  })

  it('is checking, never verified, while a page was measured in a dead frame or with fonts loading', () => {
    const document = createDefaultSiteDocument()
    const dead = verifySite({
      document,
      findings: [],
      evidence: { 'index.html': evidenceFor(document, 'index.html', { measured: false }) },
      currentFingerprint: FINGERPRINT,
      viewportWidth: 1280,
    })
    expect(dead.state).toBe('checking')
    expect(dead.reasons[0]).toContain('visible frame')
    const fonts = verifySite({
      document,
      findings: [],
      evidence: { 'index.html': evidenceFor(document, 'index.html', { fontsStatus: 'loading' }) },
      currentFingerprint: FINGERPRINT,
      viewportWidth: 1280,
    })
    expect(fonts.state).toBe('checking')
    expect(fonts.reasons[0]).toContain('fonts')
  })

  it('goes back to checking when the page or the viewport changed since it was measured', () => {
    const document = createDefaultSiteDocument()
    const stale = verifySite({
      document,
      findings: [],
      evidence: { 'index.html': evidenceFor(document, 'index.html', { renderHash: 'older' }) },
      currentFingerprint: FINGERPRINT,
      viewportWidth: 1280,
    })
    expect(stale.state).toBe('checking')
    expect(stale.reasons[0]).toContain('changed since it was measured')
    const resized = verifySite({
      document,
      findings: [],
      evidence: { 'index.html': evidenceFor(document, 'index.html') },
      currentFingerprint: 'viewport:390x844|fonts|dpr1',
      viewportWidth: 390,
    })
    expect(resized.state).toBe('checking')
  })

  it('fails on a file fact whether or not the page was measured', () => {
    const document = createDefaultSiteDocument()
    const result = verifySite({
      document,
      findings: [
        {
          severity: 'error',
          code: 'missing-asset',
          message: 'index.html references assets/ghost.png, which is not in the package',
          fix: 'add the file, or point the reference at one that is there',
          page: 'index.html',
        },
      ],
      evidence: {},
      currentFingerprint: FINGERPRINT,
      viewportWidth: 1280,
    })
    expect(result.state).toBe('failed')
    expect(result.reasons).toEqual(['index.html references assets/ghost.png, which is not in the package'])
  })

  it('fails a clean measurement that scrolls sideways', () => {
    const document = createDefaultSiteDocument()
    const result = verifySite({
      document,
      findings: [],
      evidence: { 'index.html': evidenceFor(document, 'index.html', { overflowX: true }) },
      currentFingerprint: FINGERPRINT,
      viewportWidth: 390,
    })
    expect(result.state).toBe('failed')
    expect(result.reasons[0]).toContain('scrolls sideways at 390px')
  })

  it('says what the preview cannot show instead of looking fine', () => {
    const document = createDefaultSiteDocument()
    const result = verifySite({
      document,
      findings: [],
      evidence: { 'index.html': evidenceFor(document, 'index.html') },
      currentFingerprint: FINGERPRINT,
      viewportWidth: 1280,
      oversize: { 'index.html': { names: ['big.jpg'], bytes: 14 * 1024 * 1024 } },
    })
    expect(result.state).toBe('checking')
    expect(result.reasons[0]).toBe(
      "the preview can't show assets/big.jpg (14 MB) on index.html — the build will include it",
    )
  })

  it('words the refusal for people', () => {
    const failed = exportRefusalMessage(
      { ok: false, reason: 'failed', message: '' },
      { state: 'failed', reasons: ['a', 'b'], pages: {} },
    )
    expect(failed).toBe("The site isn't ready to ship — a; b.")
    const checking = exportRefusalMessage(
      { ok: false, reason: 'checking', message: '' },
      { state: 'checking', reasons: ['index.html has not been measured yet'], pages: {} },
    )
    expect(checking).toContain('still being checked (index.html has not been measured yet)')
  })
})
