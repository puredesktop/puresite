/**
 * The part of every site's stylesheet the app writes itself.
 *
 * A site written by an agent tends to be right at 1280 and out of scale at
 * 390: a 70px headline in four lines, cards against the screen edge, a
 * header button wrapping, sections separated by empty bands. So the one
 * stylesheet always opens with a managed foundation block — derived on every
 * save, never edited by hand — that gives every site, by default:
 *
 * - self-hosted @font-face rules for the open faces it names (files written
 *   into `assets/fonts/`), so its type travels;
 * - responsive tokens: one gutter, a vertical spacing scale and a fluid type
 *   scale, all `clamp()`, that step down on small screens;
 * - safe defaults at zero specificity (`:where()`): images that shrink,
 *   headings that break rather than overflow, buttons that never wrap;
 * - a compact header on phones when the site uses the conventional
 *   `.site-header` markup.
 *
 * Author rules follow it and win. What the foundation cannot guarantee, the
 * responsive check measures (responsiveCheck.ts).
 *
 * One rule IS enforced on the author's CSS: negative letter-spacing in em is
 * capped, because tracking tighter than about -0.035em makes the letters of a
 * heavy headline touch.
 */
import { SITE_FONT_FAMILIES, siteFontFamily } from '../fonts/siteFontRegistry'

export const FOUNDATION_START = '/* site:foundation — written by PureSite on every save (responsive tokens, self-hosted fonts, safe defaults). Write your rules after it; it is replaced, not edited. */'
export const FOUNDATION_END = '/* site:foundation:end */'

/** The tightest tracking a site may use, in em. */
export const MIN_TRACKING_EM = -0.035

export const FOUNDATION_TOKENS = `:root {
  --gutter: clamp(20px, 5vw, 56px);
  --max: 1180px;
  --measure: 66ch;
  --space-2xs: clamp(4px, 1vw, 8px);
  --space-xs: clamp(8px, 1.6vw, 12px);
  --space-s: clamp(12px, 2.4vw, 20px);
  --space-m: clamp(18px, 3.6vw, 32px);
  --space-l: clamp(28px, 5.5vw, 56px);
  --space-xl: clamp(40px, 8vw, 88px);
  --space-section: clamp(56px, 9vw, 120px);
  --step--1: clamp(14px, 0.84rem + 0.12vw, 15px);
  --step-0: clamp(16px, 0.94rem + 0.25vw, 18px);
  --step-1: clamp(18px, 0.98rem + 0.6vw, 22px);
  --step-2: clamp(21px, 1.05rem + 1.2vw, 30px);
  --step-3: clamp(26px, 1.1rem + 2.3vw, 44px);
  --step-4: clamp(31px, 1.15rem + 3.6vw, 60px);
  --step-5: clamp(34px, 1.2rem + 4.6vw, 76px);
  --tracking-display: -0.03em;
  --tracking-heading: -0.02em;
  --tracking-label: 0.14em;
}`

const SAFE_DEFAULTS = `:where(*, *::before, *::after) { box-sizing: border-box; }
:where(html) { -webkit-text-size-adjust: 100%; }
:where(body) { margin: 0; overflow-x: clip; }
:where(img, svg, video, canvas, picture) { max-width: 100%; height: auto; }
:where(h1, h2, h3, h4) { overflow-wrap: break-word; text-wrap: balance; }
:where(p, li, figcaption) { text-wrap: pretty; }
:where(button, .button, .btn, a[role="button"]) { white-space: nowrap; }
@media (max-width: 560px) {
  :where(.site-header) { gap: var(--space-s); }
  :where(.site-header nav > a:not(.button):not(.btn)) { display: none; }
  :where(.site-header .button, .site-header .btn) { padding: 10px 14px; font-size: var(--step--1); }
  :where(.brand small, .site-header small) { white-space: nowrap; font-size: 9px; letter-spacing: 0.12em; }
}`

const FAMILY_DECL = /font(?:-family)?\s*:\s*([^;}]+)/gi
const FONT_TOKEN_DECL = /--[\w-]*font[\w-]*\s*:\s*([^;}]+)/gi

/** The bundled families a stylesheet names, in the order they appear. */
export function familiesNamed(css: string): string[] {
  const found = new Set<string>()
  for (const pattern of [FAMILY_DECL, FONT_TOKEN_DECL]) {
    for (const match of css.matchAll(pattern)) {
      for (const part of match[1].split(',')) {
        // `font: 700 17px/1.6 Inter, …` names the family after the size.
        const name = part.trim().replace(/^.*\d(?:px|rem|em|%)?(?:\/[\d.]+\w*)?\s+/, '').replace(/^["']|["']$/g, '')
        const family = siteFontFamily(name)
        if (family) found.add(family.family)
      }
    }
  }
  return SITE_FONT_FAMILIES.filter(family => found.has(family.family)).map(family => family.family)
}

/** The font files a stylesheet needs, as paths under assets/ (`fonts/inter.woff2`). */
export function siteFontFiles(css: string): string[] {
  return familiesNamed(withoutFoundation(css)).flatMap(name => siteFontFamily(name)!.faces.map(face => `fonts/${face.file}`))
}

function fontFaceRules(css: string): string {
  return familiesNamed(css)
    .flatMap(name =>
      siteFontFamily(name)!.faces.map(
        face =>
          `@font-face { font-family: '${name}'; src: url("../assets/fonts/${face.file}") format("woff2"); font-weight: ${face.weight}; font-style: ${face.style}; font-display: swap; }`,
      ),
    )
    .join('\n')
}

export function withoutFoundation(css: string): string {
  const start = css.indexOf(FOUNDATION_START)
  const end = css.indexOf(FOUNDATION_END)
  if (start < 0 || end < start) return css
  return (css.slice(0, start) + css.slice(end + FOUNDATION_END.length)).replace(/^\s+/, '')
}

/** Negative tracking in em past the cap, brought back to it. Returns the CSS and how many values changed. */
export function capTracking(css: string): { css: string; capped: number } {
  let capped = 0
  const out = css.replace(/letter-spacing\s*:\s*(-\d*\.?\d+)(em|rem)\b/gi, (whole, value: string, unit: string) => {
    if (Number(value) >= MIN_TRACKING_EM) return whole
    capped += 1
    return `letter-spacing: ${MIN_TRACKING_EM}${unit}`
  })
  return { css: out, capped }
}

/**
 * The stylesheet with its foundation current and its tracking capped. Gives
 * back the same string when nothing changes, so an edit that does not touch
 * styles does not touch their bytes.
 */
export function withSiteFoundation(css: string): string {
  const author = capTracking(withoutFoundation(css)).css
  const faces = fontFaceRules(author)
  const block = [FOUNDATION_START, faces, FOUNDATION_TOKENS, SAFE_DEFAULTS, FOUNDATION_END].filter(Boolean).join('\n')
  const next = `${block}\n\n${author}`
  return next === css ? css : next
}
