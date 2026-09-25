/**
 * The links in the content ARE the site map.
 *
 * A site is not a list of pages with a menu bolted on: it is a body of writing
 * that points at itself. This module reads every page's links and answers the
 * questions the old page list used to: what exists, what is promised by a link
 * and not built yet, what nothing points at, and — for a page that is still a
 * promise — the sentences that promised it, so building it starts from what it
 * was said to be.
 *
 * Everything here is pure: the board, the map and the agent tools all read the
 * same graph, so they cannot disagree about what the site is.
 */
import { DEFAULT_HOME_PAGE } from '../constants'
import { resolvePagePath } from './preview'
import type { SiteDocument } from './siteDocument'

/** One link, as written, with where it sits and where it points. */
export interface SiteLink {
  /** The page holding the link. */
  fromPage: string
  /** The href exactly as authored. */
  href: string
  /** The page path it resolves to, inside this site. */
  target: string
  /** What a reader sees and clicks, with any markup stripped. */
  text: string
  /** The link sits in the site header or a nav, so every page carries it. */
  inNav: boolean
}

/** A page some link points at, which has not been built. */
export interface PromisedPage {
  /** Where it would live. */
  path: string
  /** Every link that promises it, in page order. */
  promises: SiteLink[]
  /** A title taken from how the links name it. */
  title: string
  /** It is promised by a header or nav link, so it is missing from every page. */
  inNav: boolean
}

/** What the links say the site is. */
export interface SiteLinkGraph {
  /** Every internal link on every page. */
  links: SiteLink[]
  /** Pages that exist, in document order. */
  pages: string[]
  /** Pages a link promises that do not exist yet. */
  promised: PromisedPage[]
  /** Existing pages no other page links to (the home page is never one). */
  orphans: string[]
}

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
const HEADER_OR_NAV = /<(header|nav)\b[^>]*>[\s\S]*?<\/\1>/gi

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}=("|')([^"']*)\\1`, 'i'))
  return match ? match[2]! : ''
}

/** The words a reader actually sees inside the anchor. */
function linkText(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Character ranges of the page's header and nav elements. */
function chromeRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const match of html.matchAll(HEADER_OR_NAV)) {
    if (match.index === undefined) continue
    ranges.push([match.index, match.index + match[0].length])
  }
  return ranges
}

/**
 * Every internal link on one page.
 *
 * Assets and the shared stylesheet are referenced, not linked: a picture that
 * is missing is a problem to fix, never a page to write, so they are left to
 * the checker.
 */
export function pageLinks(html: string, fromPage: string): SiteLink[] {
  const chrome = chromeRanges(html)
  const links: SiteLink[] = []
  for (const match of html.matchAll(ANCHOR)) {
    const href = attribute(match[1]!, 'href')
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//') || href.startsWith('#')) continue
    if (href.startsWith('assets/') || href.includes('styles/site.css')) continue
    const target = resolvePagePath(fromPage, href)
    if (!target) continue
    const at = match.index ?? 0
    links.push({
      fromPage,
      href,
      target,
      text: linkText(match[2] ?? ''),
      inNav: chrome.some(([start, end]) => at >= start && at < end),
    })
  }
  return links
}

/**
 * Name a promised page from the way its links speak about it.
 *
 * The longest link text usually carries the most meaning ("the eligibility
 * criteria" over "here"), and a link that says nothing useful falls back to
 * the path, which at least matches the address a reader would see.
 */
export function titleForPromise(path: string, promises: SiteLink[]): string {
  const texts = promises
    .map(link => link.text)
    .filter(text => text.length > 1 && !/^(here|this|link|read more|more)$/i.test(text))
    .sort((a, b) => b.length - a.length)
  const chosen = texts[0]
  if (chosen) return chosen.charAt(0).toUpperCase() + chosen.slice(1)
  const segment = path.replace(/\/index\.html$/, '').split('/').pop() ?? path
  const words = segment.replace(/\.html$/, '').replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : path
}

/** Read the whole site as a graph of what points at what. */
export function linkGraph(document: SiteDocument): SiteLinkGraph {
  const pages = Object.keys(document.pages)
  const known = new Set(pages)
  const links: SiteLink[] = []
  for (const page of pages) links.push(...pageLinks(document.pages[page] ?? '', page))

  const promisedBy = new Map<string, SiteLink[]>()
  const pointedAt = new Set<string>()
  for (const link of links) {
    if (known.has(link.target)) {
      if (link.target !== link.fromPage) pointedAt.add(link.target)
      continue
    }
    promisedBy.set(link.target, [...(promisedBy.get(link.target) ?? []), link])
  }

  const promised: PromisedPage[] = [...promisedBy.entries()]
    .map(([path, promises]) => ({
      path,
      promises,
      title: titleForPromise(path, promises),
      inNav: promises.some(link => link.inNav),
    }))
    .sort((a, b) => b.promises.length - a.promises.length || a.path.localeCompare(b.path))

  const home = document.manifest.pages[0]
  const orphans = pages.filter(page => page !== home && !pointedAt.has(page))

  return { links, pages, promised, orphans }
}

/** What one page links to, and what links to it. */
export function linksForPage(
  graph: SiteLinkGraph,
  page: string,
): { out: SiteLink[]; in: SiteLink[]; promises: SiteLink[] } {
  const known = new Set(graph.pages)
  const out = graph.links.filter(link => link.fromPage === page)
  return {
    out: out.filter(link => known.has(link.target)),
    promises: out.filter(link => !known.has(link.target)),
    in: graph.links.filter(link => link.target === page && link.fromPage !== page),
  }
}

/** The promise for one path, if it is one. */
export function promiseFor(graph: SiteLinkGraph, path: string): PromisedPage | null {
  return graph.promised.find(entry => entry.path === path) ?? null
}

/**
 * What a page was promised to be, in words, for whoever builds it.
 *
 * Only what the site already says: the sentences that link to it and where
 * they sit. Nothing is invented here, so a page built from this brief can be
 * checked against the pages that asked for it.
 */
export function promiseBrief(document: SiteDocument, promise: PromisedPage): string {
  const lines = promise.promises.map(link => {
    const from = link.fromPage === document.manifest.pages[0] ? 'the home page' : link.fromPage
    const where = link.inNav ? 'the site header' : from
    return `- “${link.text || link.href}” in ${where}`
  })
  const navLine = promise.inNav
    ? '\nIt is in the header of every page, so every page currently promises it.'
    : ''
  return [
    `Build ${promise.path}, promised by ${promise.promises.length === 1 ? 'one link' : `${promise.promises.length} links`}:`,
    ...lines,
    navLine,
    'Use the same header, footer and styles as the pages that link to it. Say only what those pages already say; ask rather than invent anything else.',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Make a promised link plain text.
 *
 * A link to a page that was never built is a note to the person writing the
 * site, not a trapdoor for its readers. So the editor shows it dotted, and
 * everything that leaves the app — the build, the publish — keeps the words
 * and drops the anchor. Nobody ever clicks through to a 404, and the sentence
 * still reads.
 */
export function shipPage(html: string, page: string, existing: Iterable<string>): string {
  const known = new Set(existing)
  return html.replace(ANCHOR, (whole, attrs: string, inner: string) => {
    const href = attribute(attrs, 'href')
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return whole
    if (href.startsWith('assets/') || href.includes('styles/site.css')) return whole
    const target = resolvePagePath(page, href)
    if (!target || known.has(target)) return whole
    return inner
  })
}

/** Links that would be unwrapped on the way out, per page. */
export function promisedLinksAtBuild(
  pages: Record<string, string>,
): Array<{ page: string; link: SiteLink }> {
  const known = new Set(Object.keys(pages))
  const out: Array<{ page: string; link: SiteLink }> = []
  for (const [page, html] of Object.entries(pages)) {
    for (const link of pageLinks(html, page)) {
      if (!known.has(link.target)) out.push({ page, link })
    }
  }
  return out
}

/**
 * Send every link that promised one page at another page instead.
 *
 * The promise was made in sentences on real pages, so keeping it is editing
 * those sentences: each `href` is rewritten to reach the chosen page from
 * the page it sits on, the way that page would have written it by hand.
 */
export function repointPromise(
  pages: Record<string, string>,
  from: string,
  to: string,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [page, html] of Object.entries(pages)) {
    next[page] = html.replace(ANCHOR, (whole, attrs: string, inner: string) => {
      const href = attribute(attrs, 'href')
      if (!href || resolvePagePath(page, href) !== from) return whole
      return `<a${attrs.replace(
        new RegExp(`(\\bhref=)("|')${escapeForRegExp(href)}\\2`, 'i'),
        `$1$2${hrefFrom(page, to)}$2`,
      )}>${inner}</a>`
    })
  }
  return next
}

/**
 * Keep the words, drop the link, everywhere it was promised.
 *
 * For a promise nobody intends to keep: the sentence stays exactly as it
 * reads and stops pointing anywhere, so the page leaves the build list
 * without anything being written.
 */
export function unlinkPromise(
  pages: Record<string, string>,
  target: string,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [page, html] of Object.entries(pages)) {
    next[page] = html.replace(ANCHOR, (whole, attrs: string, inner: string) => {
      const href = attribute(attrs, 'href')
      if (!href || resolvePagePath(page, href) !== target) return whole
      return inner
    })
  }
  return next
}

/** How one page should write a link to another, as a person would. */
export function hrefFrom(fromPage: string, target: string): string {
  const up = fromPage.split('/').length - 1
  const prefix = '../'.repeat(up)
  const directory = target.endsWith(`/${DEFAULT_HOME_PAGE}`)
    ? target.slice(0, -DEFAULT_HOME_PAGE.length)
    : target === DEFAULT_HOME_PAGE
      ? ''
      : target
  return `${prefix}${directory}` || './'
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
