/**
 * High-level composite PureSite App Functions (`fn_*`).
 *
 * Each function collapses 3–10 atomic tool round-trips into one auditable call
 * using PureSite's own deterministic libraries (`preflightAudit`, `siteLenses`,
 * `siteLinks`, `designTokens`, `sectionLibrary`, `pages`, `buildSite`,
 * `siteData`, `responsiveCheck`) and routing every write through the app's
 * single document door with strict `baseHash` validation and hash chaining.
 */
import {
  defineAppFunction,
  type AppFunctionDefinition,
} from '@purescience/platform-ui/bridge/appFunctions'
import { nameOf } from '../lib/assetNames'
import {
  checkSite as runCheckSite,
  hasBlockingFinding,
  planBuild,
  requiredAssetNames,
} from '../lib/buildSite'
import {
  contrastRatio,
  DESIGN_PRESETS,
  readDesignTokens,
  sanitizeDesignTokens,
  wcagGrade,
  withDesignTokens,
  type DesignTokens,
} from '../lib/designTokens'
import {
  addPage as addPageIn,
  insertElement as insertElementIn,
  movePage as movePageIn,
  normalizePagePath,
  readPageHead,
  updatePageHead,
  writePage as writePageIn,
  type PageHeadMeta,
} from '../lib/pages'
import { runPreflightAudit } from '../lib/preflightAudit'
import { internalLinks } from '../lib/preview'
import { analyseLayout, copyNotes, limitsFor, type LayoutRead } from '../lib/responsiveCheck'
import {
  SECTION_LIBRARY,
  sectionById,
  withSectionLibraryStyles,
} from '../lib/sectionLibrary'
import { brandLine } from '../lib/siteBrand'
import { checkCollections, dataProviderFor } from '../lib/siteData'
import {
  orderedPages,
  setPageTitle as setPageTitleInHtml,
  starter404Html,
  starterPageHtml,
  titleFromPage,
  urlPathFor,
  type SiteDocument,
} from '../lib/siteDocument'
import {
  answerFor,
  contradictions,
  health as siteHealth,
  journeys as siteJourneys,
  llmsText,
  reach as siteReach,
  readingText,
  statedFacts,
} from '../lib/siteLenses'
import { linkGraph, linksForPage, promiseBrief } from '../lib/siteLinks'
import { AgentSiteToolError, type AgentLanded, type SiteAgentToolContext } from './catalog'

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : undefined

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

function resolveExistingPage(ctx: SiteAgentToolContext, rawPage: unknown): string {
  const asked = str(rawPage)
  if (!asked) return ctx.selectedPage
  const pages = ctx.document.pages
  if (Object.hasOwn(pages, asked)) return asked
  const normalized = normalizePagePath(asked)
  if (normalized && Object.hasOwn(pages, normalized)) return normalized
  throw new AgentSiteToolError(
    `no page "${asked}" — the site has ${Object.keys(pages).join(', ')}`,
  )
}

function requireSiteBaseHash(ctx: SiteAgentToolContext, args: Record<string, unknown>): string {
  const baseHash = str(args.baseHash)
  if (!baseHash) {
    throw new AgentSiteToolError(
      'baseHash is required — pass the site hash returned by getSiteContext or fn_siteArchitectureBriefing',
    )
  }
  if (ctx.hash && baseHash !== ctx.hash) {
    throw new AgentSiteToolError(
      `the site changed since your read (hash ${baseHash} → ${ctx.hash}) — call getSiteContext or fn_siteArchitectureBriefing again and redo the edit`,
    )
  }
  return baseHash
}

function linksByPageOf(doc: SiteDocument): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(doc.pages).map(([path, html]) => [path, internalLinks(html, path)]),
  )
}

function computeFindingsForDoc(ctx: SiteAgentToolContext, doc: SiteDocument) {
  const availableAssets = (ctx.material ?? []).map(item => item.name)
  return runCheckSite(doc, availableAssets, linksByPageOf(doc))
}

function parsePageHeadPatch(raw: unknown): Partial<PageHeadMeta> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const input = raw as Record<string, unknown>
  const patch: Partial<PageHeadMeta> = {}
  let hasAny = false
  for (const key of [
    'lang',
    'description',
    'ogTitle',
    'ogDescription',
    'ogImage',
    'favicon',
  ] as const) {
    if (typeof input[key] === 'string') {
      patch[key] = input[key] as string
      hasAny = true
    }
  }
  return hasAny ? patch : null
}

function inspectPageStructure(html: string) {
  if (typeof DOMParser === 'undefined') {
    return {
      headings: [] as Array<{ level: number; text: string }>,
      images: [] as Array<{ src: string; alt: string | null; missingAlt: boolean }>,
      landmarks: [] as string[],
      formsCount: 0,
      externalLinksCount: 0,
    }
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body
  if (!body) {
    return {
      headings: [] as Array<{ level: number; text: string }>,
      images: [] as Array<{ src: string; alt: string | null; missingAlt: boolean }>,
      landmarks: [] as string[],
      formsCount: 0,
      externalLinksCount: 0,
    }
  }
  const headings = Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(el => ({
    level: Number(el.tagName.slice(1)),
    text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
  }))
  const images = Array.from(body.querySelectorAll('img')).map(img => ({
    src: img.getAttribute('src') ?? '',
    alt: img.hasAttribute('alt') ? (img.getAttribute('alt') ?? '') : null,
    missingAlt: !img.hasAttribute('alt'),
  }))
  const landmarks = Array.from(
    body.querySelectorAll('header, nav, main, section, article, aside, footer'),
  ).map(el => {
    const tag = el.tagName.toLowerCase()
    const label = el.getAttribute('aria-label')
    const id = el.getAttribute('id')
    return label ? `${tag}[${label}]` : id ? `${tag}#${id}` : tag
  })
  const externalLinksCount = Array.from(body.querySelectorAll('a[href]')).filter(a =>
    /^https?:\/\//i.test((a.getAttribute('href') ?? '').trim()),
  ).length
  const formsCount = body.querySelectorAll('form').length
  return { headings, images, landmarks, formsCount, externalLinksCount }
}

const SECTION_IDS = SECTION_LIBRARY.map(s => s.id)
const PRESET_IDS = DESIGN_PRESETS.map(p => p.id)

export const PURESITE_FUNCTIONS: readonly AppFunctionDefinition<SiteAgentToolContext>[] = [
  // 1. Site Architecture & Pages Briefing (Read)
  defineAppFunction<SiteAgentToolContext>({
    name: 'fn_siteArchitectureBriefing',
    category: 'site',
    risk: 'read',
    requiresApproval: false,
    replaces: [
      'getSiteContext',
      'getSiteMap',
      'readStyles',
      'listCollections',
      'listRevisions',
      'checkSite',
    ],
    description:
      'Read a complete single-call site architecture briefing: site metadata, hashes for baseHash, ordered pages with link graph and promised pages, orphan/drift/contradiction lenses, design tokens with WCAG contrast, asset inventory by role, collections, verification state, and revision count.',
    inputSchema: {
      type: 'object',
      properties: {
        includeStyles: {
          type: 'boolean',
          description: 'Include the full shared styles/site.css text (default false).',
        },
        includePromisedBriefs: {
          type: 'boolean',
          description:
            'Include sentence-derived briefs for promised unbuilt pages (default true).',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const includeStyles = args.includeStyles === true
      const includePromisedBriefs = args.includePromisedBriefs !== false
      const doc = ctx.document
      const graph = linkGraph(doc)
      const home = doc.manifest.pages[0] ?? 'index.html'
      const goal = doc.manifest.goal ?? null
      const journeySummary = siteJourneys(graph, home, goal)
      const healthNotes = siteHealth(doc, graph)
      const reachNotes = siteReach(doc)
      const facts = statedFacts(doc)
      const dateContradictions = contradictions(facts)
      const findings = ctx.checkSite()
      const tokens = readDesignTokens(doc.styles)
      const bodyContrast = contrastRatio(tokens.ink, tokens.ground)
      const mutedContrast = contrastRatio(tokens.inkSoft, tokens.ground)
      const usedAssets = new Set(requiredAssetNames(doc))

      const roleCounts = { content: 0, reference: 0, logo: 0 }
      const unusedContentAssets: string[] = []
      for (const item of ctx.material ?? []) {
        const role = item.role ?? 'content'
        if (role === 'reference') roleCounts.reference += 1
        else if (role === 'logo') roleCounts.logo += 1
        else roleCounts.content += 1
        if (role !== 'reference' && !usedAssets.has(item.name)) {
          unusedContentAssets.push(item.name)
        }
      }

      const pages = ctx.pages.map((page, index) => {
        const html = doc.pages[page.path] ?? ''
        const around = linksForPage(graph, page.path)
        const head = readPageHead(html)
        return {
          index,
          page: page.path,
          url: urlPathFor(page.path),
          title: page.title,
          hash: ctx.pageHashes[page.path],
          bytes: html.length,
          wordCount: countWords(readingText(html)),
          lang: head.lang || null,
          hasMetaDescription: Boolean(head.description),
          linksTo: around.out.map(l => l.target),
          linkedFrom: [...new Set(around.in.map(l => l.fromPage))],
          promises: around.promises.map(l => l.target),
        }
      })

      const blockingErrors = findings.filter(f => f.severity === 'error').length
      const warnings = findings.filter(f => f.severity === 'warning').length
      const provider = dataProviderFor(ctx.serviceId)

      return {
        mutated: false,
        summary: `Site "${doc.title || 'Untitled'}" (${pages.length} page${pages.length === 1 ? '' : 's'}, ${graph.promised.length} promised, ${blockingErrors} blocking error(s), verification ${ctx.verification.state}).`,
        data: {
          title: doc.title,
          path: ctx.documentPath,
          hash: ctx.hash,
          target: doc.manifest.target,
          brief: doc.manifest.brief,
          goal,
          selectedPage: ctx.selectedPage,
          aim: ctx.pageSelection.length
            ? { scope: 'pages' as const, pages: ctx.pageSelection }
            : { scope: 'page' as const, page: ctx.selectedPage },
          selection: ctx.selection,
          navOrder: doc.manifest.pages,
          pages,
          promisedPages: graph.promised.map(promise => ({
            page: promise.path,
            url: urlPathFor(promise.path),
            suggestedTitle: promise.title,
            inSiteHeader: promise.inNav,
            promisedByCount: promise.promises.length,
            ...(includePromisedBriefs ? { brief: promiseBrief(doc, promise) } : {}),
          })),
          orphans: graph.orphans.map(p => ({ page: p, url: urlPathFor(p) })),
          lenses: {
            journeys: {
              goal: journeySummary.goal,
              bestPath: journeySummary.best,
              strandedPages: journeySummary.stranded,
            },
            healthNotes,
            reachIssueCount: reachNotes.length,
            dateContradictions,
          },
          design: {
            stylesheetBytes: doc.styles.length,
            tokens,
            contrast: {
              bodyRatio: Number(bodyContrast.toFixed(2)),
              bodyGrade: wcagGrade(bodyContrast),
              mutedRatio: Number(mutedContrast.toFixed(2)),
              mutedGrade: wcagGrade(mutedContrast),
            },
            brand: doc.manifest.brand
              ? {
                  name: doc.manifest.brand.name,
                  in: brandLine(doc.manifest.brand),
                  ...(doc.manifest.brand.id ? { id: doc.manifest.brand.id } : {}),
                  path: doc.manifest.brand.path,
                }
              : null,
            ...(includeStyles ? { css: doc.styles } : {}),
          },
          assets: {
            total: (ctx.material ?? []).length,
            byRole: roleCounts,
            unusedContentAssets,
            items: (ctx.material ?? []).map(item => ({
              called: nameOf(item),
              name: item.name,
              reference: item.reference,
              role: item.role ?? 'content',
              kind: item.kind,
              description: item.description,
            })),
          },
          collections: {
            count: doc.collections.length,
            names: doc.collections.map(c => c.name),
            storage: provider
              ? {
                  host: provider.id,
                  requiresAccount: provider.requiresAccount,
                  note: provider.accountNote,
                }
              : { host: null, note: 'The chosen host does not store records.' },
          },
          health: {
            ok: !hasBlockingFinding(findings),
            blockingErrors,
            warnings,
            verification: {
              state: ctx.verification.state,
              reasons: ctx.verification.reasons,
            },
          },
          revisionsCount: ctx.revisions.length,
          published: doc.manifest.published
            ? {
                service: doc.manifest.published.service,
                url: doc.manifest.published.url ?? null,
                at: doc.manifest.published.at ?? null,
              }
            : null,
        },
      }
    },
  }),

  // 2. Page Dossier & Content Inspection (Read)
  defineAppFunction<SiteAgentToolContext>({
    name: 'fn_pageDossierAndContent',
    category: 'pages',
    risk: 'read',
    requiresApproval: false,
    replaces: ['readPage', 'getSiteMap', 'checkSite', 'getSiteContext'],
    description:
      'Call getSiteContext first for exact page paths. Inspect a single page in depth in one call: page and site hashes, URL, SEO and OpenGraph head metadata, heading outline, image alt coverage, link neighborhood and journey distance, page-specific checkSite/health/reach notes, optional deterministic answer to a question, and full HTML.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          description:
            'Page path (e.g. index.html or about/index.html). Defaults to the currently selected page.',
        },
        includeHtml: {
          type: 'boolean',
          description: 'Include full raw HTML document (default true).',
        },
        question: {
          type: 'string',
          description:
            'Optional reader question to check deterministically against site copy via answerFor.',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const page = resolveExistingPage(ctx, args.page)
      const includeHtml = args.includeHtml !== false
      const doc = ctx.document
      const html = doc.pages[page] ?? ''
      const head = readPageHead(html)
      const title = titleFromPage(html)
      const plainText = readingText(html)
      const wordCount = countWords(plainText)
      const graph = linkGraph(doc)
      const around = linksForPage(graph, page)
      const home = doc.manifest.pages[0] ?? 'index.html'
      const journeyList = siteJourneys(graph, home, doc.manifest.goal ?? null)
      const pageJourney = journeyList.pages.find(j => j.page === page) ?? null
      const pageFindings = ctx.checkSite().filter(f => f.page === page)
      const pageHealth = siteHealth(doc, graph).filter(n => n.page === page)
      const pageReach = siteReach(doc).filter(n => n.page === page)
      const structure = inspectPageStructure(html)
      const question = str(args.question)
      const answer = question ? answerFor(doc, graph, question) : undefined

      return {
        mutated: false,
        summary: `Page "${page}" (${title || 'untitled'}, ${wordCount} words, ${structure.headings.length} heading(s), ${pageFindings.length} finding(s)).`,
        data: {
          page,
          url: urlPathFor(page),
          title: title || null,
          pageHash: ctx.pageHashes[page],
          siteHash: ctx.hash,
          bytes: html.length,
          wordCount,
          readingTimeSeconds: Math.max(1, Math.round((wordCount / 220) * 60)),
          head,
          structure: {
            headings: structure.headings,
            imageCount: structure.images.length,
            imagesMissingAlt: structure.images.filter(i => i.missingAlt).length,
            images: structure.images,
            landmarks: structure.landmarks,
            formsCount: structure.formsCount,
            externalLinksCount: structure.externalLinksCount,
          },
          links: {
            linksTo: around.out.map(l => ({ target: l.target, text: l.text, href: l.href })),
            linkedFrom: [...new Set(around.in.map(l => l.fromPage))],
            promises: around.promises.map(l => ({ target: l.target, text: l.text, href: l.href })),
            isOrphan: graph.orphans.includes(page),
            journey: pageJourney,
          },
          diagnostics: {
            findings: pageFindings,
            healthNotes: pageHealth,
            reachNotes: pageReach,
          },
          ...(answer ? { questionAnswer: answer } : {}),
          ...(includeHtml ? { html } : {}),
        },
      }
    },
  }),

  // 3. Unified SEO, Accessibility & Responsive Audit (Read)
  defineAppFunction<SiteAgentToolContext>({
    name: 'fn_seoAccessibilityAndResponsiveAudit',
    category: 'audit',
    risk: 'read',
    requiresApproval: false,
    replaces: ['checkSite', 'checkResponsive', 'getSiteMap', 'getSiteContext'],
    description:
      'Call getSiteContext first for exact page paths. Run a unified SEO, accessibility, WCAG 2.1 contrast, link/stylesheet health, payload weight, and optional live responsive layout audit in one call. Returns a 0–100 score, launch grade, categorized findings, search/social preview, and recommended fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          description:
            'Page path for search/social preview and optional responsive measurement. Defaults to selected page.',
        },
        measureResponsive: {
          type: 'boolean',
          description:
            'Run live viewport responsive checks via checkResponsive at phone/tablet widths (default false).',
        },
        widths: {
          type: 'array',
          items: { type: 'integer', minimum: 320, maximum: 1920 },
          description: 'Viewport widths to measure when measureResponsive is true (default [390, 768]).',
        },
        includePasses: {
          type: 'boolean',
          description: 'Include passing audit checks alongside errors and warnings (default false).',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const page = resolveExistingPage(ctx, args.page)
      const includePasses = args.includePasses === true
      const doc = ctx.document
      const findings = ctx.checkSite()
      const graph = linkGraph(doc)
      const healthNotes = siteHealth(doc, graph)
      const reachNotes = siteReach(doc)
      const dateContradictions = contradictions(statedFacts(doc))

      const layoutReads: Record<string, LayoutRead | null> = {}
      let responsiveSummary: Record<string, unknown> | undefined
      if (args.measureResponsive === true) {
        const askedWidths = Array.isArray(args.widths)
          ? args.widths
              .map(Number)
              .filter(w => Number.isInteger(w) && w >= 320 && w <= 1920)
          : []
        const widths = askedWidths.length ? askedWidths.slice(0, 4) : [390, 768]
        const measured = await ctx.checkResponsive(page, widths)
        const complete = [
          ...measured,
          ...widths
            .filter(w => !measured.some(row => row.width === w))
            .map(w => ({ width: w, read: null, why: 'no measurement was returned' })),
        ]
        const perWidth = complete.map(({ width, read, why }) => {
          layoutReads[`${page}@${width}`] = read
          if (!read || read.width !== width) {
            return {
              width,
              measured: false,
              clean: false,
              why: why ?? 'the page could not be measured at this width',
            }
          }
          const layoutFindings = analyseLayout(read, limitsFor(read.width), page)
          return {
            width,
            measured: true,
            clean: layoutFindings.length === 0,
            findings: layoutFindings.map(({ code, message, fix }) => ({
              page,
              code,
              message,
              fix,
            })),
          }
        })
        const firstRead = measured.find(row => row.read)?.read
        const notes = firstRead ? copyNotes(firstRead) : []
        responsiveSummary = {
          page,
          clean: perWidth.length > 0 && perWidth.every(r => r.clean),
          results: perWidth,
          ...(notes.length
            ? { copyNotes: notes.map(({ code, message, fix }) => ({ code, message, fix })) }
            : {}),
        }
      }

      const report = runPreflightAudit({
        document: doc,
        selectedPage: page,
        findings,
        material: ctx.material,
        layoutReads,
      })

      const filteredItems = includePasses
        ? report.items
        : report.items.filter(item => item.severity !== 'pass')

      const recommendedFixes: string[] = []
      if (!doc.pages['404.html']) recommendedFixes.push('ensure404')
      if (report.items.some(i => i.id.startsWith('a11y:lang:'))) {
        recommendedFixes.push('fixMissingLang')
      }
      if (report.items.some(i => i.id === 'a11y:contrast-body' || i.id === 'a11y:contrast-muted')) {
        recommendedFixes.push('upgradeContrastPreset')
      }
      if (report.items.some(i => i.id.startsWith('seo:no-desc:'))) {
        recommendedFixes.push('addMetaDescriptions')
      }

      return {
        mutated: false,
        summary: `Preflight audit: ${report.score}/100 (${report.grade}), ${report.counts.errors} error(s), ${report.counts.warnings} warning(s), ${report.counts.passes} pass(es).`,
        data: {
          hash: ctx.hash,
          page,
          score: report.score,
          grade: report.grade,
          counts: report.counts,
          verification: {
            state: ctx.verification.state,
            reasons: ctx.verification.reasons,
          },
          preview: report.preview,
          weight: report.weight,
          items: filteredItems,
          lenses: {
            healthNotes,
            reachNotes,
            dateContradictions,
            promisedCount: graph.promised.length,
            orphanCount: graph.orphans.length,
          },
          ...(responsiveSummary ? { responsive: responsiveSummary } : {}),
          recommendedFixes,
        },
      }
    },
  }),

  // 4. Scaffold or Update Page with Responsive Sections Pack (Write)
  defineAppFunction<SiteAgentToolContext>({
    name: 'fn_scaffoldPageWithSections',
    category: 'pages',
    risk: 'write',
    requiresApproval: true,
    replaces: ['addPage', 'writePage', 'insertElement', 'writeStyles', 'setPageTitle'],
    description:
      'Call getSiteContext first for exact page paths and site baseHash. Create a new page or update an existing page with responsive Swiss-editorial section blocks and custom HTML, attach shared section styles automatically, apply SEO/OpenGraph head metadata, and optionally create 404.html in one call. Returns new hashes and immediate checkSite findings.',
    inputSchema: {
      type: 'object',
      properties: {
        baseHash: {
          type: 'string',
          description:
            'The site hash from getSiteContext or fn_siteArchitectureBriefing. Required.',
        },
        page: {
          type: 'string',
          description:
            'Target page path (e.g. "about", "work/index.html", or "index.html"). Defaults to selected page for append/replace.',
        },
        mode: {
          type: 'string',
          enum: ['create', 'append', 'replace'],
          description:
            'create adds a brand-new page; append inserts sections into an existing page (default); replace replaces <main> (or body content) on an existing page.',
        },
        title: {
          type: 'string',
          description: 'Optional <title> for the target page.',
        },
        sections: {
          type: 'array',
          description:
            `Ordered list of section library IDs (${SECTION_IDS.join(', ')}) or objects with { id?, markup?, beforePath?, afterPath? }.`,
          items: {
            oneOf: [
              { type: 'string', enum: SECTION_IDS },
              {
                type: 'object',
                properties: {
                  id: { type: 'string', enum: SECTION_IDS },
                  markup: { type: 'string' },
                  beforePath: { type: 'string' },
                  afterPath: { type: 'string' },
                },
                additionalProperties: false,
              },
            ],
          },
        },
        head: {
          type: 'object',
          description: 'Optional SEO/OpenGraph/language head metadata to apply to the page.',
          properties: {
            lang: { type: 'string' },
            description: { type: 'string' },
            ogTitle: { type: 'string' },
            ogDescription: { type: 'string' },
            ogImage: { type: 'string' },
            favicon: { type: 'string' },
          },
          additionalProperties: false,
        },
        create404: {
          type: 'boolean',
          description: 'Create a branded 404.html starter page if not already present.',
        },
      },
      required: ['baseHash'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      let currentSiteHash = requireSiteBaseHash(ctx, args)
      let currentPageHashes: Record<string, string> = { ...ctx.pageHashes }
      const mode =
        args.mode === 'create' || args.mode === 'replace' ? args.mode : 'append'
      const rawSections = Array.isArray(args.sections) ? args.sections : []
      const headPatch = parsePageHeadPatch(args.head)
      const title = str(args.title)
      const create404 = args.create404 === true

      // Validate sections upfront (all-or-nothing)
      const resolvedSections: Array<{
        kind: 'library' | 'custom'
        id?: string
        markup: string
        beforePath?: string
        afterPath?: string
      }> = []
      let usedLibrarySection = false

      for (const entry of rawSections) {
        if (typeof entry === 'string') {
          const tpl = sectionById(entry.trim())
          if (!tpl) {
            throw new AgentSiteToolError(
              `unknown section id "${entry}" — valid section IDs: ${SECTION_IDS.join(', ')}`,
            )
          }
          usedLibrarySection = true
          resolvedSections.push({ kind: 'library', id: tpl.id, markup: tpl.html })
        } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const item = entry as Record<string, unknown>
          const secId = str(item.id)
          const rawMarkup = str(item.markup)
          if (!secId && !rawMarkup) {
            throw new AgentSiteToolError(
              'each section object must provide either a library "id" or custom "markup"',
            )
          }
          if (secId) {
            const tpl = sectionById(secId)
            if (!tpl) {
              throw new AgentSiteToolError(
                `unknown section id "${secId}" — valid section IDs: ${SECTION_IDS.join(', ')}`,
              )
            }
            usedLibrarySection = true
            resolvedSections.push({
              kind: 'library',
              id: tpl.id,
              markup: rawMarkup ?? tpl.html,
              beforePath: str(item.beforePath),
              afterPath: str(item.afterPath),
            })
          } else {
            resolvedSections.push({
              kind: 'custom',
              markup: rawMarkup!,
              beforePath: str(item.beforePath),
              afterPath: str(item.afterPath),
            })
          }
        } else {
          throw new AgentSiteToolError('sections entries must be section ID strings or objects')
        }
      }

      // Resolve target page path upfront
      let targetPage: string
      if (mode === 'create') {
        const requested = str(args.page)
        if (!requested) {
          throw new AgentSiteToolError('page is required when mode is "create"')
        }
        const normalized = normalizePagePath(requested)
        if (!normalized) {
          throw new AgentSiteToolError(`"${requested}" is not a usable page name`)
        }
        if (Object.hasOwn(ctx.document.pages, normalized)) {
          throw new AgentSiteToolError(
            `${normalized} already exists — use mode "append" or "replace" to update it`,
          )
        }
        targetPage = normalized
      } else {
        targetPage = resolveExistingPage(ctx, args.page)
      }

      if (
        mode !== 'create' &&
        resolvedSections.length === 0 &&
        !headPatch &&
        !title &&
        !create404
      ) {
        throw new AgentSiteToolError(
          'provide at least one of sections, title, head, mode: "create", or create404: true',
        )
      }

      let workingDoc: SiteDocument = {
        ...ctx.document,
        pages: { ...ctx.document.pages },
        manifest: { ...ctx.document.manifest, pages: [...ctx.document.manifest.pages] },
      }
      const appliedActions: string[] = []
      let mutated = false
      let lastLanded: AgentLanded | null = null

      // 1. Attach section library CSS if needed
      if (usedLibrarySection) {
        const nextStyles = withSectionLibraryStyles(workingDoc.styles)
        if (nextStyles !== workingDoc.styles) {
          const res = ctx.writeStyles(nextStyles, { baseHash: currentSiteHash })
          currentSiteHash = res.hash
          currentPageHashes = res.pageHashes
          workingDoc = { ...workingDoc, styles: nextStyles }
          lastLanded = res
          if (res.changed) mutated = true
          appliedActions.push('attachedSectionLibraryStyles')
        }
      }

      // 2. Build target page HTML
      const pageTitle = title || (mode === 'create' ? targetPage : titleFromPage(workingDoc.pages[targetPage] ?? '') || targetPage)
      let html =
        mode === 'create'
          ? starterPageHtml(pageTitle, targetPage)
          : workingDoc.pages[targetPage] ?? starterPageHtml(pageTitle, targetPage)

      if (mode === 'create' && resolvedSections.length > 0) {
        // Replace starter placeholder <main class="page">...</main> with clean <main> for scaffolded sections
        html = html.replace(
          /<main\b[^>]*>[\s\S]*?<\/main>/i,
          `<main>\n${resolvedSections.map(s => s.markup).join('\n')}\n    </main>`,
        )
      } else if (mode === 'replace' && resolvedSections.length > 0) {
        const combined = resolvedSections.map(s => s.markup).join('\n')
        if (/<main\b[^>]*>[\s\S]*?<\/main>/i.test(html)) {
          html = html.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i, `<main>\n${combined}\n</main>`)
        } else if (/<body\b[^>]*>[\s\S]*?<\/body>/i.test(html)) {
          html = html.replace(/<body\b([^>]*)>[\s\S]*?<\/body>/i, `<body$1>\n<main>\n${combined}\n</main>\n</body>`)
        } else {
          html = starterPageHtml(pageTitle, targetPage).replace(
            /<main\b[^>]*>[\s\S]*?<\/main>/i,
            `<main>\n${combined}\n</main>`,
          )
        }
      } else {
        for (const sec of resolvedSections) {
          html = insertElementIn(html, {
            markup: sec.markup,
            ...(sec.beforePath ? { beforePath: sec.beforePath } : {}),
            ...(sec.afterPath ? { afterPath: sec.afterPath } : {}),
          })
        }
      }

      if (title) {
        html = setPageTitleInHtml(html, title)
      }
      if (headPatch) {
        html = updatePageHead(html, headPatch)
      }

      // 3. Land target page through PureSite's door
      if (mode === 'create') {
        const res = ctx.addPage(
          { path: targetPage, title: pageTitle, html },
          { baseHash: currentSiteHash },
        )
        currentSiteHash = res.hash
        currentPageHashes = res.pageHashes
        targetPage = res.page
        workingDoc = addPageIn(workingDoc, { path: targetPage, title: pageTitle, html })
        lastLanded = res
        if (res.changed) mutated = true
        appliedActions.push(`createPage:${targetPage}`)
      } else if (resolvedSections.length > 0 || title || headPatch) {
        const pageBaseHash = currentPageHashes[targetPage]
        const res = ctx.writePage(
          targetPage,
          html,
          pageBaseHash ? { baseHash: pageBaseHash, page: targetPage } : {},
        )
        currentSiteHash = res.hash
        currentPageHashes = res.pageHashes
        workingDoc = writePageIn(workingDoc, targetPage, html)
        lastLanded = res
        if (res.changed) mutated = true
        appliedActions.push(`${mode}Page:${targetPage}`)
      }

      // 4. Optional 404.html creation
      if (create404 && !workingDoc.pages['404.html']) {
        const html404 = starter404Html(workingDoc.title)
        const res = ctx.addPage(
          { path: '404.html', title: `Page not found · ${workingDoc.title}`, html: html404 },
          { baseHash: currentSiteHash },
        )
        currentSiteHash = res.hash
        currentPageHashes = res.pageHashes
        workingDoc = addPageIn(workingDoc, {
          path: '404.html',
          title: `Page not found · ${workingDoc.title}`,
          html: html404,
        })
        lastLanded = res
        if (res.changed) mutated = true
        appliedActions.push('create404')
      }

      const findings = computeFindingsForDoc(ctx, workingDoc).filter(
        f => !f.page || f.page === targetPage,
      )

      return {
        mutated,
        summary: `Scaffolded "${targetPage}" (${mode}, ${resolvedSections.length} section(s), hash ${currentSiteHash}).`,
        data: {
          page: targetPage,
          url: urlPathFor(targetPage),
          mode,
          hash: currentSiteHash,
          pageHash: currentPageHashes[targetPage],
          changed: mutated,
          sectionsApplied: resolvedSections.map(s => s.id ?? 'custom'),
          appliedActions,
          findings,
          ...(lastLanded?.warning ? { textRemoved: lastLanded.warning } : {}),
        },
      }
    },
  }),

  // 5. Coordinated Theme, SEO & Navigation Polish (Write)
  defineAppFunction<SiteAgentToolContext>({
    name: 'fn_polishThemeSeoAndNavigation',
    category: 'design',
    risk: 'write',
    requiresApproval: true,
    replaces: [
      'readStyles',
      'writeStyles',
      'setPageTitle',
      'movePage',
      'writePage',
      'addPage',
    ],
    description:
      'Call getSiteContext first for exact page paths and site baseHash. Apply a coordinated design-token theme preset or token overrides, batch page titles and SEO/OpenGraph head metadata, missing html lang fixes, 404.html creation, and nav reordering in one call. Returns WCAG contrast grades, before/after preflight scores, and updated hashes.',
    inputSchema: {
      type: 'object',
      properties: {
        baseHash: {
          type: 'string',
          description:
            'The site hash from getSiteContext or fn_siteArchitectureBriefing. Required.',
        },
        preset: {
          type: 'string',
          enum: PRESET_IDS,
          description: `Optional Design Studio preset (${PRESET_IDS.join(', ')}).`,
        },
        tokens: {
          type: 'object',
          description: 'Optional partial Design Studio token overrides merged over current or preset tokens.',
          properties: {
            ground: { type: 'string' },
            surface: { type: 'string' },
            ink: { type: 'string' },
            inkSoft: { type: 'string' },
            accent: { type: 'string' },
            displayFont: { type: 'string' },
            bodyFont: { type: 'string' },
            monoFont: { type: 'string' },
            measureCh: { type: 'number', minimum: 48, maximum: 84 },
            radiusPx: { type: 'number', minimum: 0, maximum: 16 },
            rhythmScale: { type: 'number', minimum: 0.75, maximum: 1.4 },
          },
          additionalProperties: false,
        },
        pageMeta: {
          type: 'array',
          description: 'Batch updates to page titles and SEO/OpenGraph head metadata.',
          items: {
            type: 'object',
            properties: {
              page: { type: 'string' },
              title: { type: 'string' },
              lang: { type: 'string' },
              description: { type: 'string' },
              ogTitle: { type: 'string' },
              ogDescription: { type: 'string' },
              ogImage: { type: 'string' },
              favicon: { type: 'string' },
            },
            required: ['page'],
            additionalProperties: false,
          },
        },
        fixMissingLang: {
          type: 'string',
          description: 'Set <html lang="..."> on every page that lacks a lang attribute (e.g. "en").',
        },
        ensure404: {
          type: 'boolean',
          description: 'Add a branded starter 404.html page if none exists.',
        },
        navOrder: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional complete ordered list of page paths for nav order (must list every existing page once).',
        },
      },
      required: ['baseHash'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      let currentSiteHash = requireSiteBaseHash(ctx, args)
      let currentPageHashes: Record<string, string> = { ...ctx.pageHashes }

      const presetId = str(args.preset)
      const preset = presetId ? DESIGN_PRESETS.find(p => p.id === presetId) : undefined
      if (presetId && !preset) {
        throw new AgentSiteToolError(
          `unknown preset "${presetId}" — valid presets: ${PRESET_IDS.join(', ')}`,
        )
      }

      const rawTokens =
        args.tokens && typeof args.tokens === 'object' && !Array.isArray(args.tokens)
          ? (args.tokens as Partial<DesignTokens>)
          : null

      const rawPageMeta = Array.isArray(args.pageMeta)
        ? (args.pageMeta as Array<Record<string, unknown>>)
        : []
      const fixMissingLang = str(args.fixMissingLang)
      const ensure404 = args.ensure404 === true
      const rawNavOrder = Array.isArray(args.navOrder)
        ? (args.navOrder as unknown[])
        : null

      if (
        !preset &&
        !rawTokens &&
        rawPageMeta.length === 0 &&
        !fixMissingLang &&
        !ensure404 &&
        !rawNavOrder
      ) {
        throw new AgentSiteToolError(
          'specify at least one polish action: preset, tokens, pageMeta, fixMissingLang, ensure404, or navOrder',
        )
      }

      // Validate all pageMeta entries upfront
      const validatedPageMeta = rawPageMeta.map(entry => {
        const page = resolveExistingPage(ctx, entry.page)
        return {
          page,
          title: str(entry.title),
          head: parsePageHeadPatch(entry),
        }
      })

      // Validate navOrder upfront
      let normalizedNavOrder: string[] | null = null
      if (rawNavOrder) {
        const currentOrder = orderedPages(ctx.document).map(p => p.path)
        const resolved = rawNavOrder.map(item => resolveExistingPage(ctx, item))
        const unique = new Set(resolved)
        if (unique.size !== currentOrder.length || resolved.length !== currentOrder.length) {
          throw new AgentSiteToolError(
            `navOrder must include every existing page exactly once (${currentOrder.join(', ')})`,
          )
        }
        normalizedNavOrder = resolved
      }

      const beforeReport = runPreflightAudit({
        document: ctx.document,
        selectedPage: ctx.selectedPage,
        findings: ctx.checkSite(),
        material: ctx.material,
      })

      let workingDoc: SiteDocument = {
        ...ctx.document,
        pages: { ...ctx.document.pages },
        manifest: { ...ctx.document.manifest, pages: [...ctx.document.manifest.pages] },
      }
      const appliedActions: string[] = []
      let mutated = false

      // 1. Apply Design Tokens / Preset
      let finalTokens = readDesignTokens(workingDoc.styles)
      if (preset || rawTokens) {
        const baseTokens = preset ? { ...preset.tokens } : { ...finalTokens }
        const merged: Partial<DesignTokens> = {
          ...baseTokens,
          ...(rawTokens
            ? {
                ...(str(rawTokens.ground) ? { ground: str(rawTokens.ground) } : {}),
                ...(str(rawTokens.surface) ? { surface: str(rawTokens.surface) } : {}),
                ...(str(rawTokens.ink) ? { ink: str(rawTokens.ink) } : {}),
                ...(str(rawTokens.inkSoft) ? { inkSoft: str(rawTokens.inkSoft) } : {}),
                ...(str(rawTokens.accent) ? { accent: str(rawTokens.accent) } : {}),
                ...(str(rawTokens.displayFont) ? { displayFont: str(rawTokens.displayFont) } : {}),
                ...(str(rawTokens.bodyFont) ? { bodyFont: str(rawTokens.bodyFont) } : {}),
                ...(str(rawTokens.monoFont) ? { monoFont: str(rawTokens.monoFont) } : {}),
                ...(num(rawTokens.measureCh) !== undefined ? { measureCh: num(rawTokens.measureCh) } : {}),
                ...(num(rawTokens.radiusPx) !== undefined ? { radiusPx: num(rawTokens.radiusPx) } : {}),
                ...(num(rawTokens.rhythmScale) !== undefined ? { rhythmScale: num(rawTokens.rhythmScale) } : {}),
              }
            : {}),
        }
        finalTokens = sanitizeDesignTokens(merged)
        const nextCss = withDesignTokens(workingDoc.styles, finalTokens)
        if (nextCss !== workingDoc.styles) {
          const res = ctx.writeStyles(nextCss, { baseHash: currentSiteHash })
          currentSiteHash = res.hash
          currentPageHashes = res.pageHashes
          workingDoc = { ...workingDoc, styles: nextCss }
          if (res.changed) mutated = true
          if (preset) appliedActions.push(`preset:${preset.id}`)
          if (rawTokens) appliedActions.push('customTokens')
        }
      }

      // 2. Apply missing lang fix + batch pageMeta updates (merged per page so each page writes once)
      const perPageEdits = new Map<
        string,
        { title?: string; head: Partial<PageHeadMeta> }
      >()

      if (fixMissingLang) {
        for (const page of Object.keys(workingDoc.pages)) {
          const head = readPageHead(workingDoc.pages[page] ?? '')
          if (!head.lang) {
            perPageEdits.set(page, { head: { lang: fixMissingLang } })
          }
        }
      }

      for (const item of validatedPageMeta) {
        const existing = perPageEdits.get(item.page) ?? { head: {} }
        if (item.title) existing.title = item.title
        if (item.head) existing.head = { ...existing.head, ...item.head }
        perPageEdits.set(item.page, existing)
      }

      for (const [page, edit] of perPageEdits.entries()) {
        let nextHtml = workingDoc.pages[page] ?? ''
        if (edit.title) nextHtml = setPageTitleInHtml(nextHtml, edit.title)
        if (Object.keys(edit.head).length > 0) {
          nextHtml = updatePageHead(nextHtml, edit.head)
        }
        if (nextHtml !== workingDoc.pages[page]) {
          const pageBaseHash = currentPageHashes[page]
          const res = ctx.writePage(
            page,
            nextHtml,
            pageBaseHash ? { baseHash: pageBaseHash, page } : {},
          )
          currentSiteHash = res.hash
          currentPageHashes = res.pageHashes
          workingDoc = writePageIn(workingDoc, page, nextHtml)
          if (res.changed) mutated = true
          appliedActions.push(`pageMeta:${page}`)
        }
      }

      // 3. Reorder navigation via movePage swaps
      if (normalizedNavOrder) {
        const liveOrder = orderedPages(workingDoc).map(p => p.path)
        for (let targetIdx = 0; targetIdx < normalizedNavOrder.length; targetIdx += 1) {
          const desired = normalizedNavOrder[targetIdx]!
          const currentIdx = liveOrder.indexOf(desired)
          if (currentIdx >= 0 && currentIdx !== targetIdx) {
            const res = ctx.movePage(currentIdx, targetIdx, { baseHash: currentSiteHash })
            currentSiteHash = res.hash
            currentPageHashes = res.pageHashes
            workingDoc = movePageIn(workingDoc, currentIdx, targetIdx)
            const [moved] = liveOrder.splice(currentIdx, 1)
            liveOrder.splice(targetIdx, 0, moved!)
            if (res.changed) mutated = true
          }
        }
        appliedActions.push('reorderNav')
      }

      // 4. Optional 404.html creation (after navOrder so navOrder validation stays exact)
      if (ensure404 && !workingDoc.pages['404.html']) {
        const html404 = starter404Html(workingDoc.title)
        const res = ctx.addPage(
          { path: '404.html', title: `Page not found · ${workingDoc.title}`, html: html404 },
          { baseHash: currentSiteHash },
        )
        currentSiteHash = res.hash
        currentPageHashes = res.pageHashes
        workingDoc = addPageIn(workingDoc, {
          path: '404.html',
          title: `Page not found · ${workingDoc.title}`,
          html: html404,
        })
        if (res.changed) mutated = true
        appliedActions.push('ensure404')
      }

      const afterFindings = computeFindingsForDoc(ctx, workingDoc)
      const afterReport = runPreflightAudit({
        document: workingDoc,
        selectedPage: ctx.selectedPage,
        findings: afterFindings,
        material: ctx.material,
      })

      const bodyRatio = contrastRatio(finalTokens.ink, finalTokens.ground)
      const mutedRatio = contrastRatio(finalTokens.inkSoft, finalTokens.ground)

      return {
        mutated,
        summary: `Polished site (${appliedActions.join(', ') || 'no changes'}): preflight ${beforeReport.score} → ${afterReport.score}/100, hash ${currentSiteHash}.`,
        data: {
          hash: currentSiteHash,
          pageHashes: currentPageHashes,
          changed: mutated,
          appliedActions,
          beforeScore: beforeReport.score,
          afterScore: afterReport.score,
          afterGrade: afterReport.grade,
          tokens: finalTokens,
          contrast: {
            bodyRatio: Number(bodyRatio.toFixed(2)),
            bodyGrade: wcagGrade(bodyRatio),
            mutedRatio: Number(mutedRatio.toFixed(2)),
            mutedGrade: wcagGrade(mutedRatio),
          },
          navOrder: orderedPages(workingDoc).map(p => p.path),
        },
      }
    },
  }),

  // 6. Pre-Build & Pre-Publish Readiness Check (Read)
  defineAppFunction<SiteAgentToolContext>({
    name: 'fn_prePublishReadinessCheck',
    category: 'build',
    risk: 'read',
    requiresApproval: false,
    replaces: ['checkSite', 'getSiteMap', 'listCollections', 'getSiteContext'],
    description:
      'Run a complete pre-build and pre-publish readiness check in one call: combines checkSite findings, preview verification state, preflight SEO/accessibility score, link/journey/contradiction lenses, planned build/ file manifest and unused assets, collection storage requirements, and published record status. Publishing itself remains human-only in the Publish dialog.',
    inputSchema: {
      type: 'object',
      properties: {
        includeFileManifest: {
          type: 'boolean',
          description: 'Include every planned file entry in build/ (default true).',
        },
        includeLlmsPreview: {
          type: 'boolean',
          description: 'Include generated llms.txt preview text (default false).',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const includeFileManifest = args.includeFileManifest !== false
      const includeLlmsPreview = args.includeLlmsPreview === true
      const doc = ctx.document
      const findings = ctx.checkSite()
      const graph = linkGraph(doc)
      const availableAssets = (ctx.material ?? []).map(item => item.name)
      const buildPlan = planBuild(doc, availableAssets)
      const preflight = runPreflightAudit({
        document: doc,
        selectedPage: ctx.selectedPage,
        findings,
        material: ctx.material,
      })
      const collectionFindings = checkCollections(doc.collections)
      const provider = dataProviderFor(ctx.serviceId)
      const home = doc.manifest.pages[0] ?? 'index.html'
      const journeySummary = siteJourneys(graph, home, doc.manifest.goal ?? null)
      const healthNotes = siteHealth(doc, graph)
      const dateContradictions = contradictions(statedFacts(doc))

      const blockers: string[] = []
      const warnings: string[] = []

      if (!ctx.documentPath) {
        blockers.push('Site has not been saved to a .site package yet (call saveSite first).')
      }
      if (ctx.verification.state !== 'verified') {
        blockers.push(
          `Preview verification is "${ctx.verification.state}": ${ctx.verification.reasons.join('; ') || 're-check with PureSite visible before building'}.`,
        )
      }
      for (const f of findings) {
        if (f.severity === 'error') blockers.push(`[${f.code}] ${f.message}`)
        else warnings.push(`[${f.code}] ${f.message}`)
      }
      for (const cf of collectionFindings) {
        if (cf.severity === 'error') blockers.push(`[collection:${cf.code}] ${cf.message}`)
        else warnings.push(`[collection:${cf.code}] ${cf.message}`)
      }
      for (const item of preflight.items) {
        if (item.severity === 'error' && !item.id.startsWith('build:')) {
          warnings.push(`[preflight:${item.category}] ${item.title}`)
        }
      }
      if (dateContradictions.length > 0) {
        warnings.push(
          `${dateContradictions.length} cross-page date contradiction(s) detected (${dateContradictions.map(c => c.about).join(', ')}).`,
        )
      }
      if (journeySummary.stranded.length > 0) {
        warnings.push(
          `${journeySummary.stranded.length} page(s) cannot reach goal "${journeySummary.goal}": ${journeySummary.stranded.join(', ')}.`,
        )
      }

      const readyToBuild = blockers.length === 0

      return {
        mutated: false,
        summary: `Pre-publish readiness: ${readyToBuild ? 'READY TO BUILD' : `BLOCKED (${blockers.length} blocker(s))`}, preflight ${preflight.score}/100 (${preflight.grade}), ${buildPlan.pages} page(s), ${buildPlan.assets.length} asset(s).`,
        data: {
          hash: ctx.hash,
          readyToBuild,
          blockers,
          warnings,
          verification: {
            state: ctx.verification.state,
            reasons: ctx.verification.reasons,
          },
          preflight: {
            score: preflight.score,
            grade: preflight.grade,
            counts: preflight.counts,
            weight: preflight.weight,
          },
          buildPlan: {
            pages: buildPlan.pages,
            assets: buildPlan.assets,
            unusedAssets: buildPlan.unusedAssets,
            totalBytes: buildPlan.totalBytes,
            ...(includeFileManifest ? { files: buildPlan.files } : {}),
          },
          lenses: {
            promisedPages: graph.promised.map(p => p.path),
            orphans: graph.orphans,
            headerDriftPages: healthNotes
              .filter(n => n.kind === 'drift')
              .map(n => n.page),
            dateContradictions,
            strandedFromGoal: journeySummary.stranded,
          },
          collections: {
            count: doc.collections.length,
            storage: provider
              ? {
                  host: provider.id,
                  requiresAccount: provider.requiresAccount,
                  note: provider.accountNote,
                }
              : { host: null, note: 'The chosen host does not store records.' },
          },
          published: doc.manifest.published
            ? {
                service: doc.manifest.published.service,
                url: doc.manifest.published.url ?? null,
                at: doc.manifest.published.at ?? null,
              }
            : null,
          ...(includeLlmsPreview ? { llmsTxtPreview: llmsText(doc, graph) } : {}),
          publishNote:
            'Publishing is human-only: once readyToBuild is true, run buildSite to write build/ and let the person publish from the Publish dialog.',
        },
      }
    },
  }),
] as const
