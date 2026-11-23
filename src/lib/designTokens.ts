/**
 * Interactive Design Tokens & WCAG 2.1 Contrast Studio for PureSite.
 *
 * Reads and writes a managed `/* studio-tokens:start *\/` block inside
 * `styles/site.css`, preserving both the PureSite foundation block and any
 * author CSS below it. Naming any bundled font from `siteFontRegistry.ts`
 * causes `siteFoundation.ts` to automatically self-host its WOFF2 `@font-face`.
 */
import { SITE_FONT_FAMILIES, siteFontFamily } from '../fonts/siteFontRegistry'
import { FOUNDATION_END } from './siteFoundation'

export const STUDIO_TOKENS_START = '/* studio-tokens:start */'
export const STUDIO_TOKENS_END = '/* studio-tokens:end */'

export interface DesignTokens {
  ground: string
  surface: string
  ink: string
  inkSoft: string
  accent: string
  displayFont: string
  bodyFont: string
  monoFont: string
  measureCh: number
  radiusPx: number
  rhythmScale: number
}

export interface DesignPreset {
  id: string
  name: string
  note: string
  tokens: DesignTokens
}

export const DEFAULT_DESIGN_TOKENS: DesignTokens = {
  ground: '#ffffff',
  surface: '#f6f7f8',
  ink: '#14171a',
  inkSoft: '#4e555e',
  accent: '#b3546c',
  displayFont: 'Inter',
  bodyFont: 'Inter',
  monoFont: 'IBM Plex Mono',
  measureCh: 68,
  radiusPx: 3,
  rhythmScale: 1,
}

export const DESIGN_PRESETS: readonly DesignPreset[] = [
  {
    id: 'swiss-editorial',
    name: 'Swiss Editorial',
    note: 'Crisp white sheet, hairline rules, PureSite rose accent.',
    tokens: { ...DEFAULT_DESIGN_TOKENS },
  },
  {
    id: 'warm-paper',
    name: 'Warm Paper',
    note: 'Bookish cream stock with editorial serif display.',
    tokens: {
      ground: '#faf7f2',
      surface: '#f1ebe1',
      ink: '#1c1917',
      inkSoft: '#57534e',
      accent: '#9a3412',
      displayFont: 'Newsreader',
      bodyFont: 'Plus Jakarta Sans',
      monoFont: 'IBM Plex Mono',
      measureCh: 64,
      radiusPx: 2,
      rhythmScale: 1.08,
    },
  },
  {
    id: 'obsidian-ink',
    name: 'Obsidian Ink',
    note: 'Deep charcoal stage with luminous ink and rose signal.',
    tokens: {
      ground: '#111315',
      surface: '#1b1f24',
      ink: '#f3f4f6',
      inkSoft: '#a1a8b3',
      accent: '#e06c88',
      displayFont: 'Space Grotesk',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
      measureCh: 70,
      radiusPx: 4,
      rhythmScale: 1,
    },
  },
  {
    id: 'high-contrast-clear',
    name: 'High-Contrast Clear',
    note: 'Maximum legibility AAA palette for dense documentation.',
    tokens: {
      ground: '#ffffff',
      surface: '#f2f4f7',
      ink: '#0b0d0f',
      inkSoft: '#343b44',
      accent: '#0f4c81',
      displayFont: 'Archivo',
      bodyFont: 'Inter',
      monoFont: 'IBM Plex Mono',
      measureCh: 72,
      radiusPx: 0,
      rhythmScale: 1.05,
    },
  },
  {
    id: 'signal-bold',
    name: 'Signal Bold',
    note: 'Architectural stone ground with vermilion signal accent.',
    tokens: {
      ground: '#f7f7f5',
      surface: '#eaeae6',
      ink: '#111111',
      inkSoft: '#494949',
      accent: '#c81e1e',
      displayFont: 'Montserrat',
      bodyFont: 'DM Sans',
      monoFont: 'JetBrains Mono',
      measureCh: 68,
      radiusPx: 0,
      rhythmScale: 0.96,
    },
  },
]

// ---- Pure WCAG 2.1 contrast math -------------------------------------------

export function normalizeHex(input: string, fallback: string): string {
  const raw = (input || '').trim()
  const short = /^#([0-9a-f]{3})$/i.exec(raw)
  if (short) {
    const [r, g, b] = short[1]!.split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = /^#([0-9a-f]{6})$/i.exec(raw)
  if (full) return `#${full[1]!.toLowerCase()}`
  return fallback
}

export function parseHexColor(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex, '')
  if (!normalized) return null
  const r = Number.parseInt(normalized.slice(1, 3), 16)
  const g = Number.parseInt(normalized.slice(3, 5), 16)
  const b = Number.parseInt(normalized.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return [r, g, b]
}

function linearChannel(channel: number): number {
  const srgb = channel / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.1 relative luminance in [0, 1]. */
export function relativeLuminance(rgb: [number, number, number]): number {
  return (
    0.2126 * linearChannel(rgb[0]) +
    0.7152 * linearChannel(rgb[1]) +
    0.0722 * linearChannel(rgb[2])
  )
}

/** WCAG 2.1 contrast ratio in [1, 21]. */
export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const fg = parseHexColor(foregroundHex)
  const bg = parseHexColor(backgroundHex)
  if (!fg || !bg) return 1
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export type WcagGrade = 'AAA' | 'AA' | 'Fail'

export function wcagGrade(ratio: number, largeText = false): WcagGrade {
  if (largeText) {
    if (ratio >= 4.5) return 'AAA'
    if (ratio >= 3) return 'AA'
    return 'Fail'
  }
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  return 'Fail'
}

/** Pick readable white or near-black ink to sit on top of an accent fill. */
export function readableOnColor(bgHex: string): string {
  const onWhite = contrastRatio('#ffffff', bgHex)
  const onDark = contrastRatio('#111315', bgHex)
  return onWhite >= onDark ? '#ffffff' : '#111315'
}

// ---- CSS serialization & parsing -------------------------------------------

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function cleanFontName(name: string, fallback: string): string {
  const matched = siteFontFamily(name)
  return matched ? matched.family : fallback
}

function fontStack(familyName: string): string {
  const family = siteFontFamily(familyName) ?? SITE_FONT_FAMILIES[0]!
  const fallbacks =
    family.generic === 'serif'
      ? "Georgia, 'Times New Roman', serif"
      : family.generic === 'monospace'
        ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
        : "system-ui, -apple-system, 'Segoe UI', sans-serif"
  return `'${family.family}', ${fallbacks}`
}

export function sanitizeDesignTokens(raw: Partial<DesignTokens>): DesignTokens {
  return {
    ground: normalizeHex(raw.ground ?? '', DEFAULT_DESIGN_TOKENS.ground),
    surface: normalizeHex(raw.surface ?? '', DEFAULT_DESIGN_TOKENS.surface),
    ink: normalizeHex(raw.ink ?? '', DEFAULT_DESIGN_TOKENS.ink),
    inkSoft: normalizeHex(raw.inkSoft ?? '', DEFAULT_DESIGN_TOKENS.inkSoft),
    accent: normalizeHex(raw.accent ?? '', DEFAULT_DESIGN_TOKENS.accent),
    displayFont: cleanFontName(raw.displayFont ?? '', DEFAULT_DESIGN_TOKENS.displayFont),
    bodyFont: cleanFontName(raw.bodyFont ?? '', DEFAULT_DESIGN_TOKENS.bodyFont),
    monoFont: cleanFontName(raw.monoFont ?? '', DEFAULT_DESIGN_TOKENS.monoFont),
    measureCh: Math.round(clampNumber(Number(raw.measureCh), 48, 84, DEFAULT_DESIGN_TOKENS.measureCh)),
    radiusPx: Math.round(clampNumber(Number(raw.radiusPx), 0, 16, DEFAULT_DESIGN_TOKENS.radiusPx)),
    rhythmScale:
      Math.round(clampNumber(Number(raw.rhythmScale), 0.75, 1.4, DEFAULT_DESIGN_TOKENS.rhythmScale) * 100) /
      100,
  }
}

function extractCssVar(css: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*:\\s*([^;\\n}]+)`, 'i')
  const match = pattern.exec(css)
  return match ? match[1]!.trim() : null
}

function extractPrimaryFont(value: string | null, fallback: string): string {
  if (!value) return fallback
  const first = value.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? ''
  return cleanFontName(first, fallback)
}

/** Read the current design tokens from a stylesheet (managed block first, then `:root` fallback). */
export function readDesignTokens(css: string): DesignTokens {
  const start = css.indexOf(STUDIO_TOKENS_START)
  const end = css.indexOf(STUDIO_TOKENS_END)
  const scope = start >= 0 && end > start ? css.slice(start, end) : css

  const ground = normalizeHex(
    extractCssVar(scope, '--ground') ?? extractCssVar(scope, '--brand-bg') ?? '',
    DEFAULT_DESIGN_TOKENS.ground,
  )
  const surface = normalizeHex(
    extractCssVar(scope, '--surface') ?? extractCssVar(scope, '--brand-surface') ?? '',
    DEFAULT_DESIGN_TOKENS.surface,
  )
  const ink = normalizeHex(
    extractCssVar(scope, '--ink') ?? extractCssVar(scope, '--brand-ink') ?? '',
    DEFAULT_DESIGN_TOKENS.ink,
  )
  const inkSoft = normalizeHex(
    extractCssVar(scope, '--ink-soft') ?? extractCssVar(scope, '--brand-muted') ?? '',
    DEFAULT_DESIGN_TOKENS.inkSoft,
  )
  const accent = normalizeHex(
    extractCssVar(scope, '--accent') ?? extractCssVar(scope, '--brand-accent') ?? '',
    DEFAULT_DESIGN_TOKENS.accent,
  )

  const displayFont = extractPrimaryFont(
    extractCssVar(scope, '--font-display') ?? extractCssVar(scope, '--brand-font-display'),
    DEFAULT_DESIGN_TOKENS.displayFont,
  )
  const bodyFont = extractPrimaryFont(
    extractCssVar(scope, '--font-body') ?? extractCssVar(scope, '--brand-font-body'),
    DEFAULT_DESIGN_TOKENS.bodyFont,
  )
  const monoFont = extractPrimaryFont(
    extractCssVar(scope, '--font-mono') ?? extractCssVar(scope, '--brand-font-mono'),
    DEFAULT_DESIGN_TOKENS.monoFont,
  )

  const measureMatch = /([0-9.]+)\s*ch/i.exec(extractCssVar(scope, '--measure') ?? '')
  const radiusMatch = /([0-9.]+)\s*px/i.exec(
    extractCssVar(scope, '--radius') ?? extractCssVar(scope, '--brand-radius') ?? '',
  )
  const rhythmMatch = /([0-9.]+)/.exec(extractCssVar(scope, '--rhythm') ?? '')

  return sanitizeDesignTokens({
    ground,
    surface,
    ink,
    inkSoft,
    accent,
    displayFont,
    bodyFont,
    monoFont,
    measureCh: measureMatch ? Number(measureMatch[1]) : DEFAULT_DESIGN_TOKENS.measureCh,
    radiusPx: radiusMatch ? Number(radiusMatch[1]) : DEFAULT_DESIGN_TOKENS.radiusPx,
    rhythmScale: rhythmMatch ? Number(rhythmMatch[1]) : DEFAULT_DESIGN_TOKENS.rhythmScale,
  })
}

/** Generate the managed `/* studio-tokens:start *\/` CSS block. */
export function renderDesignTokensBlock(rawTokens: DesignTokens): string {
  const t = sanitizeDesignTokens(rawTokens)
  const accentInk = readableOnColor(t.accent)
  const lineColor = `color-mix(in srgb, ${t.ink} 14%, transparent)`
  const displayStack = fontStack(t.displayFont)
  const bodyStack = fontStack(t.bodyFont)
  const monoStack = fontStack(t.monoFont)

  return [
    STUDIO_TOKENS_START,
    `:root {`,
    `  --ground: ${t.ground};`,
    `  --surface: ${t.surface};`,
    `  --ink: ${t.ink};`,
    `  --ink-soft: ${t.inkSoft};`,
    `  --accent: ${t.accent};`,
    `  --accent-ink: ${accentInk};`,
    `  --line: ${lineColor};`,
    `  --brand-bg: ${t.ground};`,
    `  --brand-surface: ${t.surface};`,
    `  --brand-ink: ${t.ink};`,
    `  --brand-muted: ${t.inkSoft};`,
    `  --brand-accent: ${t.accent};`,
    `  --brand-on-accent: ${accentInk};`,
    `  --brand-line: ${lineColor};`,
    `  --font-display: ${displayStack};`,
    `  --font-body: ${bodyStack};`,
    `  --font-mono: ${monoStack};`,
    `  --brand-font-display: ${displayStack};`,
    `  --brand-font-body: ${bodyStack};`,
    `  --brand-font-mono: ${monoStack};`,
    `  --measure: ${t.measureCh}ch;`,
    `  --radius: ${t.radiusPx}px;`,
    `  --brand-radius: ${t.radiusPx}px;`,
    `  --rhythm: ${t.rhythmScale};`,
    `  --space-section: calc(clamp(56px, 9vw, 120px) * var(--rhythm, 1));`,
    `}`,
    `:where(body) {`,
    `  background: var(--ground);`,
    `  color: var(--ink);`,
    `  font-family: var(--font-body);`,
    `  font-size: var(--step-0);`,
    `  line-height: 1.6;`,
    `}`,
    `:where(h1, h2, h3, h4) {`,
    `  font-family: var(--font-display);`,
    `  color: var(--ink);`,
    `}`,
    `:where(code, pre, kbd, .ps-mono) {`,
    `  font-family: var(--font-mono);`,
    `}`,
    STUDIO_TOKENS_END,
  ].join('\n')
}

/** Insert or replace the managed `/* studio-tokens:start *\/` block cleanly inside `styles/site.css`. */
export function withDesignTokens(css: string, tokens: DesignTokens): string {
  const block = renderDesignTokensBlock(tokens)
  const start = css.indexOf(STUDIO_TOKENS_START)
  const end = css.indexOf(STUDIO_TOKENS_END)
  if (start >= 0 && end > start) {
    const before = css.slice(0, start).replace(/\s+$/, '')
    const after = css.slice(end + STUDIO_TOKENS_END.length).replace(/^\s+/, '')
    return [before, block, after].filter(Boolean).join('\n\n') + '\n'
  }
  const foundationEndIdx = css.indexOf(FOUNDATION_END)
  if (foundationEndIdx >= 0) {
    const splitAt = foundationEndIdx + FOUNDATION_END.length
    const before = css.slice(0, splitAt)
    const after = css.slice(splitAt).replace(/^\s+/, '')
    return [before, block, after].filter(Boolean).join('\n\n') + '\n'
  }
  return `${block}\n\n${css.replace(/^\s+/, '')}`
}
