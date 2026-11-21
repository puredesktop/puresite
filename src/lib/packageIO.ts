import { SITE_ASSETS_DIR, SITE_BUILD_DIR, SITE_COLLECTIONS_FILE, SITE_MANIFEST_FILE, SITE_PAGES_DIR, SITE_STYLESHEET } from '../constants'
import { notesFrom, type MaterialItem } from './material'
import { isSafePagePath } from './pages'
import { FIELD_TYPES, NAME_PATTERN, parseCollections, type Collection } from './siteData'
import { createDefaultSiteDocument, orderedPages, parseSiteManifest, serializeSiteManifest, type SiteDocument } from './siteDocument'

const NOT_FOUND_ERROR = /ENOENT|no such file|not found|does not exist/i

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

export function validateCollectionsList(parsed: unknown): Collection[] | null {
  if (
    !Array.isArray(parsed) ||
    !parsed.every(c => {
      if (!c || typeof c !== 'object') return false
      const col = c as Record<string, unknown>
      if (typeof col.name !== 'string' || !NAME_PATTERN.test(col.name)) return false
      if (!Array.isArray(col.fields)) return false
      const fieldsOk = col.fields.every((f: unknown) => {
        if (!f || typeof f !== 'object') return false
        const field = f as { name?: unknown; type?: unknown }
        return (
          typeof field.name === 'string' &&
          NAME_PATTERN.test(field.name) &&
          typeof field.type === 'string' &&
          (FIELD_TYPES as readonly string[]).includes(field.type)
        )
      })
      if (!fieldsOk) return false
      const access = col.access as Record<string, unknown> | undefined
      return (
        !!access &&
        typeof access === 'object' &&
        !Array.isArray(access) &&
        ['read', 'insert', 'update', 'delete'].every(key => {
          const val = access[key]
          return typeof val === 'string' && ['public', 'owner', 'none'].includes(val)
        })
      )
    })
  ) {
    return null
  }
  return parsed as Collection[]
}

function savedCollections(text: string): Collection[] {
  const parsed: unknown = JSON.parse(text)
  const valid = validateCollectionsList(parsed)
  if (!valid) {
    throw new Error('collections.json is not a collection list. Keep the file and repair it before reopening the site.')
  }
  return valid
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
    files.read(`${root}/${SITE_MANIFEST_FILE}`).catch(error => {
      if (NOT_FOUND_ERROR.test(String(error))) return null
      throw error
    }),
    files.read(`${root}/${SITE_STYLESHEET}`).catch(error => {
      if (NOT_FOUND_ERROR.test(String(error))) return createDefaultSiteDocument().styles
      throw error
    }),
    files.read(`${root}/${SITE_COLLECTIONS_FILE}`).catch(error => {
      if (NOT_FOUND_ERROR.test(String(error))) return null
      throw error
    }),
  ])
  const manifest =
    manifestText === null
      ? parseSiteManifest('{}')
      : parseSiteManifest(manifestText, { strict: true })
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
      if (
        !entry.name ||
        entry.name === '.' ||
        entry.name === '..' ||
        /^\.+$/.test(entry.name) ||
        entry.name.includes('/') ||
        entry.name.includes('\\')
      ) {
        continue
      }
      const path = relative ? `${relative}/${entry.name}` : entry.name
      if (!isSafePagePath(path)) continue
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

/** Include nested public material such as assets/fonts, with package-relative names. */
export async function listAssetFiles(root: string, list: PackageFiles['list']): Promise<{ name: string; bytes?: number }[]> {
  const files: { name: string; bytes?: number }[] = []
  const visit = async (folder: string): Promise<void> => {
    const listing = await list(`${root}/${SITE_ASSETS_DIR}${folder ? `/${folder}` : ''}`) as {
      entries?: { name?: string; isDirectory?: boolean; size?: number }[]
    }
    for (const entry of listing?.entries ?? []) {
      if (!entry.name || entry.name === '.' || entry.name === '..' || entry.name.includes('/') || entry.name.includes('\\')) continue
      const name = folder ? `${folder}/${entry.name}` : entry.name
      if (entry.isDirectory) await visit(name)
      else files.push({ name, bytes: entry.size })
    }
  }
  await visit('')
  return files
}
