/**
 * Turning the package into a folder a static host will serve.
 *
 * Phase one has no bundler and wants none: a static site is already the thing
 * that gets published, so building is copying the pages, the stylesheet and
 * the assets a page actually references into `build/`, and reporting what
 * that came to. The moment a site needs compiling it needs a toolchain, and a
 * toolchain needs the privileged layer — a different phase with a different
 * risk profile.
 */
import { siteFontFiles } from './siteFoundation'
import { SITE_STYLESHEET } from '../constants'
import { stylesheetLinkState } from './preview'
import { localAssetReferences } from './siteReferences'
import {
  orderedPages,
  relativePrefix,
  urlPathFor,
  type SiteDocument,
} from './siteDocument'

export interface BuiltFile {
  /** Path inside `build/`, which is also the path on the host. */
  path: string
  bytes: number
}

export interface BuildResult {
  files: BuiltFile[]
  pages: number
  assets: string[]
  /** Assets in the package that are unused and excluded from output. */
  unusedAssets: string[]
  totalBytes: number
}

/**
 * What the build will contain, computed without writing anything.
 *
 * Separated from the writing so the publish dialog can show the shape of a
 * build before it starts, and so this is testable without a filesystem.
 */
export function planBuild(
  document: SiteDocument,
  availableAssets: string[],
): BuildResult {
  const files: BuiltFile[] = []
  availableAssets = [...new Set([...availableAssets, ...siteFontFiles(document.styles)])]
  for (const page of orderedPages(document)) {
    files.push({ path: page.path, bytes: new TextEncoder().encode(document.pages[page.path] ?? '').length })
  }
  files.push({ path: SITE_STYLESHEET, bytes: new TextEncoder().encode(document.styles).length })
  const used = new Set(requiredAssetNames(document))
  const assets = [...used].filter(name => availableAssets.includes(name))
  for (const name of assets) files.push({ path: `assets/${name}`, bytes: 0 })

  return {
    files,
    pages: Object.keys(document.pages).length,
    assets,
    unusedAssets: availableAssets.filter(name => !used.has(name)),
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  }
}

/** The asset paths that can ship; reference-only and unused files are excluded. */
export function requiredAssetNames(document: SiteDocument): string[] {
  const references = new Set((document.manifest.assets ?? []).filter(asset => asset.role === 'reference').map(asset => asset.name))
  const used = new Set<string>()
  for (const [page, html] of Object.entries(document.pages)) {
    for (const path of localAssetReferences(html, page)) if (path.startsWith('assets/')) used.add(path.slice('assets/'.length))
  }
  for (const path of localAssetReferences(document.styles, SITE_STYLESHEET)) if (path.startsWith('assets/')) used.add(path.slice('assets/'.length))
  return [...used].filter(name => !references.has(name)).sort()
}

export type CheckSeverity = 'error' | 'warning'

export interface CheckFinding {
  severity: CheckSeverity
  code: string
  message: string
  /** What to do instead. */
  fix: string
  page?: string
}

export function hasBlockingFinding(findings: CheckFinding[]): boolean {
  return findings.some(finding => finding.severity === 'error')
}

/**
 * What will be wrong once it is live.
 *
 * A site fails in ways a deck does not: a link that goes nowhere, an image
 * that is referenced but was never added, a page nobody can reach because it
 * is in no nav and no other page points at it. None of these are visible while
 * you are looking at the page that works.
 */
export function checkSite(
  document: SiteDocument,
  availableAssets: string[],
  linksByPage: Record<string, string[]>,
): CheckFinding[] {
  const findings: CheckFinding[] = []
  const pages = Object.keys(document.pages)
  availableAssets = [...new Set([...availableAssets, ...siteFontFiles(document.styles)])]

  if (!pages.includes('index.html')) {
    findings.push({
      severity: 'error',
      code: 'no-home',
      message: 'the site has no index.html',
      fix: 'add a page called index.html — it is what a host serves at /',
    })
  }

  for (const page of pages) {
    const html = document.pages[page] ?? ''

    if (!/<title[^>]*>\s*\S/i.test(html)) {
      findings.push({
        severity: 'warning',
        code: 'no-title',
        message: `${page} has no title`,
        fix: 'give the page a <title> — it names the tab and the rail entry',
        page,
      })
    }

    if (!/name=("|')viewport\1/i.test(html)) {
      findings.push({
        severity: 'warning',
        code: 'no-viewport',
        message: `${page} has no viewport meta`,
        fix: 'add <meta name="viewport" content="width=device-width, initial-scale=1"> or it renders zoomed out on a phone',
        page,
      })
    }

    // The stylesheet is resolved the way the host resolves it. A link with
    // the wrong number of ../ is the classic nested-page bug: the preview
    // used to paper over it by inlining any link that mentioned site.css,
    // and the page shipped unstyled. Now the preview shows it unstyled too,
    // and this says why.
    const stylesheet = stylesheetLinkState(html, page)
    for (const link of stylesheet.broken) {
      findings.push({
        severity: 'error',
        code: 'broken-stylesheet',
        message: `${page} links its stylesheet as ${link.href}, which from ${urlPathFor(page)} is /${link.resolved} — a file that does not exist`,
        fix: `link it as ${relativePrefix(page)}${SITE_STYLESHEET} — one ../ for each folder the page sits in. It previews unstyled because it will ship unstyled`,
        page,
      })
    }
    if (!stylesheet.linked && !stylesheet.ownStyles && !stylesheet.broken.length) {
      findings.push({
        severity: 'warning',
        code: 'no-stylesheet',
        message: `${page} does not link the site stylesheet and has no styles of its own`,
        fix: `add <link rel="stylesheet" href="${relativePrefix(page)}${SITE_STYLESHEET}"> in <head> — it ships exactly as unstyled as it previews`,
        page,
      })
    }

    findings.push(...checkRequiredAssets(document, availableAssets, html, page))

    // A link to a page nobody has built is a promise, not a break: the page
    // is one the writing says should exist. It never reaches a reader as a
    // dead end, because the build keeps the words and drops the anchor, so
    // this is worth saying and never worth blocking a publish for.
    for (const link of linksByPage[page] ?? []) {
      if (!pages.includes(link)) {
        findings.push({
          severity: 'warning',
          code: 'promised-page',
          message: `${page} promises ${urlPathFor(link)}, which is not built yet`,
          fix: 'build that page, or let the words ship as plain text',
          page,
        })
      }
    }
  }

  const reachable = new Set<string>([
    'index.html',
    ...document.manifest.pages,
    ...Object.values(linksByPage).flat(),
  ])
  for (const page of pages) {
    if (!reachable.has(page)) {
      findings.push({
        severity: 'warning',
        code: 'orphan-page',
        message: `${page} is in no nav and nothing links to it`,
        fix: 'add it to the nav order, or link to it from a page that is reachable',
        page,
      })
    }
  }

  findings.push(...checkRequiredAssets(document, availableAssets, document.styles, SITE_STYLESHEET))
  return findings
}

function checkRequiredAssets(document: SiteDocument, available: string[], source: string, fromFile: string): CheckFinding[] {
  const references = new Set(document.manifest.assets.filter(asset => asset.role === 'reference').map(asset => asset.name))
  return localAssetReferences(source, fromFile).flatMap(path => {
    if (!path.startsWith('assets/') && Object.hasOwn(document.pages, path)) return []
    const name = path.replace(/^assets\//, '')
    const excluded = references.has(name)
    if (path.startsWith('assets/') && available.includes(name) && !excluded) return []
    return [{
      severity: 'error' as const,
      code: excluded ? 'reference-asset' : 'missing-asset',
      message: `${fromFile} references ${path}, which is ${excluded ? 'reference-only material' : 'not in the package'}`,
      fix: excluded ? 'use a public content asset instead, or explicitly change this file’s role to content' : 'add the file, or point the reference at one that is there; check the relative path from this file',
      ...(fromFile === SITE_STYLESHEET ? {} : { page: fromFile }),
    }]
  })
}
