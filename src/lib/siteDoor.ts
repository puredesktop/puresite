/**
 * The site's one door, and the shape of what goes through it.
 *
 * Every change to the site — a page typed into, a tool call, an ask, a
 * restore, the wizard's draft — is a `SiteEditRequest` that the kit's
 * `applyEdit` admits or refuses. What this module adds to the kit is the
 * site's shape:
 *
 *   - `next` may be a TRANSFORM. The board's own edits are pure `*In`
 *     functions from one document to the next; handed to the door as a
 *     function they run against the document as it is at landing time,
 *     which is what "rebase a hand edit" means here — re-run it, never
 *     merge two strings.
 *   - a `baseHash` may be PAGE-SCOPED. A tool (or the ask loop) that read
 *     one page names that page's hash and the page; the door checks it
 *     against that page as it is now, so an edit to about/ is not refused
 *     because someone retitled the home page meanwhile.
 *
 * Snapshots are the site as one JSON — every page, the stylesheet, the
 * manifest minus where the site went, the collections — so a restore puts
 * the whole site back and can never carry an old `published` record (and
 * its one-time claim token) over the live one.
 */
import {
  applyEdit,
  STALE_MANUAL_MESSAGE,
  type EditOrigin,
  type EditOutcome,
} from '@purescience/platform-ui/editing/editDoor'
import { visibleTextChars } from '@purescience/platform-ui/editing/revisionHistory'
import { pageHash, pageHashes, siteHash, manifestWithoutPublished } from './siteHash'
import type { SiteDocument, SiteManifest } from './siteDocument'
import { parseSiteManifest } from './siteDocument'
import type { Collection } from './siteData'

export interface SiteEditRequest {
  /**
   * The next document, or a transform of the current one. Hand edits are
   * transforms: computed against the live document when they land, they
   * cannot be stale, and a stale `baseHash` merely re-runs them.
   */
  next: SiteDocument | ((current: SiteDocument) => SiteDocument)
  origin: EditOrigin
  /** The hash the edit was computed against: the site's, or — with `page` — that page's. */
  baseHash?: string
  /** When set, `baseHash` is checked against this page's hash, not the site's. */
  page?: string
  label?: string
}

export type SiteEditOutcome =
  | (Extract<EditOutcome<SiteDocument>, { ok: true }> & { pageHashes: Record<string, string> })
  | Extract<EditOutcome<SiteDocument>, { ok: false }>

export const SITE_REREAD_HINT =
  'call getSiteContext (or readPage for one page) again and redo the edit against the current content'

/** What a stale page-scoped base is told, in the words its origin needs. */
export function pageStaleMessage(
  origin: EditOrigin,
  page: string,
  baseHash: string,
  currentHash: string,
): string {
  if (origin === 'agent') {
    return `the page ${page} changed since your read (hash ${baseHash} → ${currentHash}) — call readPage again and redo the edit against its current html`
  }
  if (origin === 'ask') {
    return `${page} changed while the assistant was working on it — that revision was not applied. Ask again.`
  }
  return STALE_MANUAL_MESSAGE
}

function validateSite(next: SiteDocument): string | null {
  if (!next || typeof next !== 'object') return 'that is not a site'
  if (!next.pages || !Object.keys(next.pages).length) {
    return 'a site needs at least one page'
  }
  if (typeof next.styles !== 'string') return 'the stylesheet must be text'
  return null
}

/**
 * Admit an edit against the current site. Pure: the host lands what comes
 * back, snapshots by the kit's policy, and persists.
 */
export function admitSiteEdit(
  request: SiteEditRequest,
  current: { content: SiteDocument; hash: string },
): SiteEditOutcome {
  const transform = typeof request.next === 'function' ? request.next : null
  const next = transform ? transform(current.content) : (request.next as SiteDocument)

  let baseHash = request.baseHash
  if (request.page !== undefined && baseHash !== undefined) {
    const currentPage = pageHash(current.content.pages[request.page] ?? '')
    if (currentPage !== baseHash) {
      // A hand edit computed against the live document re-runs and lands;
      // anything else was computed against a page that is gone.
      if (!(request.origin === 'manual' && transform)) {
        return {
          ok: false,
          reason: 'stale',
          currentHash: currentPage,
          message: pageStaleMessage(request.origin, request.page, baseHash, currentPage),
        }
      }
    }
    // Checked here, against the page; the kit sees a fresh base.
    baseHash = current.hash
  }

  const outcome = applyEdit(
    {
      next,
      origin: request.origin,
      ...(baseHash !== undefined ? { baseHash } : {}),
      ...(request.label ? { label: request.label } : {}),
    },
    current,
    {
      hashOf: siteHash,
      validate: validateSite,
      rebase: transform ? ({ current: latest }) => transform(latest) : undefined,
      rereadHint: SITE_REREAD_HINT,
    },
  )
  if (!outcome.ok) return outcome
  return { ...outcome, pageHashes: pageHashes(outcome.content) }
}

// ---- snapshots -------------------------------------------------------------

export const SITE_SNAPSHOT_SCHEMA = 1

export interface SiteSnapshot {
  schemaVersion: typeof SITE_SNAPSHOT_SCHEMA
  title: string
  pages: Record<string, string>
  styles: string
  manifest: Omit<SiteManifest, 'published'>
  collections: Collection[]
}

/** The site as history keeps it: everything except where it went. */
export function serializeSiteSnapshot(document: SiteDocument): string {
  const snapshot: SiteSnapshot = {
    schemaVersion: SITE_SNAPSHOT_SCHEMA,
    title: document.title,
    pages: document.pages,
    styles: document.styles,
    manifest: manifestWithoutPublished(document.manifest),
    collections: document.collections,
  }
  return JSON.stringify(snapshot)
}

export function parseSiteSnapshot(text: string): SiteSnapshot {
  const parsed = JSON.parse(text) as Partial<SiteSnapshot>
  if (parsed?.schemaVersion !== SITE_SNAPSHOT_SCHEMA) {
    throw new Error('this snapshot was written by another version of PureSite')
  }
  if (!parsed.pages || typeof parsed.pages !== 'object' || !Object.keys(parsed.pages).length) {
    throw new Error('this snapshot holds no pages')
  }
  const manifest = manifestWithoutPublished(
    parseSiteManifest(JSON.stringify(parsed.manifest ?? {})),
  )
  return {
    schemaVersion: SITE_SNAPSHOT_SCHEMA,
    title: typeof parsed.title === 'string' ? parsed.title : manifest.title,
    pages: Object.fromEntries(
      Object.entries(parsed.pages).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
    styles: typeof parsed.styles === 'string' ? parsed.styles : '',
    manifest,
    collections: Array.isArray(parsed.collections) ? (parsed.collections as Collection[]) : [],
  }
}

/**
 * The document a snapshot restores to.
 *
 * `manifest.published` comes from the CURRENT document, never the snapshot:
 * it names where the site is live, and the claim token in it was issued
 * exactly once. Restoring an older record would point the next publish at
 * a site that no longer exists — or at nothing — and orphan the live one.
 */
export function documentFromSnapshot(
  snapshot: Pick<SiteDocument, 'title' | 'pages' | 'styles' | 'collections'> & {
    manifest: Omit<SiteManifest, 'published'> & { published?: unknown }
  },
  current: SiteDocument,
): SiteDocument {
  const published = current.manifest.published
  return {
    title: snapshot.title,
    pages: { ...snapshot.pages },
    styles: snapshot.styles,
    manifest: {
      ...manifestWithoutPublished(snapshot.manifest as SiteManifest),
      ...(published ? { published } : {}),
    },
    collections: snapshot.collections,
  }
}

/** A snapshot as the history store hands it back: a site with nowhere it went. */
export function documentOfSnapshot(text: string): SiteDocument {
  const snapshot = parseSiteSnapshot(text)
  return {
    title: snapshot.title,
    pages: snapshot.pages,
    styles: snapshot.styles,
    manifest: snapshot.manifest,
    collections: snapshot.collections,
  }
}

// ---- the text yardstick ----------------------------------------------------

/** Visible text across every page — what the text-loss warning measures. */
export function siteTextChars(document: Pick<SiteDocument, 'pages'>): number {
  let total = 0
  for (const html of Object.values(document.pages)) {
    // Links are stripped first: a parser that fetches stylesheets (happy-dom
    // does) would otherwise go to the network to count words.
    total += visibleTextChars(html.replace(/<link\b[^>]*>/gi, ''))
  }
  return total
}

/** The same yardstick over a serialized snapshot, for the history store. */
export function snapshotTextChars(serialized: string): number {
  try {
    return siteTextChars(parseSiteSnapshot(serialized))
  } catch {
    return 0
  }
}
