// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { checkSite as runCheckSite } from '../lib/buildSite'
import { readDesignTokens } from '../lib/designTokens'
import type { MaterialItem } from '../lib/material'
import {
  addPage as addPageIn,
  deleteElement as deleteElementIn,
  deletePage as deletePageIn,
  insertElement as insertElementIn,
  movePage as movePageIn,
  readPageHead,
  setElementSrc as setElementSrcIn,
  setElementText as setElementTextIn,
  writePage as writePageIn,
} from '../lib/pages'
import { SECTION_STYLES_START } from '../lib/sectionLibrary'
import {
  createDefaultSiteDocument,
  orderedPages,
  setPageTitle as setPageTitleInHtml,
  type SiteDocument,
} from '../lib/siteDocument'
import { pageHashes as computePageHashes, siteHash } from '../lib/siteHash'
import { internalLinks } from '../lib/preview'
import type { SiteVerification } from '../lib/siteVerification'
import { PURESITE_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  EXPOSED_TOOL_NAMES,
  PURESITE_AGENT_TOOLS,
  PURESITE_ALL_ATOMIC_TOOL_NAMES,
  PURESITE_CORE_TOOL_NAMES,
  PURESITE_EXTENDED_TOOL_NAMES,
  PURESITE_FUNCTION_NAMES,
  type AgentBase,
  type AgentLanded,
  type SiteAgentToolContext,
} from './catalog'
import {
  buildPureSiteHandlers,
  PURESITE_OPERATIONS_REGISTRY,
} from './operationsRegistry'

const invoke = (shortName: string, args: Record<string, unknown> = {}) => ({
  toolCallId: `tc_${shortName}`,
  shortName,
  arguments: args,
})

function makeRichSiteDoc(): SiteDocument {
  let doc = createDefaultSiteDocument()
  doc.title = 'Apex Research Lab'
  doc.manifest.title = 'Apex Research Lab'
  doc.manifest.brief = 'Showcase Apex Research Lab publications and grant deadlines.'
  doc.manifest.goal = 'contact/index.html'
  doc.pages['index.html'] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Apex Research Lab</title>
    <meta name="description" content="Independent scientific research and open tools." />
    <link rel="stylesheet" href="styles/site.css" />
  </head>
  <body>
    <header class="site-header">
      <nav><a href="/">Home</a> <a href="/about/">About</a> <a href="/contact/">Contact</a> <a href="/grants/">Grants</a></nav>
    </header>
    <main>
      <h1>Apex Research Lab</h1>
      <p>Applications close 15 March 2027 for all visiting fellowships. Explore our <a href="/about/">lab overview</a> or reach out via <a href="/contact/">contact</a>.</p>
      <img src="assets/hero.png" />
    </main>
  </body>
</html>
`
  doc = addPageIn(doc, {
    path: 'about',
    title: 'About Apex',
    html: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>About Apex</title>
    <link rel="stylesheet" href="../styles/site.css" />
  </head>
  <body>
    <header class="site-header">
      <nav><a href="/">Home</a> <a href="/about/">About</a> <a href="/contact/">Contact</a></nav>
    </header>
    <main>
      <h1>About Apex</h1>
      <p>Fellowship applications close 30 April 2027. We publish open scientific software for climate and genomics labs.</p>
      <p><a href="/contact/">Get in touch with our team</a>.</p>
    </main>
  </body>
</html>
`,
  })
  doc = addPageIn(doc, {
    path: 'contact',
    title: 'Contact',
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Contact</title>
    <link rel="stylesheet" href="../styles/site.css" />
  </head>
  <body>
    <header class="site-header">
      <nav><a href="/">Home</a> <a href="/about/">About</a> <a href="/contact/">Contact</a></nav>
    </header>
    <main>
      <h1>Contact Us</h1>
      <p>Email our editorial office for collaboration enquiries or fellowship nominations.</p>
    </main>
  </body>
</html>
`,
  })
  return doc
}

interface FixtureOptions {
  doc?: SiteDocument
  documentPath?: string | null
  verification?: SiteVerification
  material?: MaterialItem[]
  responsiveClean?: boolean
}

function makeFixture(options: FixtureOptions = {}) {
  let doc: SiteDocument = options.doc ?? makeRichSiteDoc()
  let currentHash = siteHash(doc)
  let currentPageHashes = computePageHashes(doc)
  const verification: SiteVerification = options.verification ?? {
    state: 'verified',
    reasons: [],
    pages: {},
  }
  const material: MaterialItem[] = options.material ?? [
    {
      name: 'hero.png',
      reference: 'assets/hero.png',
      role: 'content',
      kind: 'image',
      description: 'Lab building exterior',
      bytes: 24_000,
    } as MaterialItem,
    {
      name: 'unused.png',
      reference: 'assets/unused.png',
      role: 'content',
      kind: 'image',
      description: '',
      bytes: 12_000,
    } as MaterialItem,
    {
      name: 'brand-ref.png',
      reference: 'assets/brand-ref.png',
      role: 'reference',
      kind: 'image',
      description: 'Reference poster',
      bytes: 40_000,
    } as MaterialItem,
  ]

  const commit = (nextDoc: SiteDocument, base?: AgentBase): AgentLanded => {
    if (base?.page && base.baseHash && currentPageHashes[base.page] !== base.baseHash) {
      throw new Error(
        `the page ${base.page} changed since your read (hash ${base.baseHash} → ${currentPageHashes[base.page]})`,
      )
    }
    if (!base?.page && base?.baseHash && currentHash !== base.baseHash) {
      throw new Error(
        `the site changed since your read (hash ${base.baseHash} → ${currentHash})`,
      )
    }
    const nextHash = siteHash(nextDoc)
    const changed = nextHash !== currentHash
    doc = nextDoc
    currentHash = nextHash
    currentPageHashes = computePageHashes(doc)
    return {
      hash: currentHash,
      pageHashes: { ...currentPageHashes },
      changed,
      warning: null,
      snapshot: null,
    }
  }

  const restoreRevision = vi.fn(async (file: string) => ({
    restored: {
      file,
      at: '2026-11-20T10:00:00.000Z',
      reason: 'agent',
      hash: 'h0',
      byteSize: 2048,
      textChars: 420,
    },
  }))

  const checkResponsive = vi.fn(async (_page: string, widths: number[]) =>
    widths.map(width => ({
      width,
      read: {
        width,
        scrollWidth: options.responsiveClean === false && width === 390 ? 440 : width,
        boxes: [
          {
            kind: 'h1' as const,
            label: 'h1',
            text: 'Apex Research Lab',
            lines: 1,
            fontSize: 32,
            align: 'left',
            letterSpacingEm: -0.02,
            left: 24,
            right: width - 24,
            top: 80,
            bottom: 120,
            width: width - 48,
            height: 40,
          },
        ],
        navigation: {
          status: 'checked' as const,
          links: 3,
          missing: [],
          menus: [],
        },
      },
    })),
  )

  const ctx: SiteAgentToolContext = {
    get document() {
      return doc
    },
    get hash() {
      return currentHash
    },
    get pageHashes() {
      return currentPageHashes
    },
    verification,
    revisions: [
      {
        file: '2026-11-20T10-00-00-000Z-agent.json',
        at: '2026-11-20T10:00:00.000Z',
        reason: 'agent',
        hash: 'h0',
        byteSize: 2048,
        textChars: 420,
      },
    ],
    documentPath: options.documentPath !== undefined ? options.documentPath : '/Work/Apex.site',
    get pages() {
      return orderedPages(doc)
    },
    material,
    selection: null,
    selectedPage: 'index.html',
    pageSelection: [],
    serviceId: 'herenow',

    exportPage: vi.fn(async input => ({
      outputPath: `/Work/Apex.site/reviews/${input.page ?? 'index.html'}.${input.format}`,
      artifactPaths: [`/Work/Apex.site/reviews/${input.page ?? 'index.html'}.${input.format}`],
    })),
    checkResponsive,
    prepareSite: vi.fn(async () => ({
      id: 'req-1',
      path: '/Work/Apex.site/.drawer/req-1.json',
      baseHash: currentHash,
      kind: 'draft',
      status: 'prepared',
      document: doc,
      images: [],
    })),
    cancelDrawerRequest: vi.fn(async args => ({ cancelled: true, ...args })),
    getDrawerRequest: vi.fn(async () => ({ id: 'req-1', baseHash: currentHash })),
    commitDrawerRequest: vi.fn(async args => ({ committed: true, ...args })),

    writePage: (page, html, base) => commit(writePageIn(doc, page, html), base),
    addPage: (input, base) => {
      const next = addPageIn(doc, input)
      const landed = commit(next, base)
      const createdPath =
        Object.keys(next.pages).find(p => !Object.hasOwn(doc.pages, p)) ??
        (input.path.endsWith('.html') ? input.path : `${input.path}/index.html`)
      return { ...landed, page: createdPath }
    },
    deletePage: (page, base) => commit(deletePageIn(doc, page), base),
    movePage: (from, to, base) => commit(movePageIn(doc, from, to), base),
    setPageTitle: (page, title, base) =>
      commit(writePageIn(doc, page, setPageTitleInHtml(doc.pages[page] ?? '', title)), base),
    setElementText: (page, path, text, base) =>
      commit(writePageIn(doc, page, setElementTextIn(doc.pages[page] ?? '', path, text)), base),
    setElementSrc: (page, path, src, base) =>
      commit(writePageIn(doc, page, setElementSrcIn(doc.pages[page] ?? '', path, src, page)), base),
    insertElement: (input, base) =>
      commit(
        writePageIn(
          doc,
          input.page,
          insertElementIn(doc.pages[input.page] ?? '', {
            markup: input.markup,
            beforePath: input.beforePath,
            afterPath: input.afterPath,
          }),
        ),
        base,
      ),
    deleteElement: (page, path, base) =>
      commit(writePageIn(doc, page, deleteElementIn(doc.pages[page] ?? '', path)), base),
    writeStyles: (css, base) => commit({ ...doc, styles: css }, base),
    writeBrand: (block, brand, base) =>
      commit(
        {
          ...doc,
          styles: `${block}\n${doc.styles}`,
          manifest: { ...doc.manifest, brand },
        },
        base,
      ),
    setAssetRole: vi.fn(),
    brandFiles: {
      readText: vi.fn(async () => '{}'),
      readBase64: vi.fn(async () => ({ base64: '', mimeType: 'image/png' })),
      copyIn: vi.fn(async () => {}),
      writeAsset: vi.fn(async () => {}),
      refresh: vi.fn(async () => {}),
    },
    generateImage: null,
    setCollection: (collection, base) =>
      commit(
        {
          ...doc,
          collections: [
            ...doc.collections.filter(c => c.name !== collection.name),
            collection,
          ],
        },
        base,
      ),
    deleteCollection: (name, base) =>
      commit(
        {
          ...doc,
          collections: doc.collections.filter(c => c.name !== name),
        },
        base,
      ),
    addFormForCollection: (_input, base) => commit(doc, base),
    restoreRevision,
    checkSite: () =>
      runCheckSite(
        doc,
        material.map(m => m.name),
        Object.fromEntries(
          Object.entries(doc.pages).map(([path, html]) => [path, internalLinks(html, path)]),
        ),
      ),
    saveSite: vi.fn(async () => '/Work/Apex.site'),
    buildSite: vi.fn(async () => ({
      files: [{ path: 'index.html', bytes: 512 }],
      pages: Object.keys(doc.pages).length,
      assets: ['hero.png'],
      unusedAssets: ['unused.png'],
      totalBytes: 24_512,
      buildPath: '/Work/Apex.site/build',
    })),
  }

  const handlers = buildPureSiteHandlers(() => ctx)
  return {
    ctx,
    handlers,
    getDoc: () => doc,
    getHash: () => currentHash,
    restoreRevision,
    checkResponsive,
  }
}

describe('PureSite Operations Registry (Functions + Core + Extended Escape Hatch)', () => {
  it('syncs plugin.json 1:1 with PURESITE_OPERATIONS_REGISTRY.manifestTools and meets check-manifests invariants', async () => {
    const manifest = (
      await import('../../plugin.json', { with: { type: 'json' } })
    ).default as {
      app: {
        agents: {
          tools: Array<{
            name: string
            risk?: string
            requiresApproval?: boolean
            description?: string
          }>
        }
      }
    }

    expect(manifest.app.agents.tools).toEqual([
      ...PURESITE_OPERATIONS_REGISTRY.manifestTools,
    ])
    expect([...EXPOSED_TOOL_NAMES]).toEqual([
      ...PURESITE_OPERATIONS_REGISTRY.exposedToolNames,
    ])
    expect([...PURESITE_AGENT_TOOLS]).toEqual([...EXPOSED_TOOL_NAMES])
    expect([...PURESITE_EXTENDED_TOOL_NAMES].sort()).toEqual(
      [...PURESITE_OPERATIONS_REGISTRY.extendedToolNames].sort(),
    )
    expect([...PURESITE_ALL_ATOMIC_TOOL_NAMES].sort()).toEqual(
      [...PURESITE_OPERATIONS_REGISTRY.allAtomicToolNames].sort(),
    )

    const summary = PURESITE_OPERATIONS_REGISTRY.auditSummary()
    expect(summary.functions).toBe(PURESITE_FUNCTION_NAMES.length)
    expect(summary.functions).toBe(6)
    expect(summary.coreTools).toBe(PURESITE_CORE_TOOL_NAMES.length)
    expect(summary.coreTools).toBe(8)
    expect(summary.extendedTools).toBe(PURESITE_EXTENDED_TOOL_NAMES.length)
    expect(summary.extendedTools).toBe(27)
    expect(summary.metaTools).toBe(3)
    expect(summary.totalExposed).toBe(17)
    expect(summary.totalAtomicTools).toBe(35)
    expect(summary.schemaReductionPercent).toBeGreaterThanOrEqual(50)
    expect(PURESITE_ATOMIC_TOOL_SCHEMAS.length).toBe(35)

    // Verify manifest-level check-manifests invariants on every exposed tool
    const releaseVerbs = new Set([
      'send',
      'merge',
      'publish',
      'deposit',
      'deploy',
      'post',
    ])
    for (const tool of manifest.app.agents.tools) {
      expect(['read', 'write', 'destructive', 'external', 'release']).toContain(
        tool.risk,
      )
      expect(typeof tool.requiresApproval).toBe('boolean')
      expect((tool.description ?? '').trim().length).toBeGreaterThanOrEqual(80)
      const firstNameWord = tool.name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z]+/)
        .find(Boolean)
        ?.toLowerCase()
      const firstDescWord = (tool.description ?? '')
        .trim()
        .split(/[^A-Za-z]+/)
        .find(Boolean)
        ?.toLowerCase()
      if (tool.risk !== 'release') {
        expect(releaseVerbs.has(firstNameWord ?? '')).toBe(false)
        expect(releaseVerbs.has(firstDescWord ?? '')).toBe(false)
      }
    }
  })

  it('executes read-only composite functions: briefing, page dossier, unified audit, and pre-publish readiness', async () => {
    const { handlers, checkResponsive } = makeFixture()

    // 1. fn_siteArchitectureBriefing
    const briefing = JSON.parse(
      (
        await handlers.fn_siteArchitectureBriefing(
          invoke('fn_siteArchitectureBriefing', { includeStyles: true }),
        )
      ).content,
    )
    expect(briefing.ok).toBe(true)
    expect(briefing.opClass).toBe('function')
    expect(briefing.data.pages).toHaveLength(3)
    expect(briefing.data.promisedPages.map((p: { page: string }) => p.page)).toContain(
      'grants/index.html',
    )
    expect(briefing.data.lenses.dateContradictions.length).toBeGreaterThan(0)
    expect(briefing.data.design.css).toContain(':root')
    expect(briefing.data.assets.byRole).toEqual({ content: 2, reference: 1, logo: 0 })
    expect(briefing.data.assets.unusedContentAssets).toEqual(['unused.png'])
    expect(briefing.data.revisionsCount).toBe(1)

    // 2. fn_pageDossierAndContent
    const dossier = JSON.parse(
      (
        await handlers.fn_pageDossierAndContent(
          invoke('fn_pageDossierAndContent', {
            page: 'index.html',
            question: 'When do visiting fellowships close?',
            includeHtml: false,
          }),
        )
      ).content,
    )
    expect(dossier.ok).toBe(true)
    expect(dossier.data.page).toBe('index.html')
    expect(dossier.data.head.lang).toBe('en')
    expect(dossier.data.structure.headings[0]).toEqual({ level: 1, text: 'Apex Research Lab' })
    expect(dossier.data.structure.imagesMissingAlt).toBe(1)
    expect(dossier.data.questionAnswer.sentence).toMatch(/15 March 2027/)
    expect(dossier.data.html).toBeUndefined()

    // 3. fn_seoAccessibilityAndResponsiveAudit (with live responsive check)
    const audit = JSON.parse(
      (
        await handlers.fn_seoAccessibilityAndResponsiveAudit(
          invoke('fn_seoAccessibilityAndResponsiveAudit', {
            page: 'index.html',
            measureResponsive: true,
            widths: [390, 768],
          }),
        )
      ).content,
    )
    expect(audit.ok).toBe(true)
    expect(checkResponsive).toHaveBeenCalledWith('index.html', [390, 768])
    expect(audit.data.responsive.clean).toBe(true)
    expect(audit.data.recommendedFixes).toContain('ensure404')
    expect(audit.data.recommendedFixes).toContain('fixMissingLang')

    // Responsive failure surfaced when horizontal overflow occurs
    const overflowFixture = makeFixture({ responsiveClean: false })
    const overflowAudit = JSON.parse(
      (
        await overflowFixture.handlers.fn_seoAccessibilityAndResponsiveAudit(
          invoke('fn_seoAccessibilityAndResponsiveAudit', {
            measureResponsive: true,
            widths: [390],
          }),
        )
      ).content,
    )
    expect(overflowAudit.data.responsive.clean).toBe(false)

    // 4. fn_prePublishReadinessCheck (ready vs blocked)
    const ready = JSON.parse(
      (
        await handlers.fn_prePublishReadinessCheck(
          invoke('fn_prePublishReadinessCheck', { includeLlmsPreview: true }),
        )
      ).content,
    )
    expect(ready.ok).toBe(true)
    expect(ready.data.readyToBuild).toBe(true)
    expect(ready.data.buildPlan.pages).toBe(3)
    expect(ready.data.llmsTxtPreview).toContain('# Apex Research Lab')

    const blockedFixture = makeFixture({
      documentPath: null,
      verification: {
        state: 'failed',
        reasons: ['index.html scrolls sideways at 390px'],
        pages: {},
      },
    })
    const blocked = JSON.parse(
      (
        await blockedFixture.handlers.fn_prePublishReadinessCheck(
          invoke('fn_prePublishReadinessCheck', {}),
        )
      ).content,
    )
    expect(blocked.data.readyToBuild).toBe(false)
    expect(blocked.data.blockers.length).toBeGreaterThanOrEqual(2)
  })

  it('executes mutating composite functions: fn_scaffoldPageWithSections and fn_polishThemeSeoAndNavigation', async () => {
    // 1. fn_scaffoldPageWithSections
    const f1 = makeFixture()

    // Missing & stale baseHash refused before mutation
    await expect(
      f1.handlers.fn_scaffoldPageWithSections(
        invoke('fn_scaffoldPageWithSections', { page: 'grants', mode: 'create' }),
      ),
    ).rejects.toThrow(/baseHash is required/i)
    await expect(
      f1.handlers.fn_scaffoldPageWithSections(
        invoke('fn_scaffoldPageWithSections', {
          baseHash: 'stale-hash',
          page: 'grants',
          mode: 'create',
        }),
      ),
    ).rejects.toThrow(/changed since your read/i)

    // Unknown section ID refused before mutation
    await expect(
      f1.handlers.fn_scaffoldPageWithSections(
        invoke('fn_scaffoldPageWithSections', {
          baseHash: f1.getHash(),
          page: 'grants',
          mode: 'create',
          sections: ['not-a-real-section'],
        }),
      ),
    ).rejects.toThrow(/unknown section id/i)

    // Create a promised page with library sections + custom markup + SEO head + 404.html
    const created = JSON.parse(
      (
        await f1.handlers.fn_scaffoldPageWithSections(
          invoke('fn_scaffoldPageWithSections', {
            baseHash: f1.getHash(),
            page: 'grants',
            mode: 'create',
            title: 'Research Grants',
            sections: [
              'hero',
              'metrics-strip',
              { markup: '<section><p>Annual fellowship stipends ($$50k &amp; $&amp; travel) available.</p></section>' },
            ],
            head: {
              lang: 'en',
              description: 'Explore annual Apex Research Lab fellowship grants.',
              ogTitle: 'Research Grants · Apex',
            },
            create404: true,
          }),
        )
      ).content,
    )
    expect(created.ok).toBe(true)
    expect(created.data.page).toBe('grants/index.html')
    expect(created.data.url).toBe('/grants/')
    expect(created.data.appliedActions).toContain('attachedSectionLibraryStyles')
    expect(created.data.appliedActions).toContain('createPage:grants/index.html')
    expect(created.data.appliedActions).toContain('create404')
    expect(f1.getDoc().styles).toContain(SECTION_STYLES_START)
    expect(f1.getDoc().pages['404.html']).toBeTruthy()
    expect(readPageHead(f1.getDoc().pages['grants/index.html']!).description).toContain(
      'fellowship grants',
    )
    expect(f1.getDoc().pages['grants/index.html']).toContain('$$50k &amp; $&amp; travel')

    // Append another section onto the newly created page using chained hash
    const appended = JSON.parse(
      (
        await f1.handlers.fn_scaffoldPageWithSections(
          invoke('fn_scaffoldPageWithSections', {
            baseHash: created.data.hash,
            page: 'grants/index.html',
            mode: 'append',
            sections: ['faq-accordion'],
          }),
        )
      ).content,
    )
    expect(appended.ok).toBe(true)
    expect(f1.getDoc().pages['grants/index.html']).toContain('ps-faq')

    // 2. fn_polishThemeSeoAndNavigation
    const f2 = makeFixture()

    // Invalid navOrder refused without mutating
    await expect(
      f2.handlers.fn_polishThemeSeoAndNavigation(
        invoke('fn_polishThemeSeoAndNavigation', {
          baseHash: f2.getHash(),
          navOrder: ['index.html'],
        }),
      ),
    ).rejects.toThrow(/every existing page/i)

    const polished = JSON.parse(
      (
        await f2.handlers.fn_polishThemeSeoAndNavigation(
          invoke('fn_polishThemeSeoAndNavigation', {
            baseHash: f2.getHash(),
            preset: 'high-contrast-clear',
            tokens: { radiusPx: 6 },
            fixMissingLang: 'en',
            ensure404: true,
            pageMeta: [
              {
                page: 'about/index.html',
                title: 'About Apex Lab',
                description: 'Learn about Apex Research Lab and open science tools.',
              },
              {
                page: 'contact/index.html',
                description: 'Contact Apex Research Lab for partnerships.',
              },
            ],
            navOrder: ['index.html', 'contact/index.html', 'about/index.html'],
          }),
        )
      ).content,
    )
    expect(polished.ok).toBe(true)
    expect(polished.data.appliedActions).toContain('preset:high-contrast-clear')
    expect(polished.data.appliedActions).toContain('customTokens')
    expect(polished.data.appliedActions).toContain('reorderNav')
    expect(polished.data.appliedActions).toContain('ensure404')
    expect(polished.data.afterScore).toBeGreaterThan(polished.data.beforeScore)
    expect(polished.data.contrast.bodyGrade).toBe('AAA')
    expect(readDesignTokens(f2.getDoc().styles).radiusPx).toBe(6)
    expect(readPageHead(f2.getDoc().pages['about/index.html']!).lang).toBe('en')
    expect(f2.getDoc().pages['404.html']).toBeTruthy()
    expect(polished.data.navOrder.slice(0, 3)).toEqual([
      'index.html',
      'contact/index.html',
      'about/index.html',
    ])
  })

  it('discovers and routes extended tools safely via discoverAppTools, callExtendedReadTool, and callExtendedTool', async () => {
    const { handlers, getHash, restoreRevision } = makeFixture()

    // Discovery by keyword
    const discovered = JSON.parse(
      (
        await handlers.discoverAppTools(
          invoke('discoverAppTools', { query: 'revision' }),
        )
      ).content,
    )
    expect(discovered.appSlug).toBe('site')
    expect(
      discovered.operations.some((op: { name: string }) => op.name === 'listRevisions'),
    ).toBe(true)
    expect(
      discovered.operations.some((op: { name: string }) => op.name === 'restoreRevision'),
    ).toBe(true)

    // Exact schema inspection via names
    const described = JSON.parse(
      (
        await handlers.discoverAppTools(
          invoke('discoverAppTools', { names: ['restoreRevision', 'getSiteMap'] }),
        )
      ).content,
    )
    expect(described.mode).toBe('describe')
    const restoreInfo = described.operations.find(
      (op: { name: string }) => op.name === 'restoreRevision',
    )
    expect(restoreInfo.invokeVia).toBe('callExtendedTool')
    expect(restoreInfo.requiresConfirmDestructive).toBe(true)
    expect(restoreInfo.inputSchema.type).toBe('object')

    // Read-only extended tools succeed via callExtendedReadTool
    const siteMapRes = JSON.parse(
      (
        await handlers.callExtendedReadTool(
          invoke('callExtendedReadTool', { tool: 'getSiteMap', arguments: {} }),
        )
      ).content,
    )
    expect(siteMapRes.pages).toHaveLength(3)
    expect(siteMapRes.promised[0].page).toBe('grants/index.html')

    const stylesRes = JSON.parse(
      (
        await handlers.callExtendedReadTool(
          invoke('callExtendedReadTool', { tool: 'readStyles', arguments: {} }),
        )
      ).content,
    )
    expect(stylesRes.css).toContain(':root')

    // Refusals on callExtendedReadTool: directly exposed core tool & mutating extended tool
    await expect(
      handlers.callExtendedReadTool(
        invoke('callExtendedReadTool', { tool: 'getSiteContext' }),
      ),
    ).rejects.toThrow(/already directly exposed/i)
    await expect(
      handlers.callExtendedReadTool(
        invoke('callExtendedReadTool', { tool: 'movePage' }),
      ),
    ).rejects.toThrow(/cannot run through callExtendedReadTool/i)

    // Mutating extended tool succeeds via callExtendedTool
    const moved = JSON.parse(
      (
        await handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'movePage',
            arguments: { from: 2, to: 1, baseHash: getHash() },
          }),
        )
      ).content,
    )
    expect(moved.moved).toBe(true)
    expect(moved.from).toBe(2)
    expect(moved.to).toBe(1)

    // Refusals on callExtendedTool: read-only tool, direct core tool, destructive without confirmDestructive
    await expect(
      handlers.callExtendedTool(
        invoke('callExtendedTool', { tool: 'listRevisions' }),
      ),
    ).rejects.toThrow(/read-only/i)
    await expect(
      handlers.callExtendedTool(
        invoke('callExtendedTool', { tool: 'buildSite' }),
      ),
    ).rejects.toThrow(/already directly exposed/i)
    await expect(
      handlers.callExtendedTool(
        invoke('callExtendedTool', {
          tool: 'restoreRevision',
          arguments: { file: '2026-11-20T10-00-00-000Z-agent.json' },
        }),
      ),
    ).rejects.toThrow(/confirmDestructive: true/i)

    // Destructive extended tool succeeds when confirmDestructive: true is supplied
    const restored = JSON.parse(
      (
        await handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'restoreRevision',
            arguments: { file: '2026-11-20T10-00-00-000Z-agent.json' },
            confirmDestructive: true,
          }),
        )
      ).content,
    )
    expect(restored.restored).toBe('2026-11-20T10-00-00-000Z-agent.json')
    expect(restoreRevision).toHaveBeenCalledOnce()
  })
})
