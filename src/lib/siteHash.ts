/**
 * What "the site changed" means, as one string.
 *
 * A site is a map of pages, a stylesheet, a manifest and its collections —
 * not one document — so its hash is composed: every page hashed on its own,
 * the pages joined in path order, then the stylesheet, the manifest and the
 * collections. Two properties matter and are tested:
 *
 *   - STABLE: the same site hashes the same whatever order its pages were
 *     added in, and whatever order the manifest's keys happen to be in.
 *   - PAGE-SCOPED: each page's hash is exposed beside the site's, so a tool
 *     that read one page can name what it read without knowing the rest.
 *
 * `manifest.published` is deliberately left out. It is where the site went
 * (host, slug, the one-time claim token), not what the site is — a publish
 * must not read as an edit, and a restore must never carry an old record
 * back over the live one.
 */
import { contentHash } from '@purescience/platform-ui/editing/renderFingerprint'
import type { SiteDocument, SiteManifest } from './siteDocument'

export { contentHash }

/** A page's content hash — what a page-scoped `baseHash` names. */
export function pageHash(html: string): string {
  return contentHash(html)
}

export function pageHashes(document: SiteDocument): Record<string, string> {
  const out: Record<string, string> = {}
  for (const path of Object.keys(document.pages).sort()) {
    out[path] = pageHash(document.pages[path] ?? '')
  }
  return out
}

/** JSON with object keys sorted at every level, so key order cannot change a hash. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** The manifest without where the site went. */
export function manifestWithoutPublished(
  manifest: SiteManifest,
): Omit<SiteManifest, 'published'> {
  const { published: _published, ...rest } = manifest
  return rest
}

export function stylesHash(styles: string): string {
  return contentHash(styles)
}

/**
 * The composite site hash. Compare for equality only; the pieces it is made
 * of are available separately through `pageHashes` and `stylesHash`.
 */
export function siteHash(document: SiteDocument): string {
  const pages = pageHashes(document)
  const parts = [
    `pages:${Object.keys(pages)
      .map(path => `${path}=${pages[path]}`)
      .join(';')}`,
    `styles:${stylesHash(document.styles)}`,
    `manifest:${contentHash(stableStringify(manifestWithoutPublished(document.manifest)))}`,
    `collections:${contentHash(stableStringify(document.collections))}`,
    `title:${contentHash(document.title)}`,
  ]
  return contentHash(parts.join('|'))
}
