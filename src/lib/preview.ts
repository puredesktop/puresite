/**
 * The package holds real files. The preview inlines them. The build copies them.
 *
 * Every preview surface is a sandboxed `srcdoc` frame, and inside one a
 * relative `styles/site.css` or `assets/hero.png` resolves against the APP's
 * origin — a 404 for files sitting right there in the package. So at view
 * time, and only at view time, the stylesheet is inlined and asset references
 * are swapped for data URLs.
 *
 * The document on disk keeps its clean relative paths, which is the whole
 * point: what gets published is a normal static site that any host can serve,
 * not a pile of base64. PureVideo learned this the hard way in the other
 * direction — its logo rendered in the MP4 and broke on the board, because
 * only the render loaded files from the package.
 *
 * The rule that makes the preview honest: it resolves a reference THE WAY THE
 * HOST WILL. A stylesheet link is inlined only when it resolves, from the
 * page's own folder, to the one stylesheet the package has; a link with the
 * wrong number of `../` stays a link, 404s in the frame, and the page previews
 * unstyled — exactly as it would ship. A page with no link is not quietly
 * given the site's look either. What the preview cannot do — show an asset
 * too large to inline — it says (`oversizeAssets`), rather than looking fine.
 */
import { DEFAULT_HOME_PAGE, MAX_INLINE_BYTES, SITE_STYLESHEET } from '../constants'
import { relativePrefix } from './siteDocument'

/**
 * Asset references anywhere they can legally appear.
 *
 * `src=`/`href=` in markup, and `url()` in CSS, each with any depth of `../`
 * prefix, because a page in a subfolder reaches its assets that way and those
 * pages are exactly the ones a naive rewrite leaves broken.
 */
const ASSET_ATTR = /(src|href|poster)=("|')((?:\.\.\/)*)assets\/([^"']+)\2/g
const ASSET_CSS = /url\((?:"|')?((?:\.\.\/)*)assets\/([^"')]+)(?:"|')?\)/g
const LINK_TAG = /<link\b[^>]*>/gi
const DATA_ATTR = /(src|href|poster)=("|')(data:[^"']+)\2/g
const DATA_CSS = /url\((?:"|')?(data:[^"')]+)(?:"|')?\)/g

export interface PreviewInput {
  html: string
  styles: string
  /** Asset file name -> data URL, as the material grid already read them. */
  assets: Record<string, string>
  /** The page's path under `pages/`; decides how its relative links resolve. */
  page?: string
  /**
   * Every page that exists. Given these, each internal link is marked with
   * where it goes and whether that page is built, so the frame can show a
   * promise as a promise and hand a click back as navigation.
   */
  knownPages?: string[]
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}=("|')([^"']*)\\1`, 'i').exec(tag)
  return match ? match[2] : null
}

/**
 * Resolve a page-relative or root-relative reference to a package path, the
 * way a browser resolves it on the host: `..` climbs, and cannot climb past
 * the root. `null` for anything absolute or off-site.
 */
export function resolvePagePath(fromPage: string, href: string): string | null {
  if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//')) return null
  const clean = href.split(/[#?]/)[0]
  if (clean.startsWith('/')) return normalize(clean.replace(/^\//, ''))
  const base = fromPage.includes('/')
    ? fromPage.slice(0, fromPage.lastIndexOf('/') + 1)
    : ''
  return normalize(base + clean)
}

/** The `href` of every stylesheet link in a page, in document order. */
export function stylesheetLinks(html: string): string[] {
  const hrefs: string[] = []
  for (const match of html.matchAll(LINK_TAG)) {
    const tag = match[0]
    if (!/\brel=("|')stylesheet\1/i.test(tag)) continue
    const href = attribute(tag, 'href')
    if (href) hrefs.push(href)
  }
  return hrefs
}

export interface StylesheetLinkState {
  /** At least one link resolves to the site stylesheet. */
  linked: boolean
  /** Relative links that resolve to a file the package does not have. */
  broken: { href: string; resolved: string }[]
  /** The page carries a <style> of its own. */
  ownStyles: boolean
}

/**
 * How a page reaches the site stylesheet — as the host will see it.
 *
 * Only one stylesheet exists in the package, so any relative link that
 * resolves elsewhere is a link to a file that is not there. Off-site links
 * (a web font's CSS, say) are not this app's to judge.
 */
export function stylesheetLinkState(html: string, page: string): StylesheetLinkState {
  const state: StylesheetLinkState = {
    linked: false,
    broken: [],
    ownStyles: /<style[\s>]/i.test(html),
  }
  for (const href of stylesheetLinks(html)) {
    const resolved = resolvePagePath(page, href)
    if (resolved === null) continue
    if (resolved === SITE_STYLESHEET) state.linked = true
    else state.broken.push({ href, resolved })
  }
  return state
}

function inlineBudget(html: string, assets: Record<string, string>): number {
  let bytes = 0
  for (const name of referencedAssets(html)) bytes += assets[name]?.length ?? 0
  return bytes
}

/**
 * The assets a page references that the preview cannot show: together they
 * are past what one srcdoc can carry, so none are inlined and the frame
 * shows them broken. The build copies them regardless. `null` when the
 * page's assets fit.
 */
export function oversizeAssets(
  html: string,
  assets: Record<string, string>,
): { names: string[]; bytes: number } | null {
  const bytes = inlineBudget(html, assets)
  if (bytes <= MAX_INLINE_BYTES) return null
  const names = referencedAssets(html).filter(name => assets[name])
  return { names, bytes }
}

/**
 * Turn a page on disk into a page a sandboxed frame can render.
 *
 * Assets that are not in hand are left as they are: a broken image in the
 * preview is honest, and the published page will still find the file.
 */
export function previewDocument({
  html,
  styles,
  assets,
  page = DEFAULT_HOME_PAGE,
  knownPages,
}: PreviewInput): string {
  const affordable = inlineBudget(html, assets) <= MAX_INLINE_BYTES
  let out = html

  // Only a link that resolves to the stylesheet becomes the stylesheet. One
  // that resolves elsewhere is left as it is and 404s in the frame, which is
  // what it does on the host.
  out = out.replace(LINK_TAG, tag => {
    if (!/\brel=("|')stylesheet\1/i.test(tag)) return tag
    const href = attribute(tag, 'href')
    if (!href) return tag
    return resolvePagePath(page, href) === SITE_STYLESHEET
      ? `<style>\n${styles}\n</style>`
      : tag
  })

  if (knownPages) out = markLinks(out, page, knownPages)

  if (affordable) {
    out = out.replace(ASSET_ATTR, (match, attr, quote, _up, name) => {
      const data = assets[name]
      return data ? `${attr}=${quote}${data}${quote}` : match
    })
    out = out.replace(ASSET_CSS, (match, _up, name) => {
      const data = assets[name]
      return data ? `url(${data})` : match
    })
  }

  return out
}

/**
 * Tell the frame what each internal link is.
 *
 * `data-site-link` carries the page the link resolves to and `data-site-state`
 * says whether that page exists. The frame styles the two differently and
 * reports a click as navigation; nothing about the markup that ships changes,
 * because these attributes are added to the preview copy only.
 */
function markLinks(html: string, page: string, knownPages: string[]): string {
  const known = new Set(knownPages)
  return html.replace(/<a\b([^>]*)>/gi, (tag, attrs: string) => {
    const href = attribute(attrs, 'href')
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return tag
    if (href.startsWith('assets/') || href.includes('styles/site.css')) return tag
    const target = resolvePagePath(page, href)
    if (!target) return tag
    const state = known.has(target) ? 'built' : 'promised'
    return `<a${attrs} data-site-link="${target}" data-site-state="${state}">`
  })
}

/**
 * The reverse of inlining, for markup that comes back OUT of a preview.
 *
 * An element edited in the frame is serialized from the inlined DOM, so its
 * images carry the data URLs the preview put there. Written back as they
 * are, megabytes of base64 land in `pages/*.html` and ship. Every data URL
 * the preview is known to have produced goes back to its `assets/` path,
 * with the `../` prefix the page needs; a data URL the preview did not make
 * (one the author pasted) is left alone.
 */
export function deinlineMarkup(
  markup: string,
  assets: Record<string, string>,
  page: string = DEFAULT_HOME_PAGE,
): string {
  const names = new Map<string, string>()
  for (const [name, data] of Object.entries(assets)) names.set(data, name)
  if (!names.size) return markup
  const up = relativePrefix(page)
  let out = markup.replace(DATA_ATTR, (match, attr, quote, data) => {
    const name = names.get(data)
    return name ? `${attr}=${quote}${up}assets/${name}${quote}` : match
  })
  out = out.replace(DATA_CSS, (match, data) => {
    const name = names.get(data)
    return name ? `url(${up}assets/${name})` : match
  })
  return out
}

/**
 * Links a page makes to other pages, as page paths.
 *
 * Used by the checker to find a link that goes nowhere. Anything absolute or
 * off-site is somebody else's problem and is not reported.
 */
export function internalLinks(html: string, fromPage: string): string[] {
  const links: string[] = []
  const pattern = /href=("|')([^"'#?]+)(?:[#?][^"']*)?\1/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    const href = match[2]
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//')) continue
    if (href.startsWith('assets/') || href.includes('styles/site.css')) continue
    // Root-relative still needs the directory-to-index rule: "/about/" is
    // the page about/index.html, and skipping this reported every nav link
    // in the site as broken.
    const resolved = resolvePagePath(fromPage, href)
    if (resolved) links.push(resolved)
  }
  return links
}

/**
 * Resolve `../` and `./` inside a page-relative path.
 *
 * The trailing slash has to be noticed BEFORE splitting: filtering out empty
 * segments is what makes `..` resolution work, and it also throws away the
 * one thing that says "/about/" means a directory's index rather than a file
 * called about.
 */
function normalize(path: string): string {
  const directory = path.endsWith('/') || path === ''
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  const joined = parts.join('/')
  if (!joined) return DEFAULT_HOME_PAGE
  return directory ? `${joined}/${DEFAULT_HOME_PAGE}` : joined
}

/** Asset paths a page references, as names inside `assets/`. */
export function referencedAssets(html: string): string[] {
  const names = new Set<string>()
  for (const match of html.matchAll(ASSET_ATTR)) names.add(match[4])
  for (const match of html.matchAll(ASSET_CSS)) names.add(match[2])
  return [...names]
}
