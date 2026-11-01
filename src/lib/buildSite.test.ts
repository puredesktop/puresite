import { expect, it } from 'vitest'
import { checkSite, planBuild } from './buildSite'
import { createDefaultSiteDocument } from './siteDocument'
import { internalLinks } from './preview'
import { pageLinks, shipPage } from './siteLinks'

it('keeps nested and root asset anchors out of page promises and shipping transformations', () => {
  const html = '<a href="../assets/guide.pdf">Guide</a><a href="/assets/guide.pdf">Download</a><a href="/future/">Future</a><a href="https://example.org/">External</a>'
  expect(pageLinks(html, 'about/index.html').map(link => link.target)).toEqual(['future/index.html'])
  expect(internalLinks(html, 'about/index.html')).toEqual(['future/index.html'])
  expect(shipPage(html, 'about/index.html', ['index.html', 'about/index.html'])).toBe(html.replace('<a href="/future/">Future</a>', 'Future'))
})

it('plans only required public assets and checks CSS and absolute asset references', () => {
  const doc = createDefaultSiteDocument()
  doc.pages = { 'index.html': '<title>Home</title><img src="/assets/hero.png"><a href="/assets/missing.pdf">Read</a>' }
  doc.styles = '@font-face {font-family: Custom; src:url(../assets/fonts/custom.woff2)} body {background:url(/assets/background.png)}'
  const available = ['hero.png', 'background.png', 'fonts/custom.woff2', 'unused.png', 'reference.png']
  expect(planBuild(doc, available).assets.sort()).toEqual(['background.png', 'fonts/custom.woff2', 'hero.png'])
  expect(checkSite(doc, available, {}).filter(f => f.code === 'missing-asset').map(f => f.message)).toContain('index.html references assets/missing.pdf, which is not in the package')
})

it('still detects missing pages, missing nested assets, and incorrect asset depth', () => {
  const doc = createDefaultSiteDocument()
  doc.pages = {
    'index.html': '<title>Home</title><a href="/not-built/">Planned page</a><a href="https://external.example/assets/x.pdf">External</a>',
    'about/team/index.html': '<title>Team</title><a href="../../assets/missing.pdf">Missing file</a><img src="../assets/hero.png">',
  }
  doc.styles = ''
  const links = Object.fromEntries(Object.entries(doc.pages).map(([page, html]) => [page, internalLinks(html, page)]))
  expect(links['index.html']).toEqual(['not-built/index.html'])
  expect(links['about/team/index.html']).toEqual([])
  const findings = checkSite(doc, ['hero.png'], links)
  expect(findings.filter(f => f.code === 'promised-page').map(f => f.severity)).toEqual(['warning'])
  expect(findings.filter(f => f.code === 'missing-asset').map(f => f.message)).toEqual([
    'about/team/index.html references assets/missing.pdf, which is not in the package',
    'about/team/index.html references about/assets/hero.png, which is not in the package',
  ])
})

it('includes local srcset candidates alongside data URLs and ignores commented CSS references', () => {
  const doc = createDefaultSiteDocument()
  doc.pages = { 'index.html': '<title>Home</title><img srcset="data:image/png;base64,AA== 1x, /assets/hero.png 2x">' }
  doc.styles = '/* background:url(../assets/reference.png) */ body { background: url(../assets/hero.png) }'
  doc.manifest.assets = [{ name: 'reference.png', role: 'reference', description: 'Private reference' }]
  expect(checkSite(doc, ['hero.png', 'reference.png'], {}).filter(f => f.severity === 'error')).toEqual([])
  expect(planBuild(doc, ['hero.png', 'reference.png']).assets).toEqual(['hero.png'])
  doc.styles = ''
  expect(planBuild(doc, ['hero.png']).assets).toEqual(['hero.png'])
  expect(checkSite(doc, [], {}).filter(f => f.code === 'missing-asset').map(f => f.message)).toEqual(['index.html references assets/hero.png, which is not in the package'])
})

it('resolves URL-encoded asset names as real file destinations', () => {
  const doc = createDefaultSiteDocument()
  doc.pages = { 'index.html': '<title>Home</title><a href="/assets/research%20guide.pdf">Guide</a>' }
  doc.styles = ''
  expect(checkSite(doc, ['research guide.pdf'], {}).filter(f => f.severity === 'error')).toEqual([])
  expect(planBuild(doc, ['research guide.pdf']).assets).toEqual(['research guide.pdf'])
})

it('accepts a local embed pointing at an existing page without treating it as a missing asset', () => {
  const doc = createDefaultSiteDocument()
  doc.pages = { 'index.html': '<title>Home</title><embed src="/about/" type="text/html">', 'about/index.html': '<title>About</title>' }
  doc.styles = ''
  expect(checkSite(doc, [], {}).filter(f => f.severity === 'error')).toEqual([])
  expect(planBuild(doc, ['about/index.html']).assets).toEqual([])
})

it('classifies a normalized destination rather than a cancelled assets path segment', () => {
  const html = '<a href="../assets/../not-built/">Planned page</a>'
  expect(pageLinks(html, 'about/index.html').map(link => link.target)).toEqual(['not-built/index.html'])
  expect(internalLinks(html, 'about/index.html')).toEqual(['not-built/index.html'])
  expect(shipPage(html, 'about/index.html', ['index.html', 'about/index.html'])).toBe('Planned page')
})
