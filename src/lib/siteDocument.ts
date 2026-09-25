/**
 * The site document, and its package.
 *
 * A `.site` folder holds `site.json` (title, page order, target, brief, what
 * each asset is), `pages/` (one HTML file per page), `styles/site.css` (one
 * stylesheet every page links), `assets/`, and `build/` (what gets published).
 *
 * The decisive difference from a deck: a website IS many files, so the package
 * holds real ones rather than one document split at build time. That costs a
 * little — the app juggles a set of files instead of a string — and buys the
 * thing that matters: what you preview is what you ship, links between pages
 * are real, and an agent can be handed one page without the rest.
 */
import {
  DEFAULT_HOME_PAGE,
  DEFAULT_SITE_TITLE,
  SITE_STYLESHEET,
} from '../constants'
import type { AssetNote } from './assetNotes'
import type { Collection } from './siteData'

/** Where a page's look comes from, chosen once at scaffold time. */
export type TargetProfile = 'static-host' | 'vps-git' | 'container'

export interface SitePage {
  /** Path under `pages/`, e.g. `index.html` or `work/index.html`. */
  path: string
  /** The <title>, read from the markup — the page's name in the rail. */
  title: string
  /** What the nav calls it; falls back to the title. */
  label: string
}

/**
 * Where a site went when it was published, kept so the NEXT publish — in this
 * session or a later one — updates the same URL instead of minting a new site.
 *
 * The claim token is the reason this lives in the manifest rather than in
 * memory: the host returns it exactly once and it cannot be recovered, so a
 * token that only ever lived in a ref was lost on the first reload.
 */
export interface PublishedRecord {
  /** Tool id of the service it went to. */
  service: string
  slug: string
  /** Anonymous sites only — returned exactly once, never recoverable. */
  claimToken?: string
  url?: string
  /** ISO timestamp of the last successful publish. */
  at?: string
  /**
   * A fingerprint of every page as it was sent, so the app can say what has
   * moved since without asking the network.
   */
  pages?: Record<string, string>
}

export interface SiteManifest {
  /**
   * The page the site is FOR — a nomination form, a booking, a sign-up.
   *
   * Named by the person, never guessed: it is what the Journeys lens measures
   * every other page against, and a site with no single goal is a real
   * answer, not a missing setting.
   */
  goal?: string

  title: string
  /** Page paths in nav order. A page missing from here is still a page. */
  pages: string[]
  target: TargetProfile
  brief: string
  assets: AssetNote[]
  /** Tool ids the person has said can publish this site. */
  publishTools?: string[]
  /** Roughly how many pages drafting should aim for. */
  pageCount?: number
  /** The look chosen in the wizard. */
  look?: string
  published?: PublishedRecord
}

export interface SiteDocument {
  title: string
  /** Page path -> markup. The whole site, in memory. */
  pages: Record<string, string>
  styles: string
  manifest: SiteManifest
  /**
   * Records the published site can hold.
   *
   * Kept as the app's own model and written out as the host's manifest at
   * build time, so the package stays readable and the provider-specific
   * shape is generated rather than hand-maintained.
   */
  collections: Collection[]
}

/**
 * True while a site has never been named.
 *
 * The switcher numbers same-named drafts, so an untouched site can be
 * "Untitled site 7" — still unnamed, and still safe to rename from a draft.
 */
export function isDefaultSiteTitle(title: string): boolean {
  return new RegExp(`^${DEFAULT_SITE_TITLE}(\\s+\\d+)?$`, 'i').test(
    (title ?? '').trim(),
  )
}

/**
 * A page's URL path as the site will serve it.
 *
 * `index.html` is the root; `work/index.html` is `/work/`; anything else keeps
 * its name. This is the one place that mapping lives, so the nav, the checker
 * and the build cannot disagree about what a page is called.
 */
export function urlPathFor(page: string): string {
  if (page === DEFAULT_HOME_PAGE) return '/'
  if (page.endsWith(`/${DEFAULT_HOME_PAGE}`)) {
    return `/${page.slice(0, -DEFAULT_HOME_PAGE.length)}`
  }
  return `/${page}`
}

/** The <title> of a page, which is also its name in the rail. */
export function titleFromPage(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return match ? match[1].trim() : ''
}

export function setPageTitle(html: string, title: string): string {
  const safe = title.replace(/</g, '&lt;')
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${safe}</title>`)
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, match => `${match}\n    <title>${safe}</title>`)
  }
  return html
}

/**
 * How far a page sits from the site root, as a relative prefix.
 *
 * `work/index.html` is one level down, so its stylesheet is `../styles/…`.
 * Getting this wrong is invisible on the home page and breaks every nested
 * one, which is exactly the bug a preview that inlines everything would hide
 * — so the paths written to disk are computed here and inlined separately.
 */
export function relativePrefix(page: string): string {
  const depth = page.split('/').length - 1
  return depth === 0 ? '' : '../'.repeat(depth)
}

export function starterPageHtml(title: string, page = DEFAULT_HOME_PAGE): string {
  const up = relativePrefix(page)
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="${up}${SITE_STYLESHEET}" />
  </head>
  <body>
    <main class="page">
      <h1>${title}</h1>
      <p>Write the page in HTML. Preview it as it will ship. Publish it.</p>
    </main>
  </body>
</html>
`
}

export const STARTER_STYLES = `/* One stylesheet, shared by every page. */
:root {
  --ground: #ffffff;
  --ink: #16181d;
  --ink-soft: #5a6169;
  --accent: #1f6feb;
  --measure: 68ch;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font: 17px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.page {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 72px 24px 96px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

h1 {
  margin: 0;
  font-size: clamp(32px, 6vw, 52px);
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

p { margin: 0; color: var(--ink-soft); }

a { color: var(--accent); }
`

export function createDefaultSiteDocument(): SiteDocument {
  return {
    title: DEFAULT_SITE_TITLE,
    pages: { [DEFAULT_HOME_PAGE]: starterPageHtml(DEFAULT_SITE_TITLE) },
    styles: STARTER_STYLES,
    manifest: {
      title: DEFAULT_SITE_TITLE,
      pages: [DEFAULT_HOME_PAGE],
      target: 'static-host',
      brief: '',
      assets: [],
    },
    collections: [],
  }
}

/**
 * True while the site is still exactly what a new one starts as.
 *
 * Drafting replaces the starter rather than adding beside it, which is only
 * safe while nobody has touched it — so this asks whether the one page is
 * still the untouched starter, not merely whether there is one page.
 */
export function isUntouchedStarter(document: SiteDocument): boolean {
  const pages = Object.keys(document.pages)
  if (pages.length !== 1 || pages[0] !== DEFAULT_HOME_PAGE) return false
  const html = document.pages[DEFAULT_HOME_PAGE] ?? ''
  return (
    html.includes('Write the page in HTML. Preview it as it will ship.') &&
    isDefaultSiteTitle(titleFromPage(html) || document.title)
  )
}

/** A published record that is usable, or nothing — never a partial one. */
function parsePublished(raw: unknown): PublishedRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Partial<PublishedRecord>
  if (typeof record.service !== 'string' || !record.service) return undefined
  if (typeof record.slug !== 'string' || !record.slug) return undefined
  return {
    service: record.service,
    slug: record.slug,
    ...(typeof record.claimToken === 'string' && record.claimToken
      ? { claimToken: record.claimToken }
      : {}),
    ...(typeof record.url === 'string' && record.url ? { url: record.url } : {}),
    ...(typeof record.at === 'string' && record.at ? { at: record.at } : {}),
    ...(record.pages && typeof record.pages === 'object'
      ? { pages: { ...(record.pages as Record<string, string>) } }
      : {}),
  }
}

export function parseSiteManifest(text: string): SiteManifest {
  const base = createDefaultSiteDocument().manifest
  try {
    const parsed = JSON.parse(text) as Partial<SiteManifest>
    const goal = typeof parsed.goal === 'string' ? parsed.goal : undefined
    const published = parsePublished(parsed.published)
    return {
      title: typeof parsed.title === 'string' ? parsed.title : base.title,
      pages: Array.isArray(parsed.pages)
        ? parsed.pages.filter((page): page is string => typeof page === 'string')
        : base.pages,
      target:
        parsed.target === 'vps-git' || parsed.target === 'container'
          ? parsed.target
          : 'static-host',
      brief: typeof parsed.brief === 'string' ? parsed.brief : '',
      assets: Array.isArray(parsed.assets) ? (parsed.assets as AssetNote[]) : [],
      ...(Array.isArray(parsed.publishTools)
        ? {
            publishTools: parsed.publishTools.filter(
              (id): id is string => typeof id === 'string',
            ),
          }
        : {}),
      ...(typeof parsed.pageCount === 'number' &&
      Number.isFinite(parsed.pageCount)
        ? { pageCount: Math.max(1, Math.round(parsed.pageCount)) }
        : {}),
      ...(typeof parsed.look === 'string' && parsed.look
        ? { look: parsed.look }
        : {}),
      ...(goal ? { goal } : {}),
      ...(published ? { published } : {}),
    }
  } catch {
    return base
  }
}

export function serializeSiteManifest(manifest: SiteManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * The pages in the order the nav shows them.
 *
 * The manifest holds the order and the folder holds the truth, so a page
 * added by hand appears at the end rather than vanishing, and a page deleted
 * by hand stops being listed. Neither side has to be corrected by the other.
 */
export function orderedPages(document: SiteDocument): SitePage[] {
  const present = Object.keys(document.pages)
  const ordered = [
    ...document.manifest.pages.filter(page => present.includes(page)),
    ...present.filter(page => !document.manifest.pages.includes(page)).sort(),
  ]
  return ordered.map(path => {
    const title = titleFromPage(document.pages[path] ?? '')
    return { path, title: title || path, label: title || path }
  })
}
