import { DEFAULT_HOME_PAGE } from '../constants'

/**
 * Resolve a page-relative or root-relative reference to a package path, the
 * way a browser resolves it on the host: `..` climbs, and cannot climb past
 * the root. `null` for anything absolute or off-site.
 */
export function resolvePagePath(fromPage: string, href: string): string | null {
  href = href.trim()
  if (!href || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return null
  const clean = decodeLocalPath(href.split(/[#?]/)[0])
  if (clean.startsWith('/')) return normalize(clean.replace(/^\//, ''))
  const base = fromPage.includes('/')
    ? fromPage.slice(0, fromPage.lastIndexOf('/') + 1)
    : ''
  return normalize(base + clean)
}

/** Decode URL path segments without turning an encoded separator into a new folder. */
function decodeLocalPath(path: string): string {
  return path.split('/').map(segment => {
    try {
      const decoded = decodeURIComponent(segment)
      return /[/\\]/.test(decoded) ? segment : decoded
    } catch {
      return segment
    }
  }).join('/')
}

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

/** Asset intent is independent of depth; a wrong depth is a file error, not a promised page. */
export function isAssetReference(href: string, fromFile = DEFAULT_HOME_PAGE): boolean {
  const path = resolvePagePath(fromFile, href)
  return path !== null && /(?:^|\/)assets\//.test(path)
}

/** Local file references resolved exactly as on the static host. */
export function localAssetReferences(source: string, fromFile: string): string[] {
  const refs = new Set<string>()
  const add = (href: string): void => {
    if (!href || href.startsWith('#')) return
    const path = resolvePagePath(fromFile, href)
    if (path) refs.add(path)
  }
  const css = (text: string): void => { mapCssUrls(text, href => { add(href); return href }) }
  if (/\.css$/i.test(fromFile)) css(source)
  else {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    for (const element of doc.querySelectorAll('*')) {
      for (const name of ['src', 'href', 'poster']) {
        const href = element.getAttribute(name)
        if (href && (name !== 'href' || isAssetReference(href, fromFile))) add(href)
      }
      const srcset = element.getAttribute('srcset')
      if (srcset) mapSrcset(srcset, href => { add(href); return href })
      css(element.getAttribute('style') ?? '')
      if (element.tagName.toLowerCase() === 'style') css(element.textContent ?? '')
    }
  }
  return [...refs]
}

/** Visit URL tokens while preserving descriptors, data-URL commas and authored formatting. */
export function mapSrcset(value: string, replace: (href: string) => string): string {
  let at = 0
  let copied = 0
  let output = ''
  while (at < value.length) {
    while (at < value.length && /[\s,]/.test(value[at])) at++
    const start = at
    while (at < value.length && !/\s/.test(value[at])) at++
    let end = at
    while (end > start && value[end - 1] === ',') end--
    if (end > start) {
      output += value.slice(copied, start) + replace(value.slice(start, end))
      copied = end
    }
    if (end < at) continue
    // Width/density descriptors end at the next candidate separator.
    while (at < value.length && value[at] !== ',') at++
  }
  return output + value.slice(copied)
}

/** Rewrite only real CSS URL tokens, leaving comments and ordinary strings alone. */
export function mapCssUrls(source: string, replace: (href: string) => string): string {
  const tokens = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi
  return source.replace(tokens, (whole, doubleQuoted, singleQuoted, unquoted) => {
    const href = doubleQuoted ?? singleQuoted ?? unquoted
    if (href === undefined) return whole
    const mapped = replace(href)
    return mapped === href ? whole : `url(${mapped})`
  })
}
