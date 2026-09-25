import { elementAt, normalizePagePath } from './pages'
import { type SiteDocument } from './siteDocument'
export interface DrawerRequest {
  descriptionBase?: string
  sessionId?: string
  proposal?: SiteDocument
  id: string
  path: string
  baseHash: string
  document: SiteDocument
  kind: 'draft' | 'edit' | 'describe'
  prompt: string
  pages: string[]
  elementPath?: string
  images: { name: string; sha256: string }[]
  status: 'prepared' | 'committed' | 'cancelled'
  outputHash?: string
}
export async function digest(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  ]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
export function compositionFor(
  request: DrawerRequest,
  args: Record<string, unknown>,
  current: SiteDocument,
): SiteDocument {
  if (
    !args.pages ||
    typeof args.pages !== 'object' ||
    Array.isArray(args.pages)
  )
    throw Error('pages must be a path-to-HTML object.')
  const pages = args.pages as Record<string, string>
  if (!Object.keys(pages).length || Object.keys(pages).length > 50)
    throw Error('Supply 1 to 50 complete pages.')
  for (const [path, html] of Object.entries(pages))
    if (
      normalizePagePath(path) !== path ||
      typeof html !== 'string' ||
      !/<html[\s>]/i.test(html)
    )
      throw Error('Invalid page path or incomplete HTML.')
  if (request.kind === 'edit') {
    if (Object.keys(pages).some(p => !request.pages.includes(p)))
      throw Error('Page is outside the saved selection.')
    if (args.styles !== undefined && args.styles !== current.styles)
      throw Error('Shared stylesheet is outside the selected-page scope.')
    if (request.elementPath !== undefined) {
      const mask = (html: string) => {
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const el = elementAt(doc.body, request.elementPath!)
        if (!el) throw Error('Selected element is missing.')
        el.replaceWith(doc.createComment('selected'))
        return doc.documentElement.outerHTML
      }
      for (const [path, html] of Object.entries(pages))
        if (mask(request.document.pages[path]) !== mask(html))
          throw Error('Change outside the selected element.')
    }
    return { ...current, pages: { ...current.pages, ...pages } }
  }
  if (!pages['index.html'] || typeof args.styles !== 'string')
    throw Error('Draft needs index.html and a shared stylesheet.')
  const title =
    typeof args.title === 'string' && args.title.trim()
      ? args.title.trim()
      : current.title
  const merged = { ...current.pages, ...pages }
  return {
    ...current,
    title,
    pages: merged,
    styles: args.styles,
    manifest: { ...current.manifest, title, pages: Object.keys(merged) },
  }
}
/** A failed multi-file save can be repaired only when every live file is an old
 * or proposed value. Any third value is an external edit and must be reconciled. */
export function recoverableSite(
  before: SiteDocument,
  proposed: SiteDocument,
  current: SiteDocument,
): boolean {
  const keys = new Set([
    ...Object.keys(before.pages),
    ...Object.keys(proposed.pages),
    ...Object.keys(current.pages),
  ])
  for (const key of keys)
    if (
      current.pages[key] !== before.pages[key] &&
      current.pages[key] !== proposed.pages[key]
    )
      return false
  if (current.styles !== before.styles && current.styles !== proposed.styles)
    return false
  const metadata = (site: SiteDocument) =>
    JSON.stringify({
      ...site.manifest,
      title: undefined,
      pages: undefined,
      published: undefined,
    })
  return (
    metadata(current) === metadata(before) &&
    JSON.stringify(current.collections) === JSON.stringify(before.collections)
  )
}

/** Only the saved document request owns its conversation; viewport metadata can be stale. */
export function requestSession(
  request: DrawerRequest | null,
  path: string,
  hash: string,
): string | null {
  return request && (request.path === path || request.outputHash === hash)
    ? request.sessionId ?? null
    : null
}

type DescribedMaterial = { name: string; description: string; role?: string }
export function descriptionState(items: DescribedMaterial[]): string {
  return JSON.stringify(
    items
      .map(({ name, description, role }) => ({ name, description, role: role ?? 'content' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
}
export function assertDescriptionScope(
  request: DrawerRequest,
  current: DescribedMaterial[],
  proposed: DescribedMaterial[],
): void {
  const state = descriptionState(current)
  if (
    request.descriptionBase !== undefined &&
    state !== request.descriptionBase &&
    state !== descriptionState(proposed)
  )
    throw Error(
      'Asset descriptions or roles changed. Prepare a new description request.',
    )
}
