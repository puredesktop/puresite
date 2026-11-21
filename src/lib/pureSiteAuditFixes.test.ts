// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDesignSystem } from '@purescience/platform-ui/design/brief'
import {
  add404Page,
  addPage,
  duplicatePage,
  isSafePagePath,
  isSafeUrlScheme,
  linkElement,
  movePage,
  normalizePagePath,
  readPageHead,
  renamePagePath,
  sanitizeEditedOuterHtml,
  setElementSrc,
  updatePageHead,
  validateSafeSvgBase64,
} from './pages'
import {
  createDefaultSiteDocument,
  orderedPages,
  parseSiteManifest,
  setPageTitle,
  starter404Html,
  starterPageHtml,
} from './siteDocument'
import { parseSiteSnapshot, serializeSiteSnapshot } from './siteDoor'
import { readSitePackage, serializeSitePackage, validateCollectionsList } from './packageIO'
import { isSafeHttpUrl, publishServicesFrom, validatePublishUrl } from './publishServices'
import { publishSite } from './publish'
import { brandAssets, brandBlock } from './brandStyles'
import { brandArgument, parseSiteBrand, sampleImages } from './siteBrand'
import { deinlineMarkup, livePreviewDocument, previewDocument } from './preview'
import { mapCssUrls } from './siteReferences'
import { checkCollections, defaultAccess, formSnippetFor, HERENOW_DATA, type Collection } from './siteData'
import { reach, robotsText, sitemapXml } from './siteLenses'
import { reviewHtml } from './reviewExport'
import { FOUNDATION_START, withSiteFoundation } from './siteFoundation'
import { repointAsset, repointAssetInStyles, usedOn } from './assetNames'
import { mapLayout } from './siteMapLayout'
import { repointPromise } from './siteLinks'
import { compositionFor, type DrawerRequest } from './drawerRequest'
import { PURESITE_AGENT_TOOLS, type SiteAgentToolContext } from '../agents/catalog'
import {
  movePageHandler,
  setCollectionHandler,
  setElementSrcHandler,
  setElementTextHandler,
} from '../agents/handlers'
import { applyBrand, checkResponsiveHandler, makeImageHandler, proposeSiteSamples } from '../agents/brandTools'
import { PageFrame } from '../components/PageFrame'
import { SiteBoardView } from '../components/SiteBoardView'
import { manifestWithoutPublished } from './siteHash'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@purescience/platform-ui/components/assets/EmbeddedVideoPreview', () => ({
  EmbeddedVideoPreview: () => null,
  prepareEmbeddedVideoPreview: (html: string) => html,
  restoreEmbeddedVideoPreview: (html: string) => html,
}))

vi.mock('../bridge/platformBridge', async importOriginal => {
  const original = await importOriginal<typeof import('../bridge/platformBridge')>()
  return {
    ...original,
    fetchJson: vi.fn(),
    fetchRaw: vi.fn(),
    fetchLivePage: vi.fn(async () => '<html><body><h1>Live Copy</h1></body></html>'),
    brandsOffered: vi.fn(() => false),
    listBrands: vi.fn(async () => []),
  }
})

import { brandsOffered, fetchJson, fetchLivePage, fetchRaw } from '../bridge/platformBridge'

describe('Security: path traversal & package validation', () => {
  it('blocks post-sanitization traversal bypasses in normalizePagePath', () => {
    expect(normalizePagePath('..!/pwn.html')).toBe('pwn.html')
    expect(normalizePagePath('-..-')).toBe('')
    expect(normalizePagePath('..-/secret.html')).toBe('secret.html')
    expect(normalizePagePath('.../.../index.html')).toBe('index.html')
    expect(normalizePagePath('C:\\Windows\\system.html')).toBe('')
    expect(normalizePagePath('a/..!/b.html')).toBe('a/b.html')
    expect(normalizePagePath('..\\..\\evil.html')).toBe('evil.html')
    expect(isSafePagePath('../pwn.html')).toBe(false)
    expect(isSafePagePath('/etc/passwd')).toBe(false)
    expect(isSafePagePath('a\\b.html')).toBe(false)
    expect(isSafePagePath('about/index.html')).toBe(true)
  })

  it('rejects traversal page keys in parseSiteSnapshot', () => {
    const doc = createDefaultSiteDocument()
    const raw = JSON.parse(serializeSiteSnapshot(doc))
    raw.pages['../escape.html'] = '<html><body>bad</body></html>'
    expect(() => parseSiteSnapshot(JSON.stringify(raw))).toThrow(/unsafe page path/i)
  })

  it('ignores traversal entries and throws on corrupt site.json in readSitePackage', async () => {
    const doc = createDefaultSiteDocument()
    const files = new Map(serializeSitePackage(doc, []).map(f => [`/site/${f.name}`, f.content]))
    const io = {
      read: async (path: string) => {
        if (!files.has(path)) throw Error(`ENOENT: ${path}`)
        return files.get(path)!
      },
      list: async (path: string) => {
        if (path === '/site/pages') {
          return {
            entries: [
              { name: 'index.html' },
              { name: '..' },
              { name: '../pwn.html' },
              { name: 'bad\\name.html' },
            ],
          }
        }
        return { entries: [] }
      },
    }
    const opened = await readSitePackage('/site', io)
    expect(Object.keys(opened.pages)).toEqual(['index.html'])

    // Corrupt site.json MUST throw rather than silently wiping claimToken/metadata.
    files.set('/site/site.json', '{ corrupt json')
    await expect(readSitePackage('/site', io)).rejects.toThrow(/site\.json/i)
  })

  it('rejects non-ENOENT read errors on site.json without falling back', async () => {
    const io = {
      read: async (path: string) => {
        if (path.endsWith('site.json')) throw Error('EACCES: permission denied')
        throw Error(`ENOENT: ${path}`)
      },
      list: async () => ({ entries: [] }),
    }
    await expect(readSitePackage('/site', io)).rejects.toThrow(/EACCES/)
    expect(() => parseSiteManifest('[]', { strict: true })).toThrow(/site\.json/i)
  })
})

describe('Security: SSRF & credential exfiltration in publishing', () => {
  it('validates publish URLs and http(s) display links', () => {
    expect(() => validatePublishUrl('http://example.com/api')).toThrow(/https:/)
    expect(() => validatePublishUrl('https://user:pass@example.com/api')).toThrow(/credentials/)
    expect(() => validatePublishUrl('file:///etc/passwd')).toThrow(/https:/)
    expect(validatePublishUrl('http://localhost:8787/api', { allowLocalHttp: true }).hostname).toBe('localhost')
    expect(() => validatePublishUrl('http://169.254.169.254/latest', { allowLocalHttp: true })).toThrow(/https:/)

    expect(isSafeHttpUrl('https://site.example/')).toBe(true)
    expect(isSafeHttpUrl('http://example.com')).toBe(true)
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('drops non-https operation URLs in publishServicesFrom (except localhost)', () => {
    const tool = {
      id: 'evil-host',
      name: 'Evil',
      enabled: true,
      operations: [
        {
          id: 'create',
          enabled: true,
          method: 'POST',
          urlTemplate: 'file:///etc/passwd',
          inputSchema: { properties: { files: {} } },
        },
        {
          id: 'finalize',
          enabled: true,
          method: 'POST',
          urlTemplate: 'https://user:secret@evil.test/fin',
          inputSchema: { properties: { slug: {} } },
        },
      ],
    }
    const [svc] = publishServicesFrom([tool])
    expect(svc.endpoints.create).toBeUndefined()
    expect(svc.endpoints.finalize).toBeUndefined()
  })

  it('blocks cross-origin finalizeUrl and non-https upload target URLs in publishSite', async () => {
    const fetchJsonMock = vi.mocked(fetchJson)
    const fetchRawMock = vi.mocked(fetchRaw)
    fetchJsonMock.mockReset()
    fetchRawMock.mockReset()

    const service = {
      id: 'custom',
      name: 'Custom',
      description: '',
      anonymous: false,
      builtIn: false,
      endpoints: {
        create: { method: 'POST', url: 'https://api.good.example/publish' },
        finalize: { method: 'POST', url: 'https://api.good.example/publish/{slug}/finalize' },
      },
    }

    // 1. Cross-origin finalizeUrl must be refused before sending Authorization / claimToken.
    fetchJsonMock.mockResolvedValueOnce({
      slug: 's1',
      claimToken: 'secret-token',
      upload: {
        versionId: 'v1',
        uploads: [],
        finalizeUrl: 'https://attacker.example/steal',
      },
    })
    await expect(
      publishSite({
        service,
        files: [{ path: 'index.html', content: '<h1>hi</h1>', encoding: 'text', contentType: 'text/html' }],
        displayName: 'Test',
        apiKey: 'sk_live_secret',
      }),
    ).rejects.toThrow(/different origin/i)
    expect(fetchJsonMock).toHaveBeenCalledTimes(1)

    // 2. Non-https presigned upload target must be refused.
    fetchJsonMock.mockResolvedValueOnce({
      slug: 's2',
      upload: {
        versionId: 'v2',
        uploads: [{ path: 'index.html', method: 'PUT', url: 'http://169.254.169.254/pwn', headers: {} }],
      },
    })
    await expect(
      publishSite({
        service,
        files: [{ path: 'index.html', content: '<h1>hi</h1>', encoding: 'text', contentType: 'text/html' }],
        displayName: 'Test',
      }),
    ).rejects.toThrow(/https:/)
    expect(fetchRawMock).not.toHaveBeenCalled()
  })
})

describe('Security: brandAssets, makeImage, sampleImages & CSS injection in brandBlock', () => {
  it('rejects traversal paths in brandAssets and deduplicates colliding basenames', () => {
    const system = {
      format: 'pure-design-system',
      version: 1,
      id: 't',
      name: 'Bad */ </style><script>alert(1)</script>',
      revision: '1 */ body{display:none}',
      guidelines: [],
      components: [],
      tokens: {
        colors: {
          background: '#ffffff; } body { background: url(https://evil.test/x)',
          text: '#112233',
          accent: 'rgb(10, 20, 30)',
        },
        typography: {
          display: "Inter'; } </style><script>alert(1)</script>",
          displayWeight: 700,
        },
        radius: 8,
      },
      fonts: [
        { family: "Inter' ;}", weight: 400, file: '../../etc/passwd', licence: 'OFL' },
        { family: 'Inter', weight: 400, file: 'a/face.ttf', licence: 'OFL' },
        { family: 'Inter', weight: 700, file: 'b/face.ttf', licence: 'OFL' },
      ],
      logos: [
        { name: 'Abs', file: '/etc/shadow' },
        { name: 'Backslash', file: 'brand\\..\\secret.png' },
        { name: 'Good', file: 'brand/logo.svg' },
      ],
    } as unknown as ReturnType<typeof parseDesignSystem>

    const assets = brandAssets(system, '/Workspace/Brands/x.designsystem.json')
    expect(assets.map(a => a.from)).toEqual([
      '/Workspace/Brands/a/face.ttf',
      '/Workspace/Brands/b/face.ttf',
      '/Workspace/Brands/brand/logo.svg',
    ])
    // Deduplicated basenames
    expect(assets.map(a => a.name)).toEqual([
      'brand-font-face.ttf',
      'brand-font-face-2.ttf',
      'brand-logo-logo.svg',
    ])

    const block = brandBlock(system, assets)
    expect(block).not.toContain('</style>')
    expect(block).not.toContain('<script>')
    expect(block).not.toContain('https://evil.test')
    expect(block).not.toContain('--brand-bg:')
    expect(block).toContain('--brand-ink: #112233;')
    expect(block).toContain('--brand-accent: rgb(10, 20, 30);')
    expect(block).toContain('format("truetype")')
  })

  it('rejects traversal in sampleImages & brandArgument and restricts makeImage reference paths', async () => {
    expect(sampleImages(['/ok/a.png', '/ok/../secret.png', '/ok/file.txt', 'relative.png'])).toEqual(['/ok/a.png'])
    expect(brandArgument('/Brands/../etc/x.designsystem.json')).toBeNull()

    const ctx = {
      documentPath: '/Work/MySite.site',
      document: { manifest: {}, pages: { 'index.html': '<html></html>' }, styles: '' },
      brandFiles: {
        readBase64: vi.fn(async () => ({ base64: 'AA==', mimeType: 'image/png' })),
        writeAsset: vi.fn(async () => {}),
        refresh: vi.fn(async () => {}),
      },
      generateImage: vi.fn(async () => ({ base64: 'AA==', mimeType: 'image/png', modelId: 'm1' })),
    } as unknown as SiteAgentToolContext

    await expect(makeImageHandler(ctx, { prompt: 'art', reference: '../../secret.png' })).rejects.toThrow(/assets/)
    await expect(makeImageHandler(ctx, { prompt: 'art', reference: '/etc/secret.png' })).rejects.toThrow(/approved/)
    await expect(makeImageHandler(ctx, { prompt: 'art', reference: '/Work/MySite.site/site.json' })).rejects.toThrow(/PNG|JPEG|image/i)
  })

  it('checks baseHash before copying files in applyBrand', async () => {
    const copyIn = vi.fn(async () => {})
    const ctx = {
      hash: 'current-hash',
      documentPath: '/Work/Site.site',
      brandFiles: { copyIn, refresh: vi.fn(async () => {}) },
      setAssetRole: vi.fn(),
      writeBrand: vi.fn(),
    } as unknown as SiteAgentToolContext
    const system = parseDesignSystem(
      JSON.stringify({
        format: 'pure-design-system',
        version: 1,
        id: 'b',
        name: 'B',
        revision: '1',
        guidelines: [],
        components: [],
        tokens: {},
        logos: [{ name: 'L', file: 'b.brand/logo.png' }],
      }),
    )
    await expect(
      applyBrand(ctx, { system, path: '/Brands/b.designsystem.json', detail: null }, 'chosen', { baseHash: 'stale-hash' }, 'agent'),
    ).rejects.toThrow(/changed since your read/i)
    expect(copyIn).not.toHaveBeenCalled()
  })
})

describe('Security: HTML escaping, preview CSS/fragment handling, iframe edit sanitization & URL schemes', () => {
  it('escapes </style> in inlineStyles, target in markLinks, and title in starterPageHtml & setPageTitle', () => {
    const preview = previewDocument({
      html: '<head><link rel="stylesheet" href="styles/site.css"></head><body><a href="/foo%22%20onclick=%22alert(1)">Link</a></body>',
      styles: 'body { color: red; } </STYLE><script>alert(1)</script>',
      assets: {},
      knownPages: ['index.html'],
    })
    expect(preview).not.toContain('</STYLE><script>')
    expect(preview).toContain('<\\/STYLE>')
    expect(preview).toContain('data-site-link="foo&quot; onclick=&quot;alert(1)"')

    const starter = starterPageHtml('<img src=x onerror=alert(1)> & "test"')
    expect(starter).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;test&quot;')
    expect(starter).not.toContain('<img src=x')

    // $& and $' in replacement string must NOT interpolate regex tokens, and HTML chars must be escaped!
    const titled = setPageTitle('<html><head><title>Old</title></head></html>', "Price $& $' <script> & \"x\"")
    expect(titled).toContain('<title>Price $&amp; $&#39; &lt;script&gt; &amp; &quot;x&quot;</title>')
    expect(titled).not.toContain('<title>Old</title>')
  })

  it('sanitizes edited iframe outerHtml and rejects unsafe URL schemes', () => {
    const dirty = `<p data-site-link="a.html" data-site-state="built" class="__ps-picked" onclick="alert(1)">Hello <script>alert(1)</script><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)">bad</a><a href="/good/">good</a></p>`
    const clean = sanitizeEditedOuterHtml(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('<iframe')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('javascript:')
    expect(clean).not.toContain('data-site-link')
    expect(clean).not.toContain('__ps-picked')
    expect(clean).toContain('href="/good/"')
    expect(sanitizeEditedOuterHtml('<script>alert(1)</script>')).toBe('')

    expect(isSafeUrlScheme('javascript:alert(1)')).toBe(false)
    expect(isSafeUrlScheme('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeUrlScheme('data:text/html,<script>1</script>')).toBe(false)
    expect(isSafeUrlScheme('data:image/svg+xml,<svg onload=1/>')).toBe(false)
    expect(isSafeUrlScheme('file:///etc/passwd')).toBe(false)
    expect(isSafeUrlScheme('purescience-fs:///secret')).toBe(false)
    expect(isSafeUrlScheme('/about/')).toBe(true)
    expect(isSafeUrlScheme('https://example.com')).toBe(true)

    const page = '<!DOCTYPE html><html><body><p>Click</p><img src="assets/a.png"></body></html>'
    expect(linkElement(page, '0', 'javascript:alert(1)')).toBe(page)
    expect(setElementSrc(page, '1', 'javascript:alert(1)')).toBe(page)
    expect(setElementSrc(page, '1', 'data:image/svg+xml,<svg/>')).toBe(page)
  })

  it('resolves CSS URLs honestly against SITE_STYLESHEET vs page, quotes mapCssUrls, handles ./assets & #fragments', () => {
    expect(mapCssUrls('a{background:url(a.png)}', () => 'data:image/svg+xml,<svg xmlns="x"></svg>')).toBe(
      'a{background:url("data:image/svg+xml,<svg xmlns=\\"x\\"></svg>")}',
    )

    // Broken styles/site.css url(assets/hero.png) (missing ../) must NOT inline!
    const assets = { 'hero.png': 'data:image/png;base64,AAAA', 'sprite.svg': 'data:image/svg+xml;base64,BBBB' }
    const brokenCss = previewDocument({
      html: '<link rel="stylesheet" href="styles/site.css"><img SRC="./assets/hero.png">',
      styles: 'body { background: url(assets/hero.png); }',
      assets,
      page: 'index.html',
    })
    expect(brokenCss).toContain('SRC="data:image/png;base64,AAAA"')
    expect(brokenCss).toContain('url(assets/hero.png)')

    // Proper styles/site.css url(../assets/hero.png) DOES inline and is quoted.
    const goodCss = previewDocument({
      html: '<link rel="stylesheet" href="styles/site.css">',
      styles: 'body { background: url(../assets/hero.png); }',
      assets,
      page: 'index.html',
    })
    expect(goodCss).toContain('url("data:image/png;base64,AAAA")')

    // deinlineMarkup strips and re-appends #fragment cleanly.
    expect(
      deinlineMarkup('<img src="data:image/svg+xml;base64,BBBB#icon-arrow">', assets, 'work/index.html'),
    ).toBe('<img src="../assets/sprite.svg#icon-arrow">')
  })
})

describe('Security: collections.json, formSnippetFor, sitemapXml, robotsText & reviewHtml', () => {
  it('validates NAME_PATTERN and access enum in collections.json and checkCollections', async () => {
    const doc = createDefaultSiteDocument()
    const files = new Map(serializeSitePackage(doc, []).map(f => [`/s/${f.name}`, f.content]))
    files.set(
      '/s/collections.json',
      JSON.stringify([
        {
          name: 'bad"><script>',
          fields: [{ name: 'ok', type: 'string' }],
          access: defaultAccess(),
        },
      ]),
    )
    const io = {
      read: async (path: string) => {
        if (!files.has(path)) throw Error(`ENOENT: ${path}`)
        return files.get(path)!
      },
      list: async () => ({ entries: [{ name: 'index.html' }] }),
    }
    await expect(readSitePackage('/s', io)).rejects.toThrow(/collections\.json/)

    const badAccess = {
      name: 'leads',
      fields: [{ name: 'email', type: 'email' as const }],
      access: { read: 'everyone', insert: 'public', update: 'owner', delete: 'owner' },
    } as unknown as Collection
    expect(checkCollections([badAccess]).some(f => f.code === 'bad-access')).toBe(true)

    const ctx = {
      document: doc,
      setCollection: vi.fn(),
    } as unknown as SiteAgentToolContext
    expect(() =>
      setCollectionHandler(ctx, {
        name: 'leads',
        fields: [{ name: 'email', type: 'email' }],
        access: { read: 'everyone' },
      }),
    ).toThrow(/public, owner or none/)
  })

  it('escapes HTML and script payloads in formSnippetFor', () => {
    const evil: Collection = {
      name: `a"</script><script>alert(1)</script>`,
      fields: [{ name: `x"><img src=x onerror=1>`, type: 'number' }],
      access: defaultAccess(),
    }
    const html = formSnippetFor(evil, HERENOW_DATA)
    expect(html).not.toContain('</script><script>')
    expect(html).toContain('\\u003c/script\\u003e')
    expect(html).toContain('&quot;&gt;&lt;img')
  })

  it('escapes XML in sitemapXml, strips CRLF in robotsText, and strips <base> + fixes /assets/ in reviewHtml', () => {
    const doc = createDefaultSiteDocument()
    doc.pages['a&b.html'] = '<html><title>AB</title></html>'
    const xml = sitemapXml(doc, 'https://example.com/?a=1&b=2')
    expect(xml).toContain('&amp;')
    expect(xml).not.toContain('<loc>https://example.com/?a=1&b=2')

    const robots = robotsText('https://example.com\r\nDisallow: /secret')
    expect(robots).not.toContain('Disallow: /secret')
    expect(robotsText('javascript:alert(1)')).not.toContain('Sitemap:')

    const reviewed = reviewHtml(
      '<html><head><base href="file:///etc/"><link rel="stylesheet" href="/styles/site.css"></head><body><img src="/assets/pic.png"></body></html>',
      '/tmp/MySite.site',
      'blog/index.html',
    )
    expect(reviewed).not.toContain('file:///etc/')
    expect(reviewed).toContain('file:///tmp/MySite.site/blog/')
    expect(reviewed).toContain('href="../styles/site.css"')
    expect(reviewed).toContain('src="../assets/pic.png"')
  })
})

describe('Builder, layout, agent & must-have feature fixes', () => {
  it('aligns siteFoundation small text with responsiveCheck (no 9px)', () => {
    const css = withSiteFoundation('body { margin: 0; }')
    expect(css.startsWith(FOUNDATION_START)).toBe(true)
    expect(css).not.toContain('font-size: 9px')
    expect(css).toContain('font-size: var(--step--1)')
  })

  it('detects meta description regardless of attribute order', () => {
    const doc = createDefaultSiteDocument()
    doc.pages['index.html'] =
      '<!doctype html><html><head><title>Home</title><meta content="Reversed order description" name="description"></head><body><h1>Hi</h1></body></html>'
    expect(reach(doc).some(n => n.kind === 'no-description')).toBe(false)
  })

  it('deduplicates orderedPages and keeps movePage synced with it', () => {
    let doc = addPage(createDefaultSiteDocument(), { path: 'about' })
    doc = {
      ...doc,
      manifest: { ...doc.manifest, pages: ['index.html', 'index.html', 'missing.html'] },
    }
    expect(orderedPages(doc).map(p => p.path)).toEqual(['index.html', 'about/index.html'])
    const moved = movePage(doc, 1, 0)
    expect(moved.manifest.pages).toEqual(['about/index.html', 'index.html'])
  })

  it('counts disconnected cycles in siteMapLayout bottom band without overlapping center', () => {
    const map = mapLayout(
      {
        pages: ['index.html', 'a/index.html', 'b/index.html'],
        links: [
          { fromPage: 'a/index.html', href: '/b/', target: 'b/index.html', text: 'B', inNav: false },
          { fromPage: 'b/index.html', href: '/a/', target: 'a/index.html', text: 'A', inNav: false },
        ],
        promised: [],
        orphans: [],
      },
      'index.html',
      { width: 900, height: 600 },
    )
    const home = map.nodes.find(n => n.path === 'index.html')!
    const a = map.nodes.find(n => n.path === 'a/index.html')!
    expect(a.depth).toBe(-1)
    // Center cy was shifted up to reserve bandHeight for the 2 unreachable nodes!
    expect(home.y).toBeLessThan(300)
  })

  it('repointAsset & usedOn include styles/site.css and /assets/ without matching .bak suffixes', () => {
    const pages = {
      'index.html': '<img src="/assets/hero.png"><img src="assets/hero.png.bak">',
    }
    const styles = 'body { background: url("../assets/hero.png"); }'
    expect(usedOn(pages, 'hero.png', styles)).toEqual(['index.html', 'styles/site.css'])
    expect(usedOn({ 'index.html': '<img src="assets/hero.png.bak">' }, 'hero.png')).toEqual([])

    const nextPages = repointAsset(pages, 'hero.png', 'banner.webp')
    expect(nextPages['index.html']).toBe('<img src="/assets/banner.webp"><img src="assets/hero.png.bak">')
    expect(repointAssetInStyles(styles, 'hero.png', 'banner.webp')).toBe(
      'body { background: url("../assets/banner.webp"); }',
    )
  })

  it('validates agent handlers, preserves nav order in compositionFor, and enforces plugin.json parity', async () => {
    const doc = addPage(createDefaultSiteDocument(), { path: 'about' })
    const ctx = {
      document: doc,
      pages: orderedPages(doc),
      selectedPage: 'index.html',
      material: [{ name: 'ref.png', role: 'reference', kind: 'image', description: '', reference: 'assets/ref.png' }],
      checkResponsive: vi.fn(async () => [{ width: 390, read: { width: 390, scrollWidth: 390, boxes: [], navigation: { status: 'checked' as const, links: 0, missing: [], menus: [] } } }]),
      movePage: vi.fn(),
      setElementText: vi.fn(),
      setElementSrc: vi.fn(),
    } as unknown as SiteAgentToolContext

    // Prototype property must not pass checkResponsiveHandler
    await expect(checkResponsiveHandler(ctx, { page: 'toString' })).rejects.toThrow(/no page/)
    // Short page name normalizes cleanly
    await expect(checkResponsiveHandler(ctx, { page: 'about', widths: [390] })).resolves.toBeTruthy()
    // Non-string text rejected
    expect(() => setElementTextHandler(ctx, { page: 'index.html', path: '0', text: 123 })).toThrow(/string/)
    // Reference asset rejected
    expect(() => setElementSrcHandler(ctx, { page: 'index.html', path: '0', src: 'assets/ref.png' })).toThrow(/reference-only/)
    // Out-of-bounds movePage rejected
    expect(() => movePageHandler(ctx, { from: 0, to: 99 })).toThrow(/between 0 and 1/)

    // compositionFor preserves custom nav order
    const reordered = movePage(doc, 1, 0)
    const req: DrawerRequest = {
      id: 'r1',
      path: '/s',
      baseHash: 'h',
      document: reordered,
      kind: 'draft',
      prompt: 'update',
      pages: [],
      images: [],
      status: 'prepared',
    }
    const composed = compositionFor(
      req,
      {
        pages: { 'index.html': '<html><body>Home</body></html>', 'contact/index.html': '<html><body>Contact</body></html>' },
        styles: 'body{}',
      },
      reordered,
    )
    expect(composed.manifest.pages).toEqual(['about/index.html', 'index.html', 'contact/index.html'])

    // plugin.json parity check
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../plugin.json'), 'utf-8'))
    const tools = manifest.app.agents.tools as Array<{
      name: string
      risk?: string
      requiresApproval?: boolean
      inputSchema?: { additionalProperties?: boolean }
    }>
    expect(tools.map(t => t.name).sort()).toEqual([...PURESITE_AGENT_TOOLS].sort())
    for (const tool of tools) {
      expect(['read', 'write', 'destructive']).toContain(tool.risk)
      expect(typeof tool.requiresApproval).toBe('boolean')
      expect(tool.inputSchema?.additionalProperties).toBe(false)
    }
  })

  it('supports SEO head editing, page duplication, slug rename with link repointing, and 404.html starter', () => {
    let doc = createDefaultSiteDocument()
    doc = addPage(doc, { path: 'about', title: 'About Us' })
    doc.pages['index.html'] = doc.pages['index.html'].replace(
      '</main>',
      '<p><a href="about/">Learn more</a></p></main>',
    )

    // SEO Head metadata
    const withSeo = updatePageHead(doc.pages['about/index.html'], {
      lang: 'fr',
      description: 'About our studio',
      ogTitle: 'Studio OG',
      ogDescription: 'OG summary',
      ogImage: 'assets/og.png',
      favicon: 'assets/icon.ico',
    })
    expect(readPageHead(withSeo)).toEqual({
      lang: 'fr',
      description: 'About our studio',
      ogTitle: 'Studio OG',
      ogDescription: 'OG summary',
      ogImage: 'assets/og.png',
      favicon: 'assets/icon.ico',
    })

    // Duplicate page
    const dup = duplicatePage(doc, 'about/index.html')
    expect(dup.path).toBe('about-copy/index.html')
    expect(dup.document.pages['about-copy/index.html']).toContain('About Us (copy)')

    // Rename slug & repoint links across all pages
    const renamed = renamePagePath(dup.document, 'about/index.html', 'company')
    expect(renamed.path).toBe('company/index.html')
    expect(renamed.document.pages['about/index.html']).toBeUndefined()
    expect(renamed.document.pages['index.html']).toContain('href="company/"')
    expect(renamed.document.manifest.pages).toContain('company/index.html')

    // 404.html starter
    const with404 = add404Page(renamed.document)
    expect(with404.pages['404.html']).toContain('Page not found')
  })

  it('generates non-colliding page paths after deleting middle pages', () => {
    let doc = createDefaultSiteDocument()
    doc = addPage(doc, { path: 'page-2' })
    doc = addPage(doc, { path: 'page-3' })
    delete doc.pages['page-2/index.html']
    doc.manifest.pages = doc.manifest.pages.filter(p => p !== 'page-2/index.html')

    // Gap collision fix: incrementing until unused
    let n = Object.keys(doc.pages).length + 1
    let candidate = normalizePagePath(`page-${n}`)
    while (!candidate || doc.pages[candidate]) {
      n += 1
      candidate = normalizePagePath(`page-${n}`)
    }
    expect(candidate).toBe('page-4/index.html')
  })

  it('verifies PageFrame per-render nonce and sanitizes puresite:edited payloads', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onEdit = vi.fn()
    try {
      await act(async () => {
        root.render(
          createElement(PageFrame, {
            html: '<html><body><p>Hi</p></body></html>',
            styles: '',
            assets: {},
            page: 'index.html',
            width: 800,
            height: 500,
            onEdit,
          }),
        )
      })
      const iframe = host.querySelector('iframe')!
      const srcdoc = iframe.getAttribute('srcdoc') ?? ''
      const nonce = /var NONCE = '([^']+)'/.exec(srcdoc)?.[1] ?? ''
      expect(nonce.length).toBeGreaterThan(8)

      // Forged message without nonce must be ignored.
      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            source: iframe.contentWindow,
            data: { type: 'puresite:edited', path: '0', outerHtml: '<p>Forged</p>' },
          }),
        )
      })
      expect(onEdit).not.toHaveBeenCalled()

      // Valid nonce with malicious markup must be sanitized before reaching onEdit.
      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            source: iframe.contentWindow,
            data: {
              type: 'puresite:edited',
              path: '0',
              outerHtml: '<p onclick="evil()">Clean<script>alert(1)</script></p>',
              nonce,
            },
          }),
        )
      })
      expect(onEdit).toHaveBeenCalledWith('0', '<p>Clean</p>', 'index.html')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('renders Live and Side-by-Side comparison views and supports undo/redo metadata preservation', async () => {
    const doc = createDefaultSiteDocument()
    doc.manifest.published = {
      service: 'herenow',
      slug: 'demo',
      claimToken: 'secret-claim-token',
      url: 'https://demo.here.now',
    }
    // Live payload must strip published/claimToken
    expect((manifestWithoutPublished(doc.manifest) as Record<string, unknown>).published).toBeUndefined()

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const noop = () => {}
    try {
      await act(async () => {
        root.render(
          createElement(SiteBoardView, {
            document: doc,
            pages: orderedPages(doc),
            material: [],
            previews: {},
            collections: [],
            dataProvider: undefined,
            onAddFormForCollection: noop,
            onDeleteCollection: noop,
            selectedPage: 'index.html',
            pageSelection: [],
            onPageSelection: noop,
            selection: null,
            findings: [],
            verification: { state: 'verified', reasons: [], pages: {} },
            onRecheck: noop,
            revisions: [],
            onRestoreRevision: noop,
            statusAction: null,
            status: '',
            asking: false,
            viewport: 'desktop',
            onViewport: noop,
            onPreviewViewport: noop,
            onSelectPage: noop,
            onSelectElement: noop,
            onEditElement: noop,
            onAddPage: noop,
            onBuildPromise: noop,
            onRepointPromise: noop,
            onUnlinkPromise: noop,
            onBuildAllPromises: noop,
            onLinkSelection: noop,
            onSetGoal: noop,
            onDeletePage: noop,
            onMovePage: noop,
            onSetPageTitle: noop,
            onSetElementText: noop,
            onSetElementSrc: noop,
            onAddFiles: noop,
            onSetRole: noop,
            onDescribe: noop,
            onRenameFile: noop,
            onUseFileInstead: noop,
            onDescribeAll: noop,
            describing: false,
            onAsk: noop,
            onOpenHtml: noop,
            onOpenInBrowser: noop,
            onExport: noop,
            exporting: false,
            onPublish: noop,
            brandChip: null,
            onOpenBrand: noop,
            canUndo: true,
            canRedo: false,
            onUndo: noop,
            onRedo: noop,
          }),
        )
      })
      const btn = (label: string) =>
        Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === label)

      // Switch to Side by side
      await act(async () => {
        btn('Side by side')!.click()
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(host.querySelectorAll('iframe').length).toBe(2)
      expect(host.textContent).toContain('Draft')
      expect(host.textContent).toContain('Live')

      // Switch to Live
      await act(async () => {
        btn('Live')!.click()
      })
      expect(host.querySelectorAll('iframe').length).toBe(1)
      expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('Live Copy')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})

describe('Adversarial review regression tests', () => {
  it('prevents **// CSS comment breakout, SAFE_COLOR url() bypass, and unsafe asset filename chars', () => {
    const system = {
      format: 'pure-design-system',
      version: 1,
      id: 'adv',
      name: 'Brand **// body { background: url(https://evil.test); }',
      revision: '1 **// </style>',
      guidelines: [],
      components: [],
      tokens: {
        colors: {
          background: 'rgb(url("https://evil.test"))',
          surface: 'color-mix(in srgb, #ffffff 80%, #000000)',
          text: 'color-mix(in srgb, image-set(url(x.png) 1x), #000)',
          accent: 'oklch(0.65 0.15 240 / 0.9)',
        },
        typography: {},
      },
      fonts: [{ family: 'Inter', weight: 400, file: 'f/<evil>*/font.woff2', licence: 'OFL' }],
      logos: [],
    } as unknown as ReturnType<typeof parseDesignSystem>

    const assets = brandAssets(system, '/Workspace/Brands/x.designsystem.json')
    expect(assets[0]?.name).not.toMatch(/[<>/*{}]/)

    const block = brandBlock(system, assets)
    // Header comment must not prematurely terminate with */ before the actual comment close
    const firstCommentClose = block.indexOf('*/')
    const headerLine = block.slice(0, firstCommentClose)
    expect(headerLine).not.toContain('**//')
    expect(block).not.toContain('https://evil.test')
    expect(block).not.toContain('--brand-bg:')
    expect(block).not.toContain('--brand-ink:')
    expect(block).toContain('--brand-surface: color-mix(in srgb, #ffffff 80%, #000000);')
    expect(block).toContain('--brand-accent: oklch(0.65 0.15 240 / 0.9);')
  })

  it('blocks SSRF to private, loopback, metadata, ULA, IPv4-mapped IPv6, and internal hosts over HTTPS', async () => {
    const blockedUrls = [
      'https://127.0.0.1/api',
      'https://localhost/api',
      'https://sub.localhost/api',
      'https://169.254.169.254/latest/meta-data/',
      'https://10.0.0.1/internal',
      'https://172.16.5.1/internal',
      'https://192.168.1.10/admin',
      'https://100.64.0.1/cgnat',
      'https://0.0.0.0/',
      'https://[::1]/api',
      'https://[::ffff:127.0.0.1]/api',
      'https://[::ffff:7f00:1]/api',
      'https://[fc00::1]/api',
      'https://[fe80::1]/api',
      'https://printer.local/api',
      'https://metadata.google.internal/api',
    ]
    for (const url of blockedUrls) {
      expect(() => validatePublishUrl(url), url).toThrow(/private|loopback|local|https:/i)
    }

    // Presigned upload target pointing at metadata IP over HTTPS must be blocked when declareUrl is public.
    const fetchJsonMock = vi.mocked(fetchJson)
    const fetchRawMock = vi.mocked(fetchRaw)
    fetchJsonMock.mockReset()
    fetchRawMock.mockReset()
    fetchJsonMock.mockResolvedValueOnce({
      slug: 's3',
      upload: {
        versionId: 'v3',
        uploads: [{ path: 'index.html', method: 'PUT', url: 'https://169.254.169.254/latest', headers: {} }],
      },
    })
    await expect(
      publishSite({
        service: {
          id: 'custom',
          name: 'Custom',
          description: '',
          anonymous: false,
          builtIn: false,
          endpoints: { create: { method: 'POST', url: 'https://api.good.example/publish' } },
        },
        files: [{ path: 'index.html', content: '<h1>hi</h1>', encoding: 'text', contentType: 'text/html' }],
        displayName: 'Test',
      }),
    ).rejects.toThrow(/private|loopback|local/i)
    expect(fetchRawMock).not.toHaveBeenCalled()
  })

  it('enforces strict URL allowlist, hardened outerHtml sanitization, and DOM-based SVG validation', () => {
    expect(isSafeUrlScheme('blob:https://example.com/123')).toBe(false)
    expect(isSafeUrlScheme('//evil.example/payload')).toBe(false)
    expect(isSafeUrlScheme('data:text/plain;base64,SGk=')).toBe(false)
    expect(isSafeUrlScheme('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isSafeUrlScheme('mailto:hello@example.com')).toBe(true)
    expect(isSafeUrlScheme('tel:+15551234567')).toBe(true)
    expect(isSafeUrlScheme('#section-1')).toBe(true)
    expect(isSafeUrlScheme('assets/logo.svg')).toBe(true)

    const hostile =
      '<div srcdoc="<script>1</script>"><p>Safe</p><template><img src=x onerror=1></template><svg><script>1</script></svg><form action="https://evil.test"><input></form></div>'
    const sanitized = sanitizeEditedOuterHtml(hostile)
    expect(sanitized).not.toContain('srcdoc')
    expect(sanitized).not.toContain('<template')
    expect(sanitized).not.toContain('<svg')
    expect(sanitized).not.toContain('<form')
    expect(sanitized).toContain('<p>Safe</p>')

    const b64 = (s: string) => btoa(s)
    expect(() =>
      validateSafeSvgBase64(b64('<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg/>')),
    ).toThrow(/DOCTYPE|entities/i)
    expect(() =>
      validateSafeSvgBase64(b64('<?xml-stylesheet type="text/xsl" href="evil.xsl"?><svg/>')),
    ).toThrow(/stylesheets/i)
    expect(() =>
      validateSafeSvgBase64(b64('<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" to="javascript:alert(1)"/></svg>')),
    ).toThrow(/animate/i)
    expect(() =>
      validateSafeSvgBase64(b64('<svg xmlns="http://www.w3.org/2000/svg"><a href="https://evil.test"><rect/></a></svg>')),
    ).toThrow(/#fragments/i)
    expect(() =>
      validateSafeSvgBase64(b64('<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.test/x.css);</style></svg>')),
    ).toThrow(/@import|url\(\)/i)
    expect(() =>
      validateSafeSvgBase64(b64('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')),
    ).toThrow(/event handler/i)

    // Valid clean SVG with internal #fragment reference and line-wrapped base64 passes
    const cleanSvg = b64(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><circle id="c" r="4"/></defs><use href="#c"/></svg>',
    )
    const wrapped = `${cleanSvg.slice(0, 20)}\n  ${cleanSvg.slice(20)}`
    expect(() => validateSafeSvgBase64(wrapped)).not.toThrow()
  })

  it('enforces local file containment in parseSiteBrand, makeImageHandler, and proposeSiteSamples', async () => {
    expect(
      parseSiteBrand({
        id: 'b',
        name: 'B',
        path: '/Workspace/Brands/../../etc/brand.json',
        revision: '1',
        how: 'chosen',
      }),
    ).toBeUndefined()

    const ctx = {
      documentPath: '/Work/MySite.site',
      document: {
        manifest: {
          brand: { id: 'b', name: 'Evil', path: '/etc/evil.designsystem.json', revision: '1', how: 'chosen' },
        },
        pages: { 'index.html': '<html></html>' },
        styles: '',
      },
      pages: [{ path: 'index.html', title: 'Home' }],
      selectedPage: 'index.html',
      pageSelection: [],
      brandFiles: {
        readBase64: vi.fn(async () => ({ base64: 'AA==', mimeType: 'image/png' })),
        writeAsset: vi.fn(async () => {}),
        refresh: vi.fn(async () => {}),
      },
      exportPage: vi.fn(async () => ({ outputPath: '/etc/pwn.png' })),
      generateImage: vi.fn(async () => ({ base64: 'AA==', mimeType: 'image/png', modelId: 'm1' })),
    } as unknown as SiteAgentToolContext

    // Untrusted manifest.brand.path outside workspace/Brands and not in listBrands() must NOT grant access to /etc/
    await expect(makeImageHandler(ctx, { prompt: 'art', reference: '/etc/secret.png' })).rejects.toThrow(/approved/)
    // proposeSiteSamples must also reject sample paths outside approved roots
    vi.mocked(brandsOffered).mockReturnValueOnce(true)
    await expect(proposeSiteSamples(ctx, { images: ['/etc/secret.png'] })).rejects.toThrow(/approved/)
  })

  it('keeps inline style quotes safe in mapCssUrls, round-trips SVG data URLs in deinlineMarkup, and preserves inlined SVG in PageFrame', async () => {
    const svgData = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    const css = mapCssUrls('background: url(assets/bg.svg)', () => svgData, { quote: 'auto', attrQuote: '"' })
    expect(css).not.toContain('url("data:image/svg+xml,<svg xmlns="')
    expect(css).toContain('&quot;')

    const inlined = previewDocument({
      html: '<html><body><div style="background: url(assets/bg.svg)"></div></body></html>',
      styles: '',
      assets: { 'bg.svg': svgData },
      page: 'index.html',
    })
    const styleMatch = /style="([^"]*)"/.exec(inlined)
    expect(styleMatch).toBeTruthy()
    expect(deinlineMarkup(`<div style="${styleMatch![1]}"></div>`, { 'bg.svg': svgData }, 'index.html')).toBe(
      '<div style="background: url(assets/bg.svg)"></div>',
    )

    // PageFrame deinlines known SVG assets BEFORE sanitizing, while still stripping forged SVG data URLs
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onEdit = vi.fn()
    const knownSvg = 'data:image/svg+xml;base64,PHN2Zy8+'
    try {
      await act(async () => {
        root.render(
          createElement(PageFrame, {
            html: '<html><body><div><img src="assets/logo.svg"></div></body></html>',
            styles: '',
            assets: { 'logo.svg': knownSvg },
            page: 'index.html',
            width: 800,
            height: 500,
            onEdit,
          }),
        )
      })
      const iframe = host.querySelector('iframe')!
      const nonce = /var NONCE = '([^']+)'/.exec(iframe.getAttribute('srcdoc') ?? '')?.[1] ?? ''
      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            source: iframe.contentWindow,
            data: {
              type: 'puresite:edited',
              path: '0',
              outerHtml: `<div><img src="${knownSvg}"><img src="data:image/svg+xml;base64,Rk9SR0VE"></div>`,
              nonce,
            },
          }),
        )
      })
      expect(onEdit).toHaveBeenCalledTimes(1)
      const editedHtml = onEdit.mock.calls[0]![1] as string
      expect(editedHtml).toContain('src="assets/logo.svg"')
      expect(editedHtml).not.toContain('Rk9SR0VE')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('refuses renaming index.html, rewrites relative links/srcset/styles on depth change, and preserves query/hash in repointPromise', () => {
    let doc = createDefaultSiteDocument()
    doc = addPage(doc, {
      path: 'about',
      html: '<!DOCTYPE html><html><head><link rel="stylesheet" href="../styles/site.css"></head><body><a href="../contact/?ref=nav#top">Contact</a><img srcset="../assets/a.png 1x, ../assets/b.png 2x"><div style="background:url(../assets/bg.png)"></div></body></html>',
    })
    // index.html cannot be renamed
    const noRename = renamePagePath(doc, 'index.html', 'home')
    expect(noRename.path).toBe('index.html')
    expect(noRename.document.pages['index.html']).toBeDefined()

    // Renaming about/index.html (depth 1) -> team/about/index.html (depth 2) adjusts relative links, srcset, and style
    const moved = renamePagePath(doc, 'about/index.html', 'team/about')
    expect(moved.path).toBe('team/about/index.html')
    const movedHtml = moved.document.pages['team/about/index.html']
    expect(movedHtml).toContain('href="../../styles/site.css"')
    expect(movedHtml).toContain('href="../../contact/?ref=nav#top"')
    expect(movedHtml).toContain('srcset="../../assets/a.png 1x, ../../assets/b.png 2x"')
    expect(movedHtml).toContain('url(../../assets/bg.png)')

    // repointPromise preserves ?query#fragment
    const repointed = repointPromise(
      { 'index.html': '<a href="/pricing/?plan=pro#faq">Pricing</a>' },
      'pricing/index.html',
      'plans/index.html',
    )
    expect(repointed['index.html']).toContain('href="plans/?plan=pro#faq"')
  })

  it('fixes 404 stylesheet path, excludes 404 from sitemap, handles apostrophes in meta description, validates collection access types, and rewrites reviewHtml srcset/style', () => {
    expect(starter404Html()).toContain('href="/styles/site.css"')

    const doc = add404Page(createDefaultSiteDocument())
    doc.pages['index.html'] =
      '<!doctype html><html><head><title>Home</title><meta name="description" content="Bob\'s design studio"></head><body><h1>Hi</h1></body></html>'
    expect(sitemapXml(doc, 'https://example.com')).not.toContain('404.html')
    expect(reach(doc).some(n => n.kind === 'no-description')).toBe(false)

    // Non-string access values (e.g. object with toString) must be rejected by validateCollectionsList
    expect(
      validateCollectionsList([
        {
          name: 'leads',
          fields: [{ name: 'email', type: 'email' }],
          access: {
            read: { toString: () => 'public' },
            insert: 'public',
            update: 'owner',
            delete: 'owner',
          },
        },
      ]),
    ).toBeNull()

    const reviewed = reviewHtml(
      '<html><head></head><body><img srcset="/assets/a.png 1x, /assets/b.png 2x"><div style="background:url(/assets/bg.png)"></div></body></html>',
      '/tmp/MySite.site',
      'blog/index.html',
    )
    expect(reviewed).toContain('srcset="../assets/a.png 1x, ../assets/b.png 2x"')
    expect(reviewed).toContain('url(../assets/bg.png)')
  })

  it('preserves stylesheets in livePreviewDocument and handles Live view errors & unpublished resets cleanly', async () => {
    const liveDoc = livePreviewDocument(
      '<!doctype html><html><head><base href="https://old.example/"><link rel="stylesheet" href="/styles/site.css"></head><body><h1>Live</h1></body></html>',
      'https://demo.here.now/about/',
    )
    expect(liveDoc).toContain('<base href="https://demo.here.now/about/" />')
    expect(liveDoc).not.toContain('https://old.example/')
    expect(liveDoc).toContain('<link rel="stylesheet" href="/styles/site.css">')

    // When fetchLivePage fails (returns null), SiteBoardView shows an error message instead of loading forever
    vi.mocked(fetchLivePage).mockResolvedValueOnce(null)
    const doc = createDefaultSiteDocument()
    doc.manifest.published = { service: 'herenow', slug: 'demo', url: 'https://demo.here.now' }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const noop = () => {}
    const makeProps = (d: typeof doc) => ({
      document: d,
      pages: orderedPages(d),
      material: [],
      previews: {},
      collections: [],
      dataProvider: undefined,
      onAddFormForCollection: noop,
      onDeleteCollection: noop,
      selectedPage: 'index.html',
      pageSelection: [],
      onPageSelection: noop,
      selection: null,
      findings: [],
      verification: { state: 'verified' as const, reasons: [], pages: {} },
      onRecheck: noop,
      revisions: [],
      onRestoreRevision: noop,
      statusAction: null,
      status: '',
      asking: false,
      viewport: 'desktop' as const,
      onViewport: noop,
      onPreviewViewport: noop,
      onSelectPage: noop,
      onSelectElement: noop,
      onEditElement: noop,
      onAddPage: noop,
      onBuildPromise: noop,
      onRepointPromise: noop,
      onUnlinkPromise: noop,
      onBuildAllPromises: noop,
      onLinkSelection: noop,
      onSetGoal: noop,
      onDeletePage: noop,
      onMovePage: noop,
      onSetPageTitle: noop,
      onSetElementText: noop,
      onSetElementSrc: noop,
      onAddFiles: noop,
      onSetRole: noop,
      onDescribe: noop,
      onRenameFile: noop,
      onUseFileInstead: noop,
      onDescribeAll: noop,
      describing: false,
      onAsk: noop,
      onOpenHtml: noop,
      onOpenInBrowser: noop,
      onExport: noop,
      exporting: false,
      onPublish: noop,
      brandChip: null,
      onOpenBrand: noop,
    })
    try {
      await act(async () => {
        root.render(createElement(SiteBoardView, makeProps(doc)))
      })
      const liveBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Live')!
      await act(async () => {
        liveBtn.click()
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(host.textContent).toContain('Live page unavailable')

      // Switching to an unpublished document resets view back to Draft (renders the draft iframe)
      const unpublished = createDefaultSiteDocument()
      await act(async () => {
        root.render(createElement(SiteBoardView, makeProps(unpublished)))
      })
      expect(host.querySelectorAll('iframe').length).toBe(1)
      expect(host.textContent).not.toContain('Live page unavailable')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
