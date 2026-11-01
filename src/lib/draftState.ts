/**
 * What readers have, and what you have.
 *
 * A site being edited is two things at once: the pages in front of you and the
 * pages the world is reading. The app knew the difference and never said it,
 * so publishing was a guess about what would move. Publishing records a
 * fingerprint of every page it sent; from those, each page here is new,
 * changed, or exactly what is live — and a page that is live and gone from
 * here is a removal, which is the one a reader notices most.
 *
 * Pure, and offline: the comparison never needs the network. Fetching the live
 * page to look at it beside the draft is a separate, deliberate act.
 */
import type { PublishedRecord, SiteDocument } from './siteDocument'
import { requiredAssetNames } from './buildSite'
import { urlPathFor } from './siteDocument'

export type PageState = 'new' | 'changed' | 'same' | 'removed' | 'unknown'

export interface PageDifference {
  page: string
  url: string
  state: PageState
}

export interface DraftState {
  /** Nothing has ever been published, so there is nothing to compare with. */
  neverPublished: boolean
  pages: PageDifference[]
  /** Pages a reader would meet for the first time. */
  added: string[]
  /** Pages a reader has seen, which read differently now. */
  edited: string[]
  /** Pages a reader can reach today and could not after publishing. */
  removed: string[]
  stylingChanged: boolean
  assetsChanged: string[]
  /** Missing historical evidence or unreadable current required asset bytes. */
  incomplete: boolean
  comparisonNotes: string[]
  /** True only when all comparison data is complete and matches. */
  matchesLive: boolean
}

/**
 * A fingerprint of one page's text.
 *
 * Not a cryptographic hash: it only has to change when the page does, and be
 * the same on any machine, so a site published from a laptop reads as
 * unchanged on a desktop.
 */
export function pageFingerprint(html: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let index = 0; index < html.length; index += 1) {
    const code = html.charCodeAt(index)
    a = Math.imul(a ^ code, 0x01000193) >>> 0
    b = (Math.imul(b + code, 0x85ebca6b) ^ (b >>> 13)) >>> 0
  }
  return `${a.toString(36)}${b.toString(36)}`
}

/** Every page's fingerprint, to record with a publish. */
export function fingerprintPages(pages: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [page, html] of Object.entries(pages)) out[page] = pageFingerprint(html)
  return out
}

/** How this site differs from the one that is published. */
export function draftState(
  document: SiteDocument,
  published: PublishedRecord | undefined,
  assetFingerprints?: Record<string, string>,
): DraftState {
  const live = published?.pages
  if (!published) {
    return {
      neverPublished: true,
      pages: Object.keys(document.pages).map(page => ({
        page,
        url: urlPathFor(page),
        state: 'new' as const,
      })),
      added: Object.keys(document.pages),
      edited: [],
      removed: [],
      stylingChanged: false,
      assetsChanged: [],
      incomplete: false,
      comparisonNotes: [],
      matchesLive: false,
    }
  }

  const pages: PageDifference[] = []
  const added: string[] = []
  const edited: string[] = []
  for (const [page, html] of Object.entries(document.pages)) {
    const was = live?.[page]
    const state: PageState = !live ? 'unknown' : !was ? 'new' : was === pageFingerprint(html) ? 'same' : 'changed'
    pages.push({ page, url: urlPathFor(page), state })
    if (state === 'new' && live) added.push(page)
    if (state === 'changed') edited.push(page)
  }

  const removed = Object.keys(live ?? {}).filter(page => document.pages[page] === undefined)
  for (const page of removed) pages.push({ page, url: urlPathFor(page), state: 'removed' })

  const comparisonNotes: string[] = []
  if (!live) comparisonNotes.push('The last publication has no page comparison data.')
  if (published.styles === undefined) comparisonNotes.push('The last publication has no styling comparison data.')
  if (published.assets === undefined) comparisonNotes.push('The last publication has no asset comparison data.')
  const paths = requiredAssetNames(document).map(name => `assets/${name}`)
  const unreadable = paths.filter(path => assetFingerprints?.[path] === undefined)
  if (unreadable.length) comparisonNotes.push(`Required asset bytes are not available for comparison: ${unreadable.join(', ')}.`)
  const stylingChanged = published.styles !== undefined && published.styles !== pageFingerprint(document.styles)
  const assetsChanged = published.assets === undefined ? [] : [...new Set([...paths, ...Object.keys(published.assets)])].sort().filter(path =>
    !paths.includes(path) || published.assets?.[path] === undefined ||
    (assetFingerprints?.[path] !== undefined && published.assets?.[path] !== assetFingerprints[path]))
  const incomplete = comparisonNotes.length > 0
  return {
    neverPublished: false,
    stylingChanged,
    assetsChanged,
    incomplete,
    comparisonNotes,
    pages,
    added,
    edited,
    removed,
    matchesLive: !incomplete && !stylingChanged && !assetsChanged.length && !added.length && !edited.length && !removed.length,
  }
}

/** The state of one page, for the map and the page panel. */
export function stateOf(state: DraftState, page: string): PageState {
  return state.pages.find(entry => entry.page === page)?.state ?? (state.neverPublished ? 'new' : 'unknown')
}

/** Said the way a person would say it, for the toolbar. */
export function draftSummary(state: DraftState): string {
  if (state.neverPublished) return 'Never published'
  if (state.matchesLive) return 'Matches what is published'
  const parts: string[] = []
  if (state.added.length) parts.push(`${state.added.length} new`)
  if (state.edited.length) parts.push(`${state.edited.length} changed`)
  if (state.removed.length) parts.push(`${state.removed.length} gone`)
  if (state.stylingChanged) parts.push('styling changed')
  if (state.assetsChanged.length) parts.push(`${state.assetsChanged.length} asset${state.assetsChanged.length === 1 ? '' : 's'} changed`)
  if (state.incomplete) parts.push('comparison incomplete')
  return `Draft · ${parts.join(', ')}`
}

/** Where one page of this site lives once it is published. */
export function liveUrlFor(published: PublishedRecord | undefined, page: string): string | null {
  const base = published?.url?.replace(/\/+$/, '')
  return base ? `${base}${urlPathFor(page)}` : null
}
