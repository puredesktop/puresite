import { bridge } from '@purescience/platform-bridge/client'

/**
 * Publishing to the organisation's own site on PureCloud (pureserver docs/sites.md).
 *
 * The site lives on the organisation's PureServer as a public face: its pages are served from there, at its /p/
 * address or its own domain. The package is the draft. Publishing makes a new version of the site from the saved
 * package (its pages, stylesheet and assets): live now, or at a date. A preview link shows the draft to whoever
 * holds it for half an hour. Every version is kept, and an administrator can put an older one back in the Plane.
 *
 * Offered only where the host lists `site.publish`: a desktop without PureCloud doesn't have it.
 */
const call = (method: string, args: unknown[] = []): Promise<unknown> =>
  (bridge.call as unknown as (method: string, args: unknown[]) => Promise<unknown>)(method, args)

export interface CloudSite { id: string; title: string; address: string; sourcePath: string | null; live: number | null }
export interface CloudVersion { n: number; state: 'live' | 'kept' | 'scheduled'; goLiveAt: number | null; createdAt: number }

export function cloudOffered(): boolean {
  try { return (bridge.getMeta()?.methods ?? []).includes('site.publish') } catch { return false }
}

/** The organisation's sites this person may publish. */
export async function cloudSites(): Promise<CloudSite[]> {
  return ((await call('site.list')) as { sites: CloudSite[] }).sites
}

/** The site this package publishes to: the one it was published to before, or the only one there is. */
export function siteFor(sites: CloudSite[], root: string): CloudSite | null {
  const clean = root.replace(/\/+$/, '')
  return sites.find(s => s.sourcePath === clean) ?? (sites.length === 1 ? sites[0]! : null)
}

/** A link that shows the saved draft for half an hour. */
export async function cloudPreview(site: string, root: string): Promise<string> {
  return ((await call('site.preview', [{ site, path: root.replace(/\/+$/, '') }])) as { url: string }).url
}

/** Publishes the saved package as a new version: now, or at a date (ISO). */
export async function cloudPublish(site: string, root: string, at?: string): Promise<{ version: CloudVersion; url: string }> {
  return (await call('site.publish', [{ site, path: root.replace(/\/+$/, ''), ...(at ? { at } : {}), note: 'Published from PureSite' }])) as { version: CloudVersion; url: string }
}
