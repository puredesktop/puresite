import { relativePrefix } from './siteDocument'
import { mapCssUrls, mapSrcset } from './siteReferences'

/** A portable render snapshot; original site files stay unchanged. */
export function reviewHtml(html: string, root: string, page: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Always strip pre-existing <base> tags so a crafted page cannot redirect headless export to arbitrary file:// paths.
  for (const existing of Array.from(doc.querySelectorAll('base'))) existing.remove()

  const up = relativePrefix(page)
  const rewriteRootRelative = (value: string): string =>
    /^\/(assets|styles)\//i.test(value) ? `${up}${value.slice(1)}` : value

  for (const el of Array.from(doc.querySelectorAll('[href], [src], [poster], [srcset], [style]'))) {
    for (const attr of ['href', 'src', 'poster']) {
      const val = el.getAttribute(attr)
      if (val && /^\/(assets|styles)\//i.test(val)) {
        el.setAttribute(attr, rewriteRootRelative(val))
      }
    }
    const srcset = el.getAttribute('srcset')
    if (srcset && /\/(assets|styles)\//i.test(srcset)) {
      el.setAttribute('srcset', mapSrcset(srcset, rewriteRootRelative))
    }
    const inlineStyle = el.getAttribute('style')
    if (inlineStyle && /\/(assets|styles)\//i.test(inlineStyle)) {
      el.setAttribute('style', mapCssUrls(inlineStyle, rewriteRootRelative, { quote: 'auto', attrQuote: '"' }))
    }
  }
  for (const el of Array.from(doc.querySelectorAll('style'))) {
    if (el.textContent && /\/(assets|styles)\//i.test(el.textContent)) {
      el.textContent = mapCssUrls(el.textContent, rewriteRootRelative)
    }
  }

  const folder = page.includes('/') ? page.slice(0, page.lastIndexOf('/') + 1) : ''
  const base = doc.createElement('base')
  // Pages are served at the site root; assets/styles live beside pages/ on disk.
  base.href = 'file://' + (root.replace(/\/$/, '') + '/' + folder).split('/').map(encodeURIComponent).join('/')
  doc.head.prepend(base)
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

export function reviewFilename(title: string, page: string, format: 'pdf' | 'png'): string {
  const name = `${title}-${page.replace(/\.html?$/i, '').replace(/\//g, '-')}`
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().slice(0, 160)
  return `${name || 'page'}.${format}`
}
