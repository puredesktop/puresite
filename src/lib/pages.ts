/**
 * Editing the site: pages, their order, and the elements inside them.
 *
 * Everything here is a pure function from one document to the next, so the
 * board, the agent tools and the tests all change a site the same way and
 * cannot drift apart.
 */
import { DEFAULT_HOME_PAGE } from '../constants'
import {
  relativePrefix,
  setPageTitle,
  starterPageHtml,
  titleFromPage,
  type SiteDocument,
} from './siteDocument'

/** A page path that is safe to write and sane to serve. */
export function normalizePagePath(input: string): string {
  let path = (input || '').trim().replace(/^\/+/, '').replace(/\\/g, '/')
  path = path
    .split('/')
    .filter(part => part && part !== '.' && part !== '..')
    .map(part =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('/')
  if (!path) return ''
  if (!path.endsWith('.html')) path = `${path}/${DEFAULT_HOME_PAGE}`
  return path
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
  const order = [...document.manifest.pages]
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

export interface PickedElement {
  path: string
  label: string
  editableText: boolean
  isImage: boolean
  text: string
  src: string
}

function parsePage(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString(html, 'text/html')
}

export function readElement(html: string, path: string): PickedElement | null {
  const doc = parsePage(html)
  if (!doc?.body) return null
  const element = elementAt(doc.body, path)
  if (!element) return null
  const isImage = element.tagName === 'IMG'
  return {
    path,
    label: element.tagName.toLowerCase(),
    // Only a leaf carries text: rewriting a container's textContent would
    // delete every child element inside it.
    editableText: !isImage && element.children.length === 0,
    isImage,
    text: element.textContent ?? '',
    src: isImage ? (element.getAttribute('src') ?? '') : '',
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
