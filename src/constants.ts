/** Everything the app agrees on about where things live and how big they are. */

export const SITE_APP_SLUG = 'site'

/** A site is a folder, and these are the names inside it. */
export const SITE_PACKAGE_SUFFIX = '.site'
export const SITE_MANIFEST_FILE = 'site.json'
export const SITE_PAGES_DIR = 'pages'
export const SITE_STYLESHEET = 'styles/site.css'
export const SITE_ASSETS_DIR = 'assets'
export const SITE_BUILD_DIR = 'build'

/**
 * The app's accent, used for every primary/active state.
 *
 * The shell injects --app-acc per app slug; the oklch fallback is puresite's
 * proposed hue (6) until the shell registers it.
 */
export const APP_ACCENT = 'var(--app-acc, oklch(0.55 0.125 6))'

export const DEFAULT_SITE_TITLE = 'Untitled site'
export const DEFAULT_HOME_PAGE = 'index.html'

/**
 * Widths the stage offers.
 *
 * A website reflows — unlike a slide, its content is SUPPOSED to change shape
 * — so the stage renders at a real width and never scales the page to fit.
 * Checking a layout means looking at it at the size it will be read at.
 */
export const VIEWPORTS = [
  { id: 'phone', label: 'Phone', width: 390, height: 844 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'desktop', label: 'Desktop', width: 1280, height: 900 },
] as const

export type ViewportId = (typeof VIEWPORTS)[number]['id']

export const DEFAULT_VIEWPORT: ViewportId = 'desktop'

/** How long after a change the package is written. */
export const AUTOSAVE_DELAY_MS = 900

/**
 * What a page may weigh once inlined for preview.
 *
 * Preview inlining turns every asset into base64 in one document, so a page
 * of large photographs becomes many megabytes of string. Past this the assets
 * are left as paths — a broken image in the preview is better than a frame
 * that will not paint.
 */
export const MAX_INLINE_BYTES = 12 * 1024 * 1024
