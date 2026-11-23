/**
 * Unified Live Pre-Flight Auditor for PureSite.
 *
 * Combines:
 * 1. SEO & Meta checks + Live Google Search & OpenGraph Social Card preview data
 * 2. Accessibility checks (lang, H1 structure, heading skips, image alt, empty links/buttons,
 *    WCAG 2.1 contrast on current design tokens)
 * 3. Responsive, build & payload health (checkSite findings, responsiveCheck layout reads,
 *    and page/asset weight budget)
 *
 * Every actionable finding carries a structured `fixAction` so the drawer can
 * apply a 1-click fix or jump directly to the relevant panel.
 */
import type { CheckFinding } from './buildSite'
import { contrastRatio, readDesignTokens, wcagGrade } from './designTokens'
import type { MaterialItem } from './material'
import { readPageHead } from './pages'
import { analyseLayout, type LayoutRead } from './responsiveCheck'
import { orderedPages, titleFromPage, urlPathFor, type SiteDocument } from './siteDocument'

export type AuditCategory = 'seo' | 'accessibility' | 'responsive'
export type AuditSeverity = 'error' | 'warning' | 'pass'

export type AuditFixAction =
  | { kind: 'set-lang'; page: string; lang: string; label: string }
  | { kind: 'add-404'; label: string }
  | { kind: 'open-seo'; page: string; label: string }
  | { kind: 'open-design'; label: string }
  | { kind: 'open-page'; page: string; label: string }

export interface AuditItem {
  id: string
  category: AuditCategory
  severity: AuditSeverity
  title: string
  detail: string
  page?: string
  fixAction?: AuditFixAction
}

export interface SearchPreview {
  page: string
  title: string
  url: string
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  siteName: string
}

export interface PreflightAuditReport {
  score: number
  grade: 'Ready' | 'Needs attention' | 'Fix before launch'
  counts: {
    errors: number
    warnings: number
    passes: number
  }
  items: AuditItem[]
  preview: SearchPreview
  weight: {
    htmlBytes: number
    cssBytes: number
    assetBytes: number
    totalBytes: number
  }
}

const ASSET_WARN_BYTES = 500 * 1024
const SITE_BUDGET_BYTES = 1500 * 1024

function parseDom(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString(html, 'text/html')
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function runPreflightAudit(input: {
  document: SiteDocument
  selectedPage: string
  findings: CheckFinding[]
  material?: MaterialItem[]
  layoutReads?: Record<string, LayoutRead | null>
}): PreflightAuditReport {
  const { document, selectedPage, findings, material = [], layoutReads = {} } = input
  const items: AuditItem[] = []
  const pages = orderedPages(document)
  const activePage = document.pages[selectedPage] !== undefined ? selectedPage : (pages[0]?.path ?? 'index.html')
  const activeHtml = document.pages[activePage] ?? ''
  const activeHead = readPageHead(activeHtml)
  const activeTitle = titleFromPage(activeHtml) || document.title || activePage

  const siteBaseUrl = document.manifest.published?.url?.replace(/\/+$/, '') || 'https://yoursite.purecloud.app'
  const pageUrl = `${siteBaseUrl}${urlPathFor(activePage)}`

  const preview: SearchPreview = {
    page: activePage,
    title: activeTitle,
    url: pageUrl,
    description:
      activeHead.description ||
      'Add a meta description (50–160 characters) so search engines show a clear summary here.',
    ogTitle: activeHead.ogTitle || activeTitle,
    ogDescription: activeHead.ogDescription || activeHead.description || 'No OpenGraph description set yet.',
    ogImage: activeHead.ogImage,
    siteName: document.title || 'PureSite',
  }

  // ---- 1. SEO & Meta ------------------------------------------------------
  if (!document.pages['404.html']) {
    items.push({
      id: 'seo:no-404',
      category: 'seo',
      severity: 'warning',
      title: 'No custom 404.html page',
      detail: 'Visitors hitting a mistyped URL will see a generic host error instead of your site navigation.',
      fixAction: { kind: 'add-404', label: 'Create 404.html' },
    })
  } else {
    items.push({
      id: 'seo:has-404',
      category: 'seo',
      severity: 'pass',
      title: 'Custom 404.html is present',
      detail: 'Missing paths fall back cleanly to your branded 404 page.',
    })
  }

  for (const page of pages) {
    const html = document.pages[page.path] ?? ''
    const head = readPageHead(html)
    const title = titleFromPage(html)

    if (!title) {
      items.push({
        id: `seo:missing-title:${page.path}`,
        category: 'seo',
        severity: 'error',
        title: `${page.path} is missing a <title>`,
        detail: 'Search results and browser tabs require a descriptive page title.',
        page: page.path,
        fixAction: { kind: 'open-page', page: page.path, label: 'Edit page' },
      })
    } else if (title.length > 65) {
      items.push({
        id: `seo:long-title:${page.path}`,
        category: 'seo',
        severity: 'warning',
        title: `${page.path} title is ${title.length} chars (over 65)`,
        detail: 'Google typically truncates titles longer than 60–65 characters.',
        page: page.path,
        fixAction: { kind: 'open-page', page: page.path, label: 'Shorten title' },
      })
    }

    if (!head.description) {
      items.push({
        id: `seo:no-desc:${page.path}`,
        category: 'seo',
        severity: 'warning',
        title: `${page.path} has no meta description`,
        detail: 'Add a 50–160 character summary so search snippets describe the page accurately.',
        page: page.path,
        fixAction: { kind: 'open-seo', page: page.path, label: 'Edit SEO' },
      })
    } else if (head.description.length > 165) {
      items.push({
        id: `seo:long-desc:${page.path}`,
        category: 'seo',
        severity: 'warning',
        title: `${page.path} meta description is ${head.description.length} chars`,
        detail: 'Keep meta descriptions under 160 characters to avoid mid-sentence truncation.',
        page: page.path,
        fixAction: { kind: 'open-seo', page: page.path, label: 'Edit SEO' },
      })
    }
  }

  if (activeHead.ogTitle || activeHead.ogDescription) {
    items.push({
      id: `seo:og-present:${activePage}`,
      category: 'seo',
      severity: 'pass',
      title: `OpenGraph tags configured on ${activePage}`,
      detail: 'Social cards have explicit title/description metadata.',
      page: activePage,
    })
  } else {
    items.push({
      id: `seo:og-missing:${activePage}`,
      category: 'seo',
      severity: 'warning',
      title: `No OpenGraph tags on ${activePage}`,
      detail: 'Add og:title and og:description so links preview cleanly when shared.',
      page: activePage,
      fixAction: { kind: 'open-seo', page: activePage, label: 'Edit SEO' },
    })
  }

  // ---- 2. Accessibility ---------------------------------------------------
  let missingLangCount = 0
  let headingIssues = 0
  let missingAltCount = 0
  let emptyInteractiveCount = 0

  for (const page of pages) {
    const html = document.pages[page.path] ?? ''
    const head = readPageHead(html)
    if (!head.lang) {
      missingLangCount += 1
      items.push({
        id: `a11y:lang:${page.path}`,
        category: 'accessibility',
        severity: 'error',
        title: `${page.path} is missing <html lang="…">`,
        detail: 'Screen readers rely on the document language attribute for pronunciation.',
        page: page.path,
        fixAction: { kind: 'set-lang', page: page.path, lang: 'en', label: 'Set lang="en"' },
      })
    }

    const dom = parseDom(html)
    if (dom?.body) {
      const h1s = Array.from(dom.body.querySelectorAll('h1'))
      if (h1s.length === 0) {
        headingIssues += 1
        items.push({
          id: `a11y:no-h1:${page.path}`,
          category: 'accessibility',
          severity: 'warning',
          title: `${page.path} has no <h1> heading`,
          detail: 'Each page should have one primary <h1> naming its main topic.',
          page: page.path,
          fixAction: { kind: 'open-page', page: page.path, label: 'Open page' },
        })
      } else if (h1s.length > 1) {
        headingIssues += 1
        items.push({
          id: `a11y:multi-h1:${page.path}`,
          category: 'accessibility',
          severity: 'warning',
          title: `${page.path} has ${h1s.length} <h1> headings`,
          detail: 'Keep a single <h1> per page and use <h2>–<h4> for sub-sections.',
          page: page.path,
          fixAction: { kind: 'open-page', page: page.path, label: 'Open page' },
        })
      }

      const headings = Array.from(dom.body.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h =>
        Number(h.tagName.slice(1)),
      )
      for (let i = 1; i < headings.length; i += 1) {
        if (headings[i]! > headings[i - 1]! + 1) {
          headingIssues += 1
          items.push({
            id: `a11y:heading-skip:${page.path}:${i}`,
            category: 'accessibility',
            severity: 'warning',
            title: `${page.path} skips heading level h${headings[i - 1]} → h${headings[i]}`,
            detail: 'Avoid skipping heading ranks so outline navigation stays predictable.',
            page: page.path,
            fixAction: { kind: 'open-page', page: page.path, label: 'Open page' },
          })
          break
        }
      }

      const imgsWithoutAlt = Array.from(dom.body.querySelectorAll('img')).filter(
        img => !img.hasAttribute('alt'),
      )
      if (imgsWithoutAlt.length) {
        missingAltCount += imgsWithoutAlt.length
        items.push({
          id: `a11y:img-alt:${page.path}`,
          category: 'accessibility',
          severity: 'error',
          title: `${page.path} has ${imgsWithoutAlt.length} image${imgsWithoutAlt.length === 1 ? '' : 's'} missing alt`,
          detail: 'Every <img> needs an alt description (or alt="" for purely decorative images).',
          page: page.path,
          fixAction: { kind: 'open-page', page: page.path, label: 'Inspect page' },
        })
      }

      const emptyControls = Array.from(dom.body.querySelectorAll('a[href], button')).filter(el => {
        const text = (el.textContent ?? '').trim()
        const aria = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '').trim()
        const imgAlt = el.querySelector('img[alt]')?.getAttribute('alt')?.trim() ?? ''
        return !text && !aria && !imgAlt
      })
      if (emptyControls.length) {
        emptyInteractiveCount += emptyControls.length
        items.push({
          id: `a11y:empty-interactive:${page.path}`,
          category: 'accessibility',
          severity: 'error',
          title: `${page.path} has ${emptyControls.length} unlabelled link/button${emptyControls.length === 1 ? '' : 's'}`,
          detail: 'Give every link and button visible text or an aria-label.',
          page: page.path,
          fixAction: { kind: 'open-page', page: page.path, label: 'Inspect page' },
        })
      }
    }
  }

  if (missingLangCount === 0) {
    items.push({
      id: 'a11y:lang-ok',
      category: 'accessibility',
      severity: 'pass',
      title: 'Document language declared on every page',
      detail: 'All pages include a valid lang attribute on <html>.',
    })
  }
  if (headingIssues === 0) {
    items.push({
      id: 'a11y:headings-ok',
      category: 'accessibility',
      severity: 'pass',
      title: 'Heading hierarchy is clean',
      detail: 'Every page has one <h1> and no skipped heading levels.',
    })
  }
  if (missingAltCount === 0 && emptyInteractiveCount === 0) {
    items.push({
      id: 'a11y:media-controls-ok',
      category: 'accessibility',
      severity: 'pass',
      title: 'Images and interactive controls are labelled',
      detail: 'No missing alt attributes or unlabelled links/buttons detected.',
    })
  }

  // Design tokens WCAG 2.1 contrast checks
  const tokens = readDesignTokens(document.styles)
  const bodyRatio = contrastRatio(tokens.ink, tokens.ground)
  const bodyGrade = wcagGrade(bodyRatio)
  const mutedRatio = contrastRatio(tokens.inkSoft, tokens.ground)
  const mutedGrade = wcagGrade(mutedRatio)

  if (bodyGrade === 'Fail') {
    items.push({
      id: 'a11y:contrast-body',
      category: 'accessibility',
      severity: 'error',
      title: `Body contrast fails WCAG AA (${bodyRatio.toFixed(1)}:1)`,
      detail: `Ink ${tokens.ink} on background ${tokens.ground} needs at least 4.5:1.`,
      fixAction: { kind: 'open-design', label: 'Fix in Design' },
    })
  } else {
    items.push({
      id: 'a11y:contrast-body-ok',
      category: 'accessibility',
      severity: 'pass',
      title: `Body contrast passes WCAG ${bodyGrade} (${bodyRatio.toFixed(1)}:1)`,
      detail: `Ink ${tokens.ink} on ${tokens.ground} meets accessibility contrast targets.`,
    })
  }

  if (mutedGrade === 'Fail') {
    items.push({
      id: 'a11y:contrast-muted',
      category: 'accessibility',
      severity: 'warning',
      title: `Muted ink contrast is low (${mutedRatio.toFixed(1)}:1)`,
      detail: `Muted ink ${tokens.inkSoft} on ${tokens.ground} should be at least 4.5:1 for small text.`,
      fixAction: { kind: 'open-design', label: 'Adjust in Design' },
    })
  }

  // ---- 3. Responsive, Build & Weight Budget -------------------------------
  for (let i = 0; i < findings.length; i += 1) {
    const f = findings[i]!
    items.push({
      id: `build:${f.code}:${f.page ?? 'site'}:${i}`,
      category: 'responsive',
      severity: f.severity,
      title: f.message,
      detail: f.fix,
      ...(f.page ? { page: f.page, fixAction: { kind: 'open-page', page: f.page, label: 'Open page' } } : {}),
    })
  }

  for (const [label, read] of Object.entries(layoutReads)) {
    if (!read) continue
    for (let i = 0; i < analyseLayout(read).length; i += 1) {
      const lf = analyseLayout(read)[i]!
      items.push({
        id: `layout:${label}:${lf.code}:${i}`,
        category: 'responsive',
        severity: lf.code === 'sideways-scroll' || lf.code === 'nav-links-hidden' ? 'error' : 'warning',
        title: `[${lf.width}px] ${lf.message}`,
        detail: lf.fix,
      })
    }
  }

  const htmlBytes = Object.values(document.pages).reduce((sum, html) => sum + byteLength(html), 0)
  const cssBytes = byteLength(document.styles)
  const assetBytes = material.reduce((sum, item) => sum + (item.bytes ?? 0), 0)
  const totalBytes = htmlBytes + cssBytes + assetBytes

  const heavyAssets = material.filter(item => (item.bytes ?? 0) > ASSET_WARN_BYTES)
  if (heavyAssets.length) {
    items.push({
      id: 'perf:heavy-assets',
      category: 'responsive',
      severity: 'warning',
      title: `${heavyAssets.length} asset${heavyAssets.length === 1 ? '' : 's'} exceed 500 KB`,
      detail: `Compress ${heavyAssets.map(a => a.name).slice(0, 3).join(', ')} for faster mobile loads.`,
    })
  } else if (totalBytes > SITE_BUDGET_BYTES) {
    items.push({
      id: 'perf:site-budget',
      category: 'responsive',
      severity: 'warning',
      title: `Total site bundle is ${Math.round(totalBytes / 1024)} KB (budget 1500 KB)`,
      detail: 'Consider compressing large images or removing unused assets before publishing.',
    })
  } else {
    items.push({
      id: 'perf:budget-ok',
      category: 'responsive',
      severity: 'pass',
      title: `Lightweight bundle (${Math.max(1, Math.round(totalBytes / 1024))} KB)`,
      detail: 'HTML, CSS, and assets sit well inside the fast-load payload budget.',
    })
  }

  if (findings.filter(f => f.severity === 'error').length === 0) {
    items.push({
      id: 'build:clean',
      category: 'responsive',
      severity: 'pass',
      title: 'No blocking link or stylesheet errors',
      detail: 'Every page links styles/site.css cleanly and resolves its assets.',
    })
  }

  const errors = items.filter(item => item.severity === 'error').length
  const warnings = items.filter(item => item.severity === 'warning').length
  const passes = items.filter(item => item.severity === 'pass').length

  const rawScore = 100 - errors * 16 - warnings * 5
  const score = Math.max(0, Math.min(100, rawScore))
  const grade: PreflightAuditReport['grade'] =
    errors > 0 ? 'Fix before launch' : score >= 90 ? 'Ready' : 'Needs attention'

  return {
    score,
    grade,
    counts: { errors, warnings, passes },
    items,
    preview,
    weight: { htmlBytes, cssBytes, assetBytes, totalBytes },
  }
}
