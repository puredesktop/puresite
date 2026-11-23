/**
 * Editing the site: pages, their order, and the elements inside them.
 *
 * Everything here is a pure function from one document to the next, so the
 * board, the agent tools and the tests all change a site the same way and
 * cannot drift apart.
 */
import { DEFAULT_HOME_PAGE } from '../constants'
import {
  orderedPages,
  relativePrefix,
  setPageTitle,
  starter404Html,
  starterPageHtml,
  titleFromPage,
  type SiteDocument,
} from './siteDocument'
import { hrefFrom, repointPromise } from './siteLinks'
import { mapCssUrls, mapSrcset, resolvePagePath } from './siteReferences'

const DRIVE_PREFIX = /^[a-z]:/i
const ONLY_DOTS = /^\.+$/

/** True when a raw package page key cannot traverse outside `pages/`. */
export function isSafePagePath(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false
  if (DRIVE_PREFIX.test(path)) return false
  const parts = path.split('/')
  return parts.every(
    part =>
      part.length > 0 &&
      part !== '.' &&
      part !== '..' &&
      !ONLY_DOTS.test(part) &&
      !DRIVE_PREFIX.test(part),
  )
}

/** A page path that is safe to write and sane to serve. */
export function normalizePagePath(input: string): string {
  const raw = (input || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!raw || DRIVE_PREFIX.test(raw)) return ''
  const segments = raw
    .split('/')
    .filter(part => part && part !== '.' && part !== '..' && !ONLY_DOTS.test(part) && !DRIVE_PREFIX.test(part))
    .map(part =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    // Re-filter AFTER sanitization so inputs like "..!/" or "-..-" cannot collapse into "..".
    .filter(part => part && part !== '.' && part !== '..' && !ONLY_DOTS.test(part))
  let path = segments.join('/')
  if (!path || !isSafePagePath(path)) return ''
  if (!path.endsWith('.html')) path = `${path}/${DEFAULT_HOME_PAGE}`
  return isSafePagePath(path) ? path : ''
}

const SAFE_RASTER_DATA_URL = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i
const SCHEME_PREFIX = /^[a-z][a-z\d+.-]*:/i
const ALLOWED_EXPLICIT_SCHEMES = /^(?:https?|mailto|tel):/i

/**
 * Strict URL scheme allowlist for links and media sources:
 * relative paths, #fragments, http:, https:, mailto:, tel:, and base64 raster data:image/*.
 */
export function isSafeUrlScheme(url: string): boolean {
  const value = (url || '').replace(/[\u0000-\u001f\u007f]+/g, '').trim()
  if (!value) return false
  if (value.startsWith('#')) return true
  if (value.startsWith('//')) return false
  if (!SCHEME_PREFIX.test(value)) return true
  if (ALLOWED_EXPLICIT_SCHEMES.test(value)) return true
  if (SAFE_RASTER_DATA_URL.test(value)) return true
  return false
}

const FORBIDDEN_SVG_LOCAL_NAMES = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'set',
  'handler',
])

/**
 * Validate a base64-encoded SVG file before importing it into `assets/`.
 * Rejects XML entities/doctypes/stylesheets, null bytes, parse errors, active elements,
 * event handlers, external/active hrefs, and CSS url()/@import in `<style>`.
 */
export function validateSafeSvgBase64(base64: string): void {
  const compact = (base64 || '').replace(/\s+/g, '')
  let decoded = ''
  try {
    const bytes = Uint8Array.from(atob(compact), char => char.charCodeAt(0))
    decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    throw new Error('SVG file could not be decoded.')
  }
  if (
    decoded.includes('\0') ||
    /<!DOCTYPE\b/i.test(decoded) ||
    /<!ENTITY\b/i.test(decoded) ||
    /<\?xml-stylesheet\b/i.test(decoded)
  ) {
    throw new Error('SVG files with DOCTYPE, XML entities, stylesheets, or null bytes cannot be uploaded.')
  }
  if (typeof DOMParser === 'undefined') {
    if (
      /<script\b/i.test(decoded) ||
      /\bon[a-z]+\s*=/i.test(decoded) ||
      /javascript\s*:/i.test(decoded) ||
      /<foreignObject\b/i.test(decoded) ||
      /<iframe\b/i.test(decoded)
    ) {
      throw new Error('SVG files containing active scripts or event handlers cannot be uploaded.')
    }
    return
  }
  const doc = new DOMParser().parseFromString(decoded, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || doc.querySelector('parsererror') || root.localName.toLowerCase() !== 'svg') {
    throw new Error('SVG file is malformed and cannot be uploaded.')
  }
  const nodes: Element[] = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const el of nodes) {
    const local = el.localName.toLowerCase()
    if (FORBIDDEN_SVG_LOCAL_NAMES.has(local) || local.startsWith('animate')) {
      throw new Error(`SVG files containing <${el.localName}> cannot be uploaded.`)
    }
    if (local === 'style') {
      const css = el.textContent ?? ''
      if (/@import\b|url\s*\(|expression\s*\(/i.test(css)) {
        throw new Error('SVG files with @import or url() inside <style> cannot be uploaded.')
      }
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const localAttr = attr.localName.toLowerCase()
      if (name.startsWith('on') || localAttr.startsWith('on')) {
        throw new Error(`SVG files containing event handler "${attr.name}" cannot be uploaded.`)
      }
      if (localAttr === 'href' || name === 'xlink:href' || name === 'href') {
        const val = attr.value.replace(/[\u0000-\u001f\u007f]+/g, '').trim()
        if (val && !val.startsWith('#')) {
          throw new Error('SVG href attributes may only reference internal #fragments.')
        }
      }
      if (localAttr === 'style' && /@import\b|url\s*\(|expression\s*\(/i.test(attr.value)) {
        throw new Error('SVG inline styles may not use url() or @import.')
      }
    }
  }
}

export function addPage(
  document: SiteDocument,
  input: { path: string; title?: string; html?: string },
): SiteDocument {
  const path = normalizePagePath(input.path)
  if (!path || document.pages[path]) return document
  const title = input.title?.trim() || titleFromPage(input.html ?? '') || path
  const html = input.html ?? starterPageHtml(title, path)
  return {
    ...document,
    pages: { ...document.pages, [path]: setPageTitle(html, title) },
    manifest: { ...document.manifest, pages: [...document.manifest.pages, path] },
  }
}

/** Add a starter 404.html page if it does not exist yet. */
export function add404Page(document: SiteDocument): SiteDocument {
  if (document.pages['404.html']) return document
  return {
    ...document,
    pages: { ...document.pages, '404.html': starter404Html(document.title) },
    manifest: { ...document.manifest, pages: [...document.manifest.pages, '404.html'] },
  }
}

/** Duplicate an existing page, preserving its markup, header and footer. */
export function duplicatePage(
  document: SiteDocument,
  sourcePath: string,
  requestedPath?: string,
): { document: SiteDocument; path: string } {
  const sourceHtml = document.pages[sourcePath]
  if (!sourceHtml) return { document, path: sourcePath }

  const stem = sourcePath
    .replace(/\/index\.html$/i, '')
    .replace(/\.html$/i, '')
  let target = requestedPath ? normalizePagePath(requestedPath) : ''
  if (!target || document.pages[target]) {
    let n = 2
    const base = stem === 'index' ? 'page' : `${stem}-copy`
    target = normalizePagePath(base)
    while (!target || document.pages[target]) {
      target = normalizePagePath(`${base}-${n}`)
      n += 1
    }
  }

  const adjustedHtml =
    sourcePath === target ? sourceHtml : adjustRelativePaths(sourceHtml, sourcePath, target)
  const sourceTitle = titleFromPage(sourceHtml) || sourcePath
  const nextHtml = setPageTitle(adjustedHtml, `${sourceTitle} (copy)`)

  const currentOrder = orderedPages(document).map(p => p.path)
  const idx = currentOrder.indexOf(sourcePath)
  const nextOrder = [...currentOrder]
  nextOrder.splice(idx >= 0 ? idx + 1 : nextOrder.length, 0, target)

  return {
    path: target,
    document: {
      ...document,
      pages: { ...document.pages, [target]: nextHtml },
      manifest: { ...document.manifest, pages: nextOrder },
    },
  }
}

/**
 * Rewrite relative asset/style URLs (including `./`, `../`, `srcset`, `<style>`, `style=""`)
 * and relative internal page links when a page moves to a different directory depth.
 */
function adjustRelativePaths(html: string, fromPage: string, toPage: string): string {
  const fromDepth = fromPage.split('/').length - 1
  const toDepth = toPage.split('/').length - 1
  if (fromDepth === toDepth) return html
  const newPrefix = relativePrefix(toPage)

  const rewriteAssetOrStyle = (raw: string): string => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('#') || SCHEME_PREFIX.test(trimmed)) {
      return raw
    }
    const suffixMatch = /([?#].*)$/.exec(trimmed)
    const suffix = suffixMatch ? suffixMatch[1] : ''
    const resolved = resolvePagePath(fromPage, trimmed)
    if (!resolved || (!resolved.startsWith('assets/') && !resolved.startsWith('styles/'))) {
      return raw
    }
    return `${newPrefix}${resolved}${suffix}`
  }

  let out = html
  // Rewrite href/src/poster pointing to relative assets/ or styles/
  out = out.replace(
    /(\b(?:href|src|poster)=)("|')([^"']+)\2/gi,
    (whole, attr: string, quote: string, val: string) => {
      const next = rewriteAssetOrStyle(val)
      return next === val ? whole : `${attr}${quote}${next}${quote}`
    },
  )
  // Rewrite srcset candidates
  out = out.replace(
    /(\bsrcset=)("|')([^"']*)\2/gi,
    (_whole, attr: string, quote: string, val: string) =>
      `${attr}${quote}${mapSrcset(val, rewriteAssetOrStyle)}${quote}`,
  )
  // Rewrite inline <style> blocks
  out = out.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_whole, open: string, body: string, close: string) =>
      open + mapCssUrls(body, rewriteAssetOrStyle, { quote: '"' }) + close,
  )
  // Rewrite inline style="..." attributes
  out = out.replace(
    /(\bstyle\s*=\s*)("|')([\s\S]*?)\2/gi,
    (_whole, attr: string, quote: string, val: string) =>
      attr + quote + mapCssUrls(val, rewriteAssetOrStyle, { quote: 'auto', attrQuote: quote as '"' | "'" }) + quote,
  )
  // Rewrite relative internal <a href="..."> page links
  out = out.replace(
    /<a\b([^>]*)>/gi,
    (tag, attrs: string) =>
      `<a${attrs.replace(
        /(\bhref=)("|')([^"']+)\2/i,
        (whole, attr: string, quote: string, href: string) => {
          const trimmed = href.trim()
          if (
            !trimmed ||
            trimmed.startsWith('/') ||
            trimmed.startsWith('#') ||
            trimmed.startsWith('//') ||
            SCHEME_PREFIX.test(trimmed)
          ) {
            return whole
          }
          const resolved = resolvePagePath(fromPage, trimmed)
          if (!resolved || resolved.startsWith('assets/') || resolved.startsWith('styles/')) {
            return whole
          }
          const suffixMatch = /([?#].*)$/.exec(trimmed)
          const suffix = suffixMatch ? suffixMatch[1] : ''
          return `${attr}${quote}${hrefFrom(toPage, resolved)}${suffix}${quote}`
        },
      )}>`,
  )
  return out
}

/** Rename a page slug/path and automatically repoint internal links across every page. */
export function renamePagePath(
  document: SiteDocument,
  oldPath: string,
  requestedNewPath: string,
): { document: SiteDocument; path: string } {
  if (oldPath === DEFAULT_HOME_PAGE) return { document, path: oldPath }
  if (!document.pages[oldPath]) return { document, path: oldPath }
  const nextPath = normalizePagePath(requestedNewPath)
  if (!nextPath || nextPath === oldPath || document.pages[nextPath]) {
    return { document, path: oldPath }
  }

  const movedHtml = adjustRelativePaths(document.pages[oldPath]!, oldPath, nextPath)

  const pages: Record<string, string> = {}
  for (const [key, html] of Object.entries(document.pages)) {
    pages[key === oldPath ? nextPath : key] = key === oldPath ? movedHtml : html
  }
  const repointed = repointPromise(pages, oldPath, nextPath)
  const order = orderedPages(document).map(p => (p.path === oldPath ? nextPath : p.path))

  return {
    path: nextPath,
    document: {
      ...document,
      pages: repointed,
      manifest: {
        ...document.manifest,
        pages: order,
        ...(document.manifest.goal === oldPath ? { goal: nextPath } : {}),
      },
    },
  }
}

/**
 * Delete a page — except the last one.
 *
 * A site with no pages cannot be previewed, published or reasoned about, and
 * the app would have to invent one back. Refusing is simpler and honest.
 */
export function deletePage(document: SiteDocument, path: string): SiteDocument {
  if (!document.pages[path]) return document
  if (Object.keys(document.pages).length <= 1) return document
  const pages = { ...document.pages }
  delete pages[path]
  return {
    ...document,
    pages,
    manifest: {
      ...document.manifest,
      pages: document.manifest.pages.filter(page => page !== path),
    },
  }
}

/** Reorder the nav. A pure move: nothing about the page itself changes. */
export function movePage(
  document: SiteDocument,
  from: number,
  to: number,
): SiteDocument {
  const order = orderedPages(document).map(page => page.path)
  if (!Number.isInteger(from) || !Number.isInteger(to)) return document
  if (from < 0 || from >= order.length) return document
  const target = Math.max(0, Math.min(order.length - 1, to))
  if (target === from) return document
  const [moved] = order.splice(from, 1)
  order.splice(target, 0, moved)
  return { ...document, manifest: { ...document.manifest, pages: order } }
}

export function writePage(
  document: SiteDocument,
  path: string,
  html: string,
): SiteDocument {
  if (!document.pages[path]) return document
  return { ...document, pages: { ...document.pages, [path]: html } }
}

/**
 * An element inside a page, addressed the way the board and the agent agree.
 *
 * A path is child indices from <body> down — "0/2/1" — which survives being
 * handed between the frame, the rail and a tool call. PureVideo learned that
 * a root-relative path carrying the scene index as its first step is a trap:
 * every consumer has to remember to strip it. Here the page is named
 * separately and the path is only ever within one page.
 */
export function elementAt(root: Element, path: string): Element | null {
  const parts = path.split('/').filter(Boolean)
  let element: Element | null = root
  for (const part of parts) {
    if (!element) return null
    element = element.children[Number(part)] ?? null
  }
  return element
}

export type ElementAlign = 'left' | 'center' | 'right' | ''
export type ElementSpacing = 'tight' | 'normal' | 'loose' | ''

export interface PickedElement {
  path: string
  label: string
  tagName: string
  breadcrumb: string[]
  editableText: boolean
  isImage: boolean
  isLink: boolean
  text: string
  src: string
  alt: string
  href: string
  newTab: boolean
  align: ElementAlign
  spacing: ElementSpacing
  canMoveUp: boolean
  canMoveDown: boolean
  canDuplicate: boolean
  canDelete: boolean
  siblingIndex: number
  siblingCount: number
}

function parsePage(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString(html, 'text/html')
}

function breadcrumbFor(body: Element, path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  const trail: string[] = []
  let cursor: Element | null = body
  for (const part of parts) {
    if (!cursor) break
    cursor = cursor.children[Number(part)] ?? null
    if (!cursor) break
    const tag = cursor.tagName.toLowerCase()
    const id = cursor.getAttribute('id')
    const cls = cursor.getAttribute('class')?.trim().split(/\s+/)[0]
    trail.push(id ? `${tag}#${id}` : cls ? `${tag}.${cls}` : tag)
  }
  return trail
}

function pathOfElement(body: Element, target: Element): string {
  const indices: number[] = []
  let node: Element | null = target
  while (node && node !== body) {
    const parent: Element | null = node.parentElement
    if (!parent) break
    const index = Array.prototype.indexOf.call(parent.children, node)
    if (index < 0) break
    indices.unshift(index)
    node = parent
  }
  return indices.join('/')
}

function readAlign(element: Element): ElementAlign {
  const attr = element.getAttribute('data-align')?.trim().toLowerCase()
  if (attr === 'left' || attr === 'center' || attr === 'right') return attr
  const inline = (element.getAttribute('style') ?? '').toLowerCase()
  const match = /text-align\s*:\s*(left|center|right)\b/.exec(inline)
  return (match?.[1] as ElementAlign | undefined) ?? ''
}

function readSpacing(element: Element): ElementSpacing {
  const attr = element.getAttribute('data-space')?.trim().toLowerCase()
  if (attr === 'tight' || attr === 'normal' || attr === 'loose') return attr
  return ''
}

export function readElement(html: string, path: string): PickedElement | null {
  const doc = parsePage(html)
  if (!doc?.body) return null
  const element = elementAt(doc.body, path)
  if (!element) return null
  const isImage = element.tagName === 'IMG'
  const linkNode = element.tagName === 'A' ? element : element.querySelector('a[href]')
  const parent = element.parentElement
  const siblings = parent ? Array.from(parent.children) : []
  const siblingIndex = parent ? siblings.indexOf(element) : -1
  const siblingCount = siblings.length
  const notBody = element !== doc.body
  return {
    path,
    label: element.tagName.toLowerCase(),
    tagName: element.tagName.toLowerCase(),
    breadcrumb: breadcrumbFor(doc.body, path),
    // Only a leaf carries text: rewriting a container's textContent would
    // delete every child element inside it.
    editableText: !isImage && element.children.length === 0,
    isImage,
    isLink: element.tagName === 'A' || Boolean(linkNode),
    text: element.textContent ?? '',
    src: isImage ? (element.getAttribute('src') ?? '') : '',
    alt: isImage ? (element.getAttribute('alt') ?? '') : '',
    href: linkNode ? (linkNode.getAttribute('href') ?? '') : '',
    newTab: linkNode ? linkNode.getAttribute('target') === '_blank' : false,
    align: readAlign(element),
    spacing: readSpacing(element),
    canMoveUp: notBody && siblingIndex > 0,
    canMoveDown: notBody && siblingIndex >= 0 && siblingIndex < siblingCount - 1,
    canDuplicate: notBody && Boolean(parent),
    canDelete: notBody,
    siblingIndex,
    siblingCount,
  }
}

function serialize(doc: Document): string {
  const doctype = doc.doctype ? '<!DOCTYPE html>\n' : ''
  return `${doctype}${doc.documentElement.outerHTML}\n`
}

export function setElementText(
  html: string,
  path: string,
  text: string,
): string {
  const doc = parsePage(html)
  if (!doc?.body) return html
  const element = elementAt(doc.body, path)
  if (!element || element.children.length) return html
  element.textContent = text
  return serialize(doc)
}

const FORBIDDEN_EDIT_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'BASE',
  'META',
  'LINK',
  'STYLE',
  'TEMPLATE',
  'SVG',
  'MATH',
  'NOSCRIPT',
  'NOEMBED',
  'XMP',
  'FOREIGNOBJECT',
  'ANIMATE',
  'SET',
  'FORM',
])
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster'])

/**
 * Strip dangerous tags, event handlers, unsafe URL schemes, and preview-only
 * markers from markup arriving from an inline preview edit (`puresite:edited`).
 */
export function sanitizeEditedOuterHtml(outerHtml: string): string {
  const doc = parsePage(`<body>${outerHtml}</body>`)
  if (!doc?.body) return ''
  const root = doc.body.firstElementChild
  if (!root || FORBIDDEN_EDIT_TAGS.has(root.tagName.toUpperCase())) return ''

  const scrub = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      if (FORBIDDEN_EDIT_TAGS.has(child.tagName.toUpperCase())) {
        child.remove()
      } else {
        scrub(child)
      }
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (
        name.startsWith('on') ||
        name === 'srcdoc' ||
        name === 'data-site-link' ||
        name === 'data-site-state' ||
        name === 'contenteditable'
      ) {
        el.removeAttribute(attr.name)
        continue
      }
      if (URL_ATTRS.has(name) && !isSafeUrlScheme(attr.value)) {
        el.removeAttribute(attr.name)
        continue
      }
      if (name === 'srcset') {
        const parts = attr.value.split(',').map(p => p.trim()).filter(Boolean)
        const safeParts = parts.filter(part => {
          const url = part.split(/\s+/)[0] ?? ''
          return isSafeUrlScheme(url)
        })
        if (safeParts.length !== parts.length) {
          if (safeParts.length) el.setAttribute(attr.name, safeParts.join(', '))
          else el.removeAttribute(attr.name)
        }
      }
    }
    el.classList.remove('__ps-picked', '__ps-can-edit')
    if (el.hasAttribute('class') && !el.classList.length) el.removeAttribute('class')
  }

  scrub(root)
  return root.outerHTML
}

/** Splice a revised element in at its path — how an inline edit lands. */
export function replaceElement(
  html: string,
  path: string,
  outerHtml: string,
): string {
  const doc = parsePage(html)
  if (!doc?.body) return html
  const element = elementAt(doc.body, path)
  if (!element) return html
  const holder = doc.createElement('div')
  holder.innerHTML = outerHtml
  const next = holder.firstElementChild
  if (!next) return html
  element.replaceWith(next)
  return serialize(doc)
}

/**
 * Make what is on screen into a link.
 *
 * The selection keeps its words and its place: only a link is put around
 * them, inside the element rather than around it, so a heading stays a
 * heading and a list item stays in its list. An element that is already a
 * link is repointed instead of nested, because a link inside a link is not a
 * thing a browser can honour.
 */
export function linkElement(html: string, path: string, href: string): string {
  if (!isSafeUrlScheme(href)) return html
  const doc = parsePage(html)
  if (!doc?.body) return html
  const element = elementAt(doc.body, path)
  if (!element) return html
  if (element.tagName === 'A') {
    element.setAttribute('href', href)
    return serialize(doc)
  }
  const existing = element.querySelector('a[href]')
  if (existing) {
    existing.setAttribute('href', href)
    return serialize(doc)
  }
  const link = doc.createElement('a')
  link.setAttribute('href', href)
  while (element.firstChild) link.appendChild(element.firstChild)
  element.appendChild(link)
  return serialize(doc)
}

/**
 * Point an image at a different file, or put one into an empty box.
 *
 * On an <img> this is a src change. On an empty placeholder it injects an
 * image that fills the box rather than replacing the box — the layout was
 * chosen deliberately and should survive having a picture put in it.
 */
export function setElementSrc(
  html: string,
  path: string,
  src: string,
  page = DEFAULT_HOME_PAGE,
): string {
  if (!isSafeUrlScheme(src)) return html
  const doc = parsePage(html)
  if (!doc?.body) return html
  const element = elementAt(doc.body, path)
  if (!element) return html
  const href = src.startsWith('assets/') ? `${relativePrefix(page)}${src}` : src
  if (element.tagName === 'IMG') {
    element.setAttribute('src', href)
    return serialize(doc)
  }
  if (element.children.length) return html
  const image = doc.createElement('img')
  image.setAttribute('src', href)
  image.setAttribute('alt', '')
  image.setAttribute('style', 'width: 100%; height: 100%; object-fit: cover')
  element.textContent = ''
  element.appendChild(image)
  return serialize(doc)
}

export interface PageHeadMeta {
  lang: string
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  favicon: string
}

/** Read SEO and document-head metadata from a page's HTML. */
export function readPageHead(html: string): PageHeadMeta {
  const doc = parsePage(html)
  if (!doc) {
    return { lang: '', description: '', ogTitle: '', ogDescription: '', ogImage: '', favicon: '' }
  }
  const metaContent = (selector: string): string =>
    doc.head?.querySelector(selector)?.getAttribute('content')?.trim() ?? ''
  return {
    lang: doc.documentElement?.getAttribute('lang')?.trim() ?? '',
    description: metaContent('meta[name="description" i]'),
    ogTitle: metaContent('meta[property="og:title" i]'),
    ogDescription: metaContent('meta[property="og:description" i]'),
    ogImage: metaContent('meta[property="og:image" i]'),
    favicon: doc.head?.querySelector('link[rel="icon" i], link[rel="shortcut icon" i]')?.getAttribute('href')?.trim() ?? '',
  }
}

/** Update SEO and document-head metadata on a page's HTML safely. */
export function updatePageHead(html: string, patch: Partial<PageHeadMeta>): string {
  const doc = parsePage(html)
  if (!doc?.head) return html

  if (patch.lang !== undefined) {
    const lang = patch.lang.trim()
    if (lang) doc.documentElement.setAttribute('lang', lang)
    else doc.documentElement.removeAttribute('lang')
  }

  const setMeta = (attr: 'name' | 'property', key: string, value: string | undefined): void => {
    if (value === undefined) return
    const trimmed = value.trim()
    const existing = doc.head.querySelector(`meta[${attr}="${key}" i]`)
    if (!trimmed) {
      existing?.remove()
      return
    }
    if (existing) {
      existing.setAttribute('content', trimmed)
    } else {
      const meta = doc.createElement('meta')
      meta.setAttribute(attr, key)
      meta.setAttribute('content', trimmed)
      doc.head.appendChild(meta)
    }
  }

  setMeta('name', 'description', patch.description)
  setMeta('property', 'og:title', patch.ogTitle)
  setMeta('property', 'og:description', patch.ogDescription)
  if (patch.ogImage !== undefined) {
    const val = patch.ogImage.trim()
    if (!val || isSafeUrlScheme(val)) setMeta('property', 'og:image', val)
  }

  if (patch.favicon !== undefined) {
    const val = patch.favicon.trim()
    const existing = doc.head.querySelector('link[rel="icon" i], link[rel="shortcut icon" i]')
    if (!val) {
      existing?.remove()
    } else if (isSafeUrlScheme(val)) {
      if (existing) {
        existing.setAttribute('href', val)
      } else {
        const link = doc.createElement('link')
        link.setAttribute('rel', 'icon')
        link.setAttribute('href', val)
        doc.head.appendChild(link)
      }
    }
  }

  return serialize(doc)
}

/**
 * Put an element into a page, in flow.
 *
 * Inserted before or after a sibling rather than at coordinates: a website
 * reflows, and an element dropped at an x/y is the absolute-positioning
 * mistake that made slides and scenes overlap. Order is the only position
 * this app offers.
 */
export function insertElement(
  html: string,
  input: { markup: string; beforePath?: string; afterPath?: string },
): string {
  const doc = parsePage(html)
  if (!doc?.body) return html
  const holder = doc.createElement('div')
  holder.innerHTML = input.markup
  const node = holder.firstElementChild
  if (!node) return html
  const anchorPath = input.beforePath ?? input.afterPath
  const anchor = anchorPath ? elementAt(doc.body, anchorPath) : null
  if (anchor?.parentElement) {
    if (input.beforePath) anchor.parentElement.insertBefore(node, anchor)
    else anchor.parentElement.insertBefore(node, anchor.nextSibling)
  } else {
    const main = doc.querySelector('main') ?? doc.body
    main.appendChild(node)
  }
  return serialize(doc)
}

export function deleteElement(html: string, path: string): string {
  const doc = parsePage(html)
  if (!doc?.body) return html
  const element = elementAt(doc.body, path)
  if (!element || element === doc.body) return html
  element.remove()
  return serialize(doc)
}

/** Reorder an element among its siblings and report its new path. */
export function moveElement(
  html: string,
  path: string,
  direction: 'up' | 'down',
): { html: string; nextPath: string } {
  const doc = parsePage(html)
  if (!doc?.body) return { html, nextPath: path }
  const element = elementAt(doc.body, path)
  if (!element || !element.parentElement || element === doc.body) {
    return { html, nextPath: path }
  }
  const parent = element.parentElement
  if (direction === 'up') {
    const prev = element.previousElementSibling
    if (!prev) return { html, nextPath: path }
    parent.insertBefore(element, prev)
  } else {
    const next = element.nextElementSibling
    if (!next) return { html, nextPath: path }
    parent.insertBefore(element, next.nextElementSibling)
  }
  return { html: serialize(doc), nextPath: pathOfElement(doc.body, element) }
}

/** Clone an element directly after itself (stripping duplicate `id` attributes) and return its path. */
export function duplicateElement(
  html: string,
  path: string,
): { html: string; nextPath: string } {
  const doc = parsePage(html)
  if (!doc?.body) return { html, nextPath: path }
  const element = elementAt(doc.body, path)
  if (!element || !element.parentElement || element === doc.body) {
    return { html, nextPath: path }
  }
  const clone = element.cloneNode(true) as Element
  clone.removeAttribute('id')
  for (const child of Array.from(clone.querySelectorAll('[id]'))) {
    child.removeAttribute('id')
  }
  element.parentElement.insertBefore(clone, element.nextElementSibling)
  return { html: serialize(doc), nextPath: pathOfElement(doc.body, clone) }
}

/** Update an anchor's `href` and `target="_blank"` safely (or wrap element text in a link). */
export function setElementLink(
  html: string,
  path: string,
  input: { href: string; newTab?: boolean },
): string {
  const trimmed = input.href.trim()
  if (trimmed && !isSafeUrlScheme(trimmed)) return html
  const doc = parsePage(html)
  if (!doc?.body) return html
  const element = elementAt(doc.body, path)
  if (!element || element === doc.body) return html
  let anchor: Element | null =
    element.tagName === 'A' ? element : element.querySelector('a[href]')
  if (!trimmed) {
    if (anchor) {
      if (anchor === element) {
        anchor.removeAttribute('href')
        anchor.removeAttribute('target')
        anchor.removeAttribute('rel')
      } else {
        while (anchor.firstChild) anchor.parentElement?.insertBefore(anchor.firstChild, anchor)
        anchor.remove()
      }
      return serialize(doc)
    }
    return html
  }
  if (!anchor) {
    anchor = doc.createElement('a')
    while (element.firstChild) anchor.appendChild(element.firstChild)
    element.appendChild(anchor)
  }
  anchor.setAttribute('href', trimmed)
  if (input.newTab) {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  } else {
    anchor.removeAttribute('target')
    if ((anchor.getAttribute('rel') ?? '').trim() === 'noopener noreferrer') {
      anchor.removeAttribute('rel')
    }
  }
  return serialize(doc)
}

/** Update an `<img>` element's `alt` attribute. */
export function setElementAlt(html: string, path: string, alt: string): string {
  const doc = parsePage(html)
  if (!doc?.body) return html
  const element = elementAt(doc.body, path)
  if (!element || element.tagName !== 'IMG') return html
  element.setAttribute('alt', alt)
  return serialize(doc)
}

const SPACING_PADDING: Record<Exclude<ElementSpacing, ''>, string> = {
  tight: 'var(--space-xs)',
  normal: 'var(--space-m)',
  loose: 'var(--space-xl)',
}

/** Set alignment and vertical spacing pills on an element without clobbering unrelated inline styles. */
export function setElementLayout(
  html: string,
  path: string,
  patch: { align?: ElementAlign; spacing?: ElementSpacing },
): string {
  const doc = parsePage(html)
  if (!doc?.body) return html
  const element = elementAt(doc.body, path)
  if (!element || element === doc.body) return html

  const styleMap = new Map<string, string>()
  const existing = element.getAttribute('style') ?? ''
  for (const decl of existing.split(';')) {
    const idx = decl.indexOf(':')
    if (idx < 0) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const val = decl.slice(idx + 1).trim()
    if (prop && val) styleMap.set(prop, val)
  }

  if (patch.align !== undefined) {
    if (patch.align) {
      element.setAttribute('data-align', patch.align)
      styleMap.set('text-align', patch.align)
    } else {
      element.removeAttribute('data-align')
      styleMap.delete('text-align')
    }
  }

  if (patch.spacing !== undefined) {
    if (patch.spacing) {
      element.setAttribute('data-space', patch.spacing)
      styleMap.set('padding-block', SPACING_PADDING[patch.spacing])
    } else {
      element.removeAttribute('data-space')
      styleMap.delete('padding-block')
    }
  }

  if (styleMap.size) {
    element.setAttribute(
      'style',
      Array.from(styleMap.entries())
        .map(([k, v]) => `${k}: ${v}`)
        .join('; '),
    )
  } else {
    element.removeAttribute('style')
  }

  return serialize(doc)
}
