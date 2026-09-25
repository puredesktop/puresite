import { describe, expect, it } from 'vitest'
import {
  deinlineMarkup,
  internalLinks,
  oversizeAssets,
  previewDocument,
  referencedAssets,
  resolvePagePath,
  stylesheetLinkState,
} from './preview'
import { planBuild, checkSite } from './buildSite'
import { createDefaultSiteDocument } from './siteDocument'

const assets = { 'hero.png': 'data:image/png;base64,AAAA' }
const styles = 'body { color: red }'

describe('preparing a page for a sandboxed frame', () => {
  it('inlines the stylesheet the page linked', () => {
    const html = `<html><head><link rel="stylesheet" href="styles/site.css"></head><body></body></html>`
    const out = previewDocument({ html, styles, assets: {} })
    expect(out).toContain('<style>')
    expect(out).toContain('color: red')
    expect(out).not.toContain('styles/site.css')
  })

  it('inlines the stylesheet a nested page linked one level up', () => {
    const html = `<html><head><link rel="stylesheet" href="../styles/site.css"></head><body></body></html>`
    expect(
      previewDocument({ html, styles, assets: {}, page: 'work/index.html' }),
    ).toContain('color: red')
  })

  it('leaves a stylesheet link that resolves nowhere, so the preview breaks the way the host will', () => {
    // From work/, "styles/site.css" is /work/styles/site.css — not a file.
    const html = `<html><head><link rel="stylesheet" href="styles/site.css"></head><body></body></html>`
    const out = previewDocument({ html, styles, assets: {}, page: 'work/index.html' })
    expect(out).not.toContain('color: red')
    expect(out).toContain('href="styles/site.css"')
  })

  it('does not give an unlinked page the site look it will not ship with', () => {
    const html = `<html><head></head><body><p>x</p></body></html>`
    expect(previewDocument({ html, styles, assets: {} })).not.toContain('color: red')
  })

  it('inlines a link whose attributes come in another order', () => {
    const html = `<html><head><link href="/styles/site.css" rel="stylesheet"></head><body></body></html>`
    expect(previewDocument({ html, styles, assets: {} })).toContain('color: red')
  })

  it('budgets inlining per page, over the assets that page references', () => {
    const big = `data:image/png;base64,${'A'.repeat(13 * 1024 * 1024)}`
    const many = { 'big.png': big, 'hero.png': assets['hero.png'] }
    const light = `<body><img src="assets/hero.png"></body>`
    expect(previewDocument({ html: light, styles, assets: many })).toContain('base64,AAAA')
    const heavy = `<body><img src="assets/big.png"><img src="assets/hero.png"></body>`
    expect(previewDocument({ html: heavy, styles, assets: many })).toContain('src="assets/big.png"')
    expect(oversizeAssets(light, many)).toBeNull()
    expect(oversizeAssets(heavy, many)?.names).toEqual(['big.png', 'hero.png'])
  })

  it('swaps an asset reference for its data URL', () => {
    const html = `<body><img src="assets/hero.png"></body>`
    expect(previewDocument({ html, styles, assets })).toContain(
      'src="data:image/png;base64,AAAA"',
    )
  })

  it('swaps one reached from a subfolder', () => {
    const html = `<body><img src="../assets/hero.png"></body>`
    expect(previewDocument({ html, styles, assets })).toContain(
      'src="data:image/png;base64,AAAA"',
    )
  })

  it('swaps a CSS url() reference', () => {
    const html = `<body><div style="background: url(assets/hero.png)"></div></body>`
    expect(previewDocument({ html, styles, assets })).toContain(
      'url(data:image/png;base64,AAAA)',
    )
  })

  it('leaves an asset it does not have, so the published page still finds it', () => {
    const html = `<body><img src="assets/missing.png"></body>`
    expect(previewDocument({ html, styles, assets })).toContain(
      'src="assets/missing.png"',
    )
  })
})

describe('bringing an edited element back out of the preview', () => {
  it('puts every inlined asset back on its assets/ path, at the page\'s depth', () => {
    const page = 'work/index.html'
    const html = `<body><figure><img src="../assets/hero.png" alt=""><div style="background: url(../assets/hero.png)"></div></figure></body>`
    const inlined = previewDocument({ html, styles, assets, page })
    const figure = /<figure>[\s\S]*<\/figure>/.exec(inlined)?.[0] ?? ''
    expect(figure).toContain('base64,AAAA')
    expect(deinlineMarkup(figure, assets, page)).toBe(
      `<figure><img src="../assets/hero.png" alt=""><div style="background: url(../assets/hero.png)"></div></figure>`,
    )
  })

  it('leaves a data URL the preview did not make', () => {
    const pasted = `<img src="data:image/gif;base64,R0lGOD">`
    expect(deinlineMarkup(pasted, assets, 'index.html')).toBe(pasted)
  })
})

describe('how a page reaches the stylesheet', () => {
  it('resolves the way a host does', () => {
    expect(resolvePagePath('work/index.html', '../styles/site.css')).toBe('styles/site.css')
    expect(resolvePagePath('work/index.html', 'styles/site.css')).toBe('work/styles/site.css')
    expect(resolvePagePath('index.html', '/styles/site.css')).toBe('styles/site.css')
    expect(resolvePagePath('index.html', 'https://fonts.example/x.css')).toBeNull()
  })

  it('names a link that will 404, and a page with no styles at all', () => {
    const wrong = stylesheetLinkState(
      `<link rel="stylesheet" href="styles/site.css">`,
      'work/index.html',
    )
    expect(wrong.linked).toBe(false)
    expect(wrong.broken).toEqual([{ href: 'styles/site.css', resolved: 'work/styles/site.css' }])
    const bare = stylesheetLinkState(`<html><head></head></html>`, 'index.html')
    expect(bare.linked).toBe(false)
    expect(bare.ownStyles).toBe(false)
    const own = stylesheetLinkState(`<style>p{}</style>`, 'index.html')
    expect(own.ownStyles).toBe(true)
  })
})

describe('reading a page', () => {
  it('finds the assets a page uses', () => {
    const html = `<img src="assets/a.png"><div style="background:url(../assets/b.jpg)"></div>`
    expect(referencedAssets(html).sort()).toEqual(['a.png', 'b.jpg'])
  })

  it('resolves links relative to the page they are on', () => {
    const html = `<a href="../pricing.html">p</a><a href="index.html">h</a>`
    expect(internalLinks(html, 'work/index.html').sort()).toEqual([
      'pricing.html',
      'work/index.html',
    ])
  })

  it('treats a root-relative link as a page path', () => {
    expect(internalLinks('<a href="/about/">a</a>', 'index.html')).toEqual([
      'about/index.html',
    ])
  })

  it('ignores off-site links', () => {
    expect(internalLinks('<a href="https://example.com">x</a>', 'index.html')).toEqual(
      [],
    )
  })
})

describe('what will be wrong once it is live', () => {
  it('names a link to a page nobody built, without calling it broken', () => {
    const document = createDefaultSiteDocument()
    const findings = checkSite(document, [], {
      'index.html': ['about/index.html'],
    })
    const promised = findings.find(f => f.code === 'promised-page')
    // The words ship as text, so a reader never lands on nothing: worth
    // saying, never worth holding a publish for.
    expect(promised?.severity).toBe('warning')
    expect(promised?.message).toContain('not built yet')
  })

  it('catches an image that was never added', () => {
    const document = createDefaultSiteDocument()
    document.pages['index.html'] += '<img src="assets/ghost.png">'
    const findings = checkSite(document, [], {})
    expect(findings.some(f => f.code === 'missing-asset')).toBe(true)
  })

  it('reports a stylesheet link with the wrong depth as blocking, and no stylesheet as a warning', () => {
    const document = createDefaultSiteDocument()
    document.pages['work/index.html'] =
      `<html><head><title>W</title><meta name="viewport" content="x"><link rel="stylesheet" href="styles/site.css"></head><body></body></html>`
    document.pages['bare.html'] =
      `<html><head><title>B</title><meta name="viewport" content="x"></head><body></body></html>`
    const findings = checkSite(document, [], {})
    const broken = findings.find(f => f.code === 'broken-stylesheet')
    expect(broken?.severity).toBe('error')
    expect(broken?.page).toBe('work/index.html')
    expect(broken?.fix).toContain('../styles/site.css')
    const bare = findings.find(f => f.code === 'no-stylesheet')
    expect(bare?.severity).toBe('warning')
    expect(bare?.page).toBe('bare.html')
    expect(findings.filter(f => f.page === 'index.html' && f.code.includes('stylesheet'))).toEqual([])
  })

  it('is quiet about a site that is fine', () => {
    const document = createDefaultSiteDocument()
    const findings = checkSite(document, [], { 'index.html': [] })
    expect(findings.filter(f => f.severity === 'error')).toEqual([])
  })
})

describe('planning the build', () => {
  it('lists every page, the stylesheet, and only the assets in use', () => {
    const document = createDefaultSiteDocument()
    document.pages['index.html'] += '<img src="assets/hero.png">'
    const plan = planBuild(document, ['hero.png', 'spare.png'])
    expect(plan.files.map(file => file.path)).toContain('index.html')
    expect(plan.files.map(file => file.path)).toContain('styles/site.css')
    expect(plan.assets).toEqual(['hero.png'])
    expect(plan.unusedAssets).toEqual(['spare.png'])
  })
})

describe('telling the frame what each link is', () => {
  const page = `<a href="/about/">About</a> <a href="/judges/">Judges</a>
    <a href="https://example.org">Out</a> <a href="assets/a.pdf">File</a>`

  it('marks a link to a page that exists, and one that is only promised', () => {
    const out = previewDocument({
      html: page,
      styles: '',
      assets: {},
      page: 'index.html',
      knownPages: ['index.html', 'about/index.html'],
    })
    expect(out).toContain('data-site-link="about/index.html" data-site-state="built"')
    expect(out).toContain('data-site-link="judges/index.html" data-site-state="promised"')
  })

  it('leaves the outside world and file links alone', () => {
    const out = previewDocument({
      html: page,
      styles: '',
      assets: {},
      page: 'index.html',
      knownPages: ['index.html'],
    })
    expect(out).toContain('<a href="https://example.org">')
    expect(out).toContain('<a href="assets/a.pdf">')
  })

  it('marks nothing when it has not been told which pages exist', () => {
    const out = previewDocument({ html: page, styles: '', assets: {}, page: 'index.html' })
    expect(out).not.toContain('data-site-link')
  })
})
