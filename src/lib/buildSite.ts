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
import { SITE_STYLESHEET } from '../constants'
import { referencedAssets, stylesheetLinkState } from './preview'
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
  /** Assets in the package that no page references — copied, but worth saying. */
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
  const used = new Set<string>()

  for (const page of orderedPages(document)) {
    const html = document.pages[page.path] ?? ''
    files.push({ path: page.path, bytes: html.length })
    for (const asset of referencedAssets(html)) used.add(asset)
  }

  files.push({ path: SITE_STYLESHEET, bytes: document.styles.length })

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

    for (const asset of referencedAssets(html)) {
      if (!availableAssets.includes(asset)) {
        findings.push({
          severity: 'error',
          code: 'missing-asset',
          message: `${page} references assets/${asset}, which is not in the package`,
          fix: 'add the file, or point the reference at one that is there',
          page,
        })
      }
    }

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

  return findings
}
