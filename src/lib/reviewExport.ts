/** A portable render snapshot; original site files stay unchanged. */
export function reviewHtml(html: string, root: string, page: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc.querySelector('base[href]')) {
    const folder = page.includes('/') ? page.slice(0, page.lastIndexOf('/') + 1) : ''
    const base = doc.createElement('base')
    // Pages are served at the site root; assets/styles live beside pages/ on disk.
    base.href = 'file://' + (root.replace(/\/$/, '') + '/' + folder).split('/').map(encodeURIComponent).join('/')
    doc.head.prepend(base)
  }
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

export function reviewFilename(title: string, page: string, format: 'pdf' | 'png'): string {
  const name = `${title}-${page.replace(/\.html?$/i, '').replace(/\//g, '-')}`
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().slice(0, 160)
  return `${name || 'page'}.${format}`
}
