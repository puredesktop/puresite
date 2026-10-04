import { SITE_ASSETS_DIR, SITE_BUILD_DIR, SITE_COLLECTIONS_FILE, SITE_MANIFEST_FILE, SITE_PAGES_DIR, SITE_STYLESHEET } from '../constants'
import { notesFrom, type MaterialItem } from './material'
import { parseCollections, type Collection } from './siteData'
import { createDefaultSiteDocument, orderedPages, parseSiteManifest, serializeSiteManifest, type SiteDocument } from './siteDocument'

/** A fixed number of workers, with results kept in input order. */
export async function mapConcurrent<T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      result[index] = await read(items[index])
    }
  }))
  return result
}

interface PackageFiles {
  read(path: string): Promise<string>
  list(path: string): Promise<unknown>
}

function savedCollections(text: string): Collection[] {
  const parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed) || !parsed.every(c => c && typeof c === 'object' &&
    typeof c.name === 'string' && Array.isArray(c.fields) && c.fields.every((f: unknown) =>
      f && typeof f === 'object' && typeof (f as { name?: unknown }).name === 'string' && typeof (f as { type?: unknown }).type === 'string') &&
    c.access && ['read', 'insert', 'update', 'delete'].every(key => ['public', 'owner', 'none'].includes(c.access[key])))) {
    throw new Error('collections.json is not a collection list. Keep the file and repair it before reopening the site.')
  }
  return parsed as Collection[]
}

export function serializeSitePackage(current: SiteDocument, material: MaterialItem[]) {
  return [
    { name: SITE_MANIFEST_FILE, content: serializeSiteManifest({ ...current.manifest,
      title: current.title, pages: orderedPages(current).map(page => page.path), assets: notesFrom(material) }) },
    { name: SITE_COLLECTIONS_FILE, content: `${JSON.stringify(current.collections, null, 2)}\n` },
    ...Object.entries(current.pages).map(([path, html]) => ({ name: `${SITE_PAGES_DIR}/${path}`, content: html })),
    { name: SITE_STYLESHEET, content: current.styles },
    { name: `${SITE_ASSETS_DIR}/.keep`, content: '' },
  ]
}

/** Discover real pages, then read their contents with bounded bridge concurrency. */
export async function readSitePackage(root: string, files: PackageFiles): Promise<SiteDocument> {
  const [manifestText, styles, collectionsText] = await Promise.all([
    files.read(`${root}/${SITE_MANIFEST_FILE}`).catch(() => '{}'),
    files.read(`${root}/${SITE_STYLESHEET}`).catch(() => createDefaultSiteDocument().styles),
    files.read(`${root}/${SITE_COLLECTIONS_FILE}`).catch(error => {
      if (/ENOENT|no such file|not found|does not exist/i.test(String(error))) return null
      throw error
    }),
  ])
  const manifest = parseSiteManifest(manifestText)
  const paths: string[] = []
  let folders = ['']
  while (folders.length) {
    const listed = await mapConcurrent(folders, async relative => {
      const listing = await files.list(`${root}/${SITE_PAGES_DIR}${relative ? `/${relative}` : ''}`) as {
        entries?: { name?: string; isDirectory?: boolean }[]
      }
      return { relative, entries: listing?.entries ?? [] }
    })
    folders = []
    for (const { relative, entries } of listed) for (const entry of entries) {
      if (!entry.name) continue
      const path = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory) folders.push(path)
      else if (/\.html?$/i.test(entry.name)) paths.push(path)
    }
  }
  const entries = await mapConcurrent(paths, async path => [path, await files.read(`${root}/${SITE_PAGES_DIR}/${path}`)] as const)
  // Older packages stored definitions only in generated output. Migrate once;
  // an explicit saved [] must never resurrect those old definitions.
  const collections = collectionsText === null
    ? parseCollections(await files.read(`${root}/${SITE_BUILD_DIR}/.herenow/data.json`).catch(() => ''))
    : savedCollections(collectionsText)
  return { title: manifest.title, manifest, styles, collections,
    pages: entries.length ? Object.fromEntries(entries) : createDefaultSiteDocument().pages }
}
