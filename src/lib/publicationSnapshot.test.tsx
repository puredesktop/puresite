import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChangesSheet } from '../components/ChangesSheet'
import { draftState, draftSummary, fingerprintPages, pageFingerprint } from './draftState'
import { assetFingerprint, publicationComparison, publishWithComparison, readAssetFingerprints } from './publicationSnapshot'
import { createDefaultSiteDocument, parseSiteManifest, serializeSiteManifest, type PublishedRecord, type SiteDocument } from './siteDocument'
import { readSitePackage, serializeSitePackage } from './packageIO'
import * as bridge from '../bridge/platformBridge'
import type { PublishFile } from './publish'
import type { PublishService } from './publishServices'
import { requiredAssetNames } from './buildSite'

vi.mock('../bridge/platformBridge', () => ({ fetchJson: vi.fn(), fetchRaw: vi.fn() }))
const IMAGE_A = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path fill="#cc0000" d="M0 0h1v1H0z"/></svg>'
const IMAGE_B = IMAGE_A.replace('#cc0000', '#0000cc')
const scratchRoots: string[] = []
afterEach(async () => { await Promise.all(scratchRoots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
const service: PublishService = {
  id: 'fake', name: 'Fake test host', description: '', anonymous: true, builtIn: false,
  endpoints: { create: { url: 'https://fake.invalid/create', method: 'POST' }, finalize: { url: 'https://fake.invalid/finalize/{slug}', method: 'POST' } },
}
function site(): SiteDocument {
  const document = createDefaultSiteDocument()
  document.pages = { 'index.html': '<h1>Home</h1><img src="assets/hero.svg">' }
  document.styles = 'body { color: red }'
  document.manifest.pages = ['index.html']
  document.manifest.assets = []
  return document
}
function files(document: SiteDocument, image = IMAGE_A): PublishFile[] {
  return [
    ...Object.entries(document.pages).map(([path, content]) => ({ path, content, encoding: 'text' as const, contentType: 'text/html' })),
    { path: 'styles/site.css', content: document.styles, encoding: 'text', contentType: 'text/css' },
    { path: 'assets/hero.svg', content: btoa(image), encoding: 'base64', contentType: 'image/svg+xml' },
  ]
}
function record(document: SiteDocument, image = IMAGE_A): PublishedRecord {
  return { service: 'fake', slug: 'fixture', ...publicationComparison(document, files(document, image)) }
}
function compare(document: SiteDocument, image = IMAGE_A) {
  return draftState(document, document.manifest.published, { 'assets/hero.svg': assetFingerprint(btoa(image)) })
}
function sheet(document: SiteDocument, image = IMAGE_A): string {
  return renderToStaticMarkup(<ChangesSheet document={document} draft={compare(document, image)} onOpenPage={() => {}} onCompare={() => {}} onPublish={() => {}} onClose={() => {}} />)
}
async function reload(document: SiteDocument): Promise<SiteDocument> {
  const saved = Object.fromEntries(serializeSitePackage(document, []).map(file => [`/fixture/${file.name}`, file.content]))
  return readSitePackage('/fixture', {
    read: async path => { if (!(path in saved)) throw new Error('ENOENT'); return saved[path] },
    list: async () => ({ entries: Object.keys(document.pages).map(name => ({ name, isDirectory: false })) }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(bridge.fetchJson).mockImplementation(async request => request.url.includes('finalize') ? { siteUrl: 'https://fake.invalid/' } : {
    slug: 'fixture', upload: { versionId: 'version', uploads: [ { path: 'assets/hero.svg', url: 'https://fake.invalid/upload', method: 'PUT', headers: {} } ] },
  })
  vi.mocked(bridge.fetchRaw).mockResolvedValue(undefined)
})

describe('publication bytes and persistence', () => {
  it('compares content, CSS and equal-length replacements, including restoring the bytes', async () => {
    const document = site(); document.manifest.published = record(document)
    expect(compare(document).matchesLive).toBe(true)
    expect(compare(await reload(document)).matchesLive).toBe(true)
    expect(compare(document, IMAGE_B).assetsChanged).toEqual(['assets/hero.svg'])
    expect(compare(document, IMAGE_B).matchesLive).toBe(false)
    expect(compare(document).matchesLive).toBe(true)
    document.styles += '\nh1 { color: blue }'
    expect(compare(document).stylingChanged).toBe(true)
    expect(compare(document).edited).toEqual([])
    expect(draftSummary(compare(document))).toContain('styling changed')
    expect(sheet(document)).toContain('Styling changed')
    expect(sheet(document, IMAGE_B)).toContain('Asset changed')
  })
  it('ignores ordering, publication metadata, unused files and reference-only files', async () => {
    const document = site()
    document.pages['about/index.html'] = '<p>About</p>'
    document.manifest.assets = [{ name: 'reference.png', role: 'reference', description: 'Reference' }]
    document.manifest.published = record(document)
    document.pages = Object.fromEntries(Object.entries(document.pages).reverse())
    document.manifest.pages.reverse()
    document.manifest.published.url = 'https://different.invalid/'
    document.manifest.published.at = '2026-11-01'
    document.manifest.assets.push({ name: 'unused.png', role: 'content', description: 'Unused' })
    const read = vi.fn(async () => ({ base64: btoa(IMAGE_A) }))
    const assets = await readAssetFingerprints(document, read)
    expect(read.mock.calls).toHaveLength(1)
    expect(draftState(document, document.manifest.published, assets).matchesLive).toBe(true)
    expect(requiredAssetNames(document)).toEqual(['hero.svg'])
  })
  it('includes asset paths, even when the bytes match', () => {
    const document = site(); document.manifest.published = record(document)
    document.pages['index.html'] = document.pages['index.html'].replace('hero.svg', 'new.png')
    const state = draftState(document, document.manifest.published, { 'assets/new.png': assetFingerprint(btoa(IMAGE_A)) })
    expect(state.assetsChanged).toEqual(['assets/hero.svg', 'assets/new.png'])
  })
  it('keeps required asset read failures incomplete, never equal', async () => {
    const document = site(); document.manifest.published = record(document)
    const assets = await readAssetFingerprints(document, async () => { throw new Error('Unreadable') })
    const state = draftState(document, document.manifest.published, assets)
    expect(state.incomplete).toBe(true)
    expect(state.matchesLive).toBe(false)
    expect(state.comparisonNotes.join(' ')).toContain('assets/hero.svg')
    expect(sheet(document)).not.toContain('Comparison incomplete')
    const incompleteSheet = renderToStaticMarkup(<ChangesSheet document={document} draft={state} onOpenPage={() => {}} onCompare={() => {}} onPublish={() => {}} onClose={() => {}} />)
    expect(incompleteSheet).toContain('Comparison incomplete')
    expect(draftSummary(state)).toContain('comparison incomplete')
    expect(publicationComparison(document, files(document).filter(file => !file.path.startsWith('assets/'))).assets).toBeUndefined()
  })
  it.each(['pages', 'styles', 'assets'] as const)('retains partial legacy records without inventing %s data', async missing => {
    const document = site(); document.manifest.published = record(document)
    delete document.manifest.published[missing]
    const legacy = structuredClone(document.manifest.published)
    const loaded = await reload(document)
    expect(loaded.manifest.published).toEqual(legacy)
    loaded.pages['index.html'] += '<p>New text</p>'
    const state = compare(loaded)
    expect(state.neverPublished).toBe(false)
    expect(state.incomplete).toBe(true)
    expect(state.matchesLive).toBe(false)
    expect(state.edited).toEqual(missing === 'pages' ? [] : ['index.html'])
    expect(sheet(loaded)).toContain('Comparison incomplete')
    expect(sheet(loaded)).not.toContain('Nothing. What is here')
  })
  it('keeps the old host record without any fingerprints distinct from never published', () => {
    const document = site(); document.manifest.published = { service: 'fake', slug: 'fixture' }
    const loaded = parseSiteManifest(serializeSiteManifest(document.manifest))
    expect(loaded.published).toEqual(document.manifest.published)
    expect(compare(document)).toMatchObject({ neverPublished: false, incomplete: true, matchesLive: false })
    expect(draftSummary(draftState(document, undefined))).toBe('Never published')
  })
  it('hashes decoded binary values, including nulls and bytes above 127', () => {
    expect(assetFingerprint('AP8=')).toBe(assetFingerprint('AP8=\n'))
    expect(assetFingerprint('AP8=')).not.toBe(assetFingerprint('AAA='))
    expect(pageFingerprint('')).not.toBe(pageFingerprint(' '))
    expect(fingerprintPages({ a: 'a', b: 'b' })).toEqual(fingerprintPages({ b: 'b', a: 'a' }))
  })
})

describe('delayed fake host publication', () => {
  it('records the sent snapshot on success and preserves later content, CSS and equal-size asset edits through reload', async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), 'puresite-publication-race-'))
    scratchRoots.push(packageRoot)
    await mkdir(join(packageRoot, 'assets'))
    await writeFile(join(packageRoot, 'assets/hero.svg'), IMAGE_A)
    const diskAssets = (document: SiteDocument) => readAssetFingerprints(document, async name => ({ base64: (await readFile(join(packageRoot, 'assets', name))).toString('base64') }))
    let document = site(); document.manifest.published = record(document)
    const previous = structuredClone(document.manifest.published)
    let release!: () => void
    let started!: () => void
    const uploading = new Promise<void>(resolve => { started = resolve })
    const delayed = new Promise<void>(resolve => { release = resolve })
    vi.mocked(bridge.fetchRaw).mockImplementation(async () => { started(); await delayed; return })
    const sending = publishWithComparison(document, files(document), { service })
    await uploading
    document.pages['index.html'] += '<p>Edited while uploading</p>'
    document.styles = 'body { color: blue }'
    const image = IMAGE_B
    await writeFile(join(packageRoot, 'assets/hero.svg'), image)
    expect(document.manifest.published).toEqual(previous)
    release()
    const sent = await sending
    expect(vi.mocked(bridge.fetchRaw).mock.calls[0][0].body).toBe(btoa(IMAGE_A))
    expect(await readFile(join(packageRoot, 'assets/hero.svg'), 'utf8')).toBe(IMAGE_B)
    expect(sent.document.pages['index.html']).not.toContain('Edited while uploading')
    expect(sent.comparison).toEqual(publicationComparison(sent.document, files(sent.document)))
    document.manifest.published = { service: service.id, slug: sent.live.slug, ...sent.comparison }
    expect(draftState(document, document.manifest.published, await diskAssets(document))).toMatchObject({ edited: ['index.html'], stylingChanged: true, assetsChanged: ['assets/hero.svg'], incomplete: false, matchesLive: false })
    document = await reload(document)
    expect(document.pages['index.html']).toContain('Edited while uploading')
    expect(document.styles).toBe('body { color: blue }')
    expect(draftState(document, document.manifest.published, await diskAssets(document)).matchesLive).toBe(false)
    expect(sheet(document, image)).toContain('Styling changed')
    expect(sheet(document, image)).toContain('Asset changed')
    expect(draftSummary(compare(document, image))).toContain('1 changed, styling changed, 1 asset changed')
    vi.mocked(bridge.fetchRaw).mockResolvedValue(undefined)
    const next = await publishWithComparison(document, files(document, image), { service })
    document.manifest.published = { service: service.id, slug: next.live.slug, ...next.comparison }
    const loaded = await reload(document)
    expect(draftState(loaded, loaded.manifest.published, await diskAssets(loaded)).matchesLive).toBe(true)
  })
  it('keeps the preceding baseline and edits when host finalization fails', async () => {
    const document = site(); document.manifest.published = record(document)
    const previous = structuredClone(document.manifest.published)
    document.styles += 'p { color: blue }'
    vi.mocked(bridge.fetchJson).mockImplementation(async request => {
      if (request.url.includes('finalize')) throw new Error('Fake finalize failed')
      return { slug: 'fixture', upload: { versionId: 'version', uploads: [] } }
    })
    await expect(publishWithComparison(document, files(document, IMAGE_B), { service })).rejects.toThrow('Fake finalize failed')
    expect(document.manifest.published).toEqual(previous)
    expect(compare(await reload(document), IMAGE_B).matchesLive).toBe(false)
  })
  it('a complete successful publication replaces an incomplete historical comparison', async () => {
    const document = site(); document.manifest.published = { service: 'fake', slug: 'fixture' }
    const sent = await publishWithComparison(document, files(document), { service })
    document.manifest.published = { service: 'fake', slug: sent.live.slug, ...sent.comparison }
    expect(compare(await reload(document))).toMatchObject({ incomplete: false, matchesLive: true })
  })
})

describe('review regressions', () => {
  it('tracks root-relative asset replacements rather than claiming an unchanged draft', async () => {
    const document = site()
    document.pages['index.html'] = '<img src="/assets/hero.svg">'
    document.styles += ' main { background-image: url(/assets/hero.svg) }'
    document.manifest.published = record(document)
    expect(requiredAssetNames(document)).toEqual(['hero.svg'])
    const assets = await readAssetFingerprints(document, async () => ({ base64: btoa(IMAGE_B) }))
    expect(draftState(document, document.manifest.published, assets)).toMatchObject({ matchesLive: false, assetsChanged: ['assets/hero.svg'] })
  })
  it('publishing metadata alone never rewrites the stylesheet through the edit door', async () => {
    const { admitSiteEdit } = await import('./siteDoor')
    const { siteHash } = await import('./siteHash')
    const document = site()
    const published = record(document)
    const out = admitSiteEdit({ origin: 'manual', next: latest => ({ ...latest, manifest: { ...latest.manifest, published } }) }, { content: document, hash: siteHash(document) })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.content.styles).toBe(document.styles)
    expect(compare(out.content).matchesLive).toBe(true)
  })
  it('treats truncated required bytes as incomplete', async () => {
    const document = site(); document.manifest.published = record(document)
    const assets = await readAssetFingerprints(document, async () => ({ base64: btoa(IMAGE_A), byteLength: IMAGE_A.length + 1 }))
    expect(draftState(document, document.manifest.published, assets)).toMatchObject({ incomplete: true, matchesLive: false })
  })
})


it('keeps malformed comparison maps incomplete without losing the valid host record', () => {
  const document = site()
  const published = record(document)
  const loaded = parseSiteManifest(JSON.stringify({ ...document.manifest, published: { ...published, pages: ['invalid'], assets: { 'assets/hero.svg': 42 } } }))
  expect(loaded.published).toMatchObject({ service: 'fake', slug: 'fixture', styles: published.styles })
  expect(loaded.published?.pages).toBeUndefined()
  expect(loaded.published?.assets).toBeUndefined()
  expect(draftState(document, loaded.published)).toMatchObject({ incomplete: true, matchesLive: false, neverPublished: false })
})

it('tracks responsive sources, nested paths, CSS assets and URL queries by their real package paths', async () => {
  const document = site()
  document.pages = { 'about/index.html': `<picture><source srcset="/assets/hero.svg?v=1 1x, ../assets/large.svg 2x"><img SRC = '../assets/space%20name.svg#view'></picture><div style="background-image: url('../assets/inline.svg')"></div>` }
  document.styles = `body { background: url( '../assets/background.svg?version=2' ) }`
  const expected = ['background.svg', 'hero.svg', 'inline.svg', 'large.svg', 'space name.svg']
  expect(requiredAssetNames(document)).toEqual(expected)
  const read = vi.fn(async () => ({ base64: btoa(IMAGE_A) }))
  const fingerprints = await readAssetFingerprints(document, read)
  expect(Object.keys(fingerprints)).toEqual(expected.map(name => `assets/${name}`))
  expect(read.mock.calls).toHaveLength(expected.length)
})
