/**
 * A saved brand as the site's own stylesheet.
 *
 * The suite keeps an organisation's look in one format —
 * `<name>.designsystem.json` (pure-design-system v1) with its files beside it
 * in `<name>.brand/`: fonts, logos, generated motifs, the reference images
 * (ps-suite packages/ui/src/design/brief.ts). PureSlides saves one from a
 * deck; Canvas reads the same. Here it becomes a managed block at the top of
 * `styles/site.css`: self-hosted @font-face rules for the brand's woff2 files
 * (copied into `assets/`) and `--brand-*` custom properties the rest of the
 * stylesheet uses. Re-applying a brand replaces the block and nothing else.
 */
import type { DesignSystem } from '@purescience/platform-ui/design/brief'

export const BRAND_BLOCK_START = '/* brand:start — written by useBrand from the organisation’s brand; change the brand, not this block */'
export const BRAND_BLOCK_END = '/* brand:end */'

/** A brand file copied into the site: where it came from (beside the brand) and its flat name in assets/. */
export interface BrandAsset {
  from: string
  name: string
  role: 'font' | 'logo' | 'motif' | 'reference'
}

const safe = (value: string) => value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
const base = (path: string) => path.split('/').pop() ?? path

const DRIVE_PREFIX = /^[a-z]:/i
const ONLY_DOTS = /^\.+$/

/** Resolve a brand-relative file path strictly inside `dir`, rejecting traversal or absolute paths. */
function resolveBrandFile(dir: string, file: string | undefined): string | null {
  if (!file || typeof file !== 'string') return null
  const trimmed = file.trim()
  if (
    !trimmed ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0') ||
    DRIVE_PREFIX.test(trimmed)
  ) {
    return null
  }
  const parts = trimmed.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || ONLY_DOTS.test(part) || DRIVE_PREFIX.test(part))) {
    return null
  }
  const normalizedDir = dir.replace(/\/+$/, '')
  const resolved = normalizedDir ? `${normalizedDir}/${parts.join('/')}` : parts.join('/')
  if (normalizedDir && !resolved.startsWith(`${normalizedDir}/`)) return null
  return resolved
}

function uniqueAssetName(prefix: string, file: string, taken: Set<string>): string {
  const cleaned = safe(base(file))
  const candidate = `${prefix}-${cleaned}`
  if (!taken.has(candidate)) {
    taken.add(candidate)
    return candidate
  }
  const dot = cleaned.lastIndexOf('.')
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned
  const ext = dot > 0 ? cleaned.slice(dot) : ''
  let n = 2
  while (taken.has(`${prefix}-${stem}-${n}${ext}`)) n += 1
  const next = `${prefix}-${stem}-${n}${ext}`
  taken.add(next)
  return next
}

/** The files to bring in, each under a flat, prefixed name so nothing collides with the site's own. */
export function brandAssets(system: DesignSystem, brandPath: string): BrandAsset[] {
  const dir = brandPath.replace(/\/[^/]*$/, '')
  const out: BrandAsset[] = []
  const taken = new Set<string>()
  const push = (file: string | undefined, role: BrandAsset['role']) => {
    const from = resolveBrandFile(dir, file)
    if (!from || !file) return
    out.push({ from, name: uniqueAssetName(`brand-${role}`, file, taken), role })
  }
  for (const font of system.fonts ?? []) push(font.file, 'font')
  for (const logo of system.logos ?? []) push(logo.file, 'logo')
  for (const motif of system.motifs ?? []) if (motif.file) push(motif.file, 'motif')
  for (const ref of system.references ?? []) push(ref.file, 'reference')
  return out
}

const CSS_UNSAFE = /[;{}\r\n\\<>]|\/\*|\*\/|<\/style/i
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i
const NAMED_COLOR = /^[a-z]{3,24}$/i
const SIMPLE_FUNC_COLOR = /^(?:rgba?|hsla?|oklch|oklab|lab|lch)\([0-9a-zA-Z%.,/\s+-]+\)$/i
const ALLOWED_MIX_FUNCS = new Set(['color-mix', 'rgb', 'rgba', 'hsl', 'hsla', 'oklch', 'oklab', 'lab', 'lch'])
const SAFE_FONT_STYLE = /^(?:normal|italic|oblique)$/i
const SAFE_FONT_WEIGHT = /^(?:normal|bold|lighter|bolder|[1-9]\d{0,2}(?:\s+[1-9]\d{0,2})?|1000)$/i

function cleanComment(value: unknown): string {
  return String(value ?? '')
    .replace(/[*/<>]+/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
}

function cleanFamily(family: string | undefined): string {
  if (!family) return ''
  let out = family.split(',')[0].trim().replace(/^["']|["']$/g, '')
  out = out.replace(/[;{}\r\n"'\\<>*/]+/g, '').trim()
  return out
}

function isSafeColorMix(value: string): boolean {
  if (!/^color-mix\(/i.test(value) || !value.endsWith(')')) return false
  if (!/^[0-9a-zA-Z%.,/#\s()+-]+$/.test(value)) return false
  let depth = 0
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1
    else if (value[i] === ')') {
      depth -= 1
      if (depth < 0) return false
      if (depth === 0 && i !== value.length - 1) return false
    }
  }
  if (depth !== 0) return false
  for (const match of value.matchAll(/([a-z-]+)\s*\(/gi)) {
    if (!ALLOWED_MIX_FUNCS.has(match[1]!.toLowerCase())) return false
  }
  return true
}

function cleanColor(value: string | undefined): string | undefined {
  if (!value || typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (
    !trimmed ||
    CSS_UNSAFE.test(trimmed) ||
    /\b(?:url|src|image-set|cross-fade|expression|var)\s*\(/i.test(trimmed)
  ) {
    return undefined
  }
  if (HEX_COLOR.test(trimmed) || NAMED_COLOR.test(trimmed)) return trimmed
  if (SIMPLE_FUNC_COLOR.test(trimmed)) return trimmed
  if (isSafeColorMix(trimmed)) return trimmed
  return undefined
}

function cleanWeight(value: string | number | undefined): string | number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 1 && value <= 1000 ? Math.round(value) : undefined
  }
  const trimmed = String(value).trim()
  return SAFE_FONT_WEIGHT.test(trimmed) ? trimmed : undefined
}

function cleanStyle(value: string | undefined): string {
  if (!value) return 'normal'
  const trimmed = value.trim().toLowerCase()
  return SAFE_FONT_STYLE.test(trimmed) ? trimmed : 'normal'
}

function fontFormat(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.woff2')) return 'woff2'
  if (lower.endsWith('.woff')) return 'woff'
  if (lower.endsWith('.ttf')) return 'truetype'
  if (lower.endsWith('.otf')) return 'opentype'
  return 'woff2'
}

function cleanAssetFileName(name: string): string {
  return name.replace(/["'()\\;\r\n<>/*{}]+/g, '')
}

const roleColor = (system: DesignSystem, role: string) => system.tokens.colors?.palette?.find(entry => entry.role === role)?.hex
const stack = (family: string | undefined, generic: string) => {
  const cleaned = cleanFamily(family)
  return cleaned ? `'${cleaned}', ${generic}` : generic
}

/** The managed block: @font-face for the brand's own files, then the brand as custom properties. */
export function brandBlock(system: DesignSystem, assets: BrandAsset[]): string {
  const c = system.tokens.colors ?? {}
  const t = system.tokens.typography ?? {}
  const fontFiles = assets.filter(asset => asset.role === 'font')
  const validFonts = (system.fonts ?? []).filter(font => resolveBrandFile('/brand', font.file) !== null)
  const faces = validFonts.flatMap((font, i) => {
    const file = fontFiles[i]
    const family = cleanFamily(font.family)
    if (!file || !family) return []
    const assetFile = cleanAssetFileName(file.name)
    const weight = cleanWeight(font.weight) ?? 400
    const style = cleanStyle(font.style)
    return [
      `@font-face { font-family: '${family}'; src: url("../assets/${assetFile}") format("${fontFormat(assetFile)}"); font-weight: ${weight}; font-style: ${style}; font-display: swap; }`,
    ]
  })
  const motif = assets.find(asset => asset.role === 'motif')
  const props: [string, string | number | undefined][] = [
    ['bg', cleanColor(c.background ?? roleColor(system, 'background'))],
    ['surface', cleanColor(c.surface ?? roleColor(system, 'surface'))],
    ['ink', cleanColor(c.text ?? roleColor(system, 'text'))],
    ['muted', cleanColor(c.muted ?? roleColor(system, 'muted'))],
    ['accent', cleanColor(c.accent ?? roleColor(system, 'accent'))],
    ['on-accent', cleanColor(c.onAccent)],
    ['accent-2', cleanColor(roleColor(system, 'accent2'))],
    ['highlight', cleanColor(roleColor(system, 'highlight'))],
    ['line', cleanColor(c.border ?? roleColor(system, 'border'))],
    ['font-display', t.display ? stack(t.display, 'system-ui, sans-serif') : undefined],
    ['font-body', t.body ? stack(t.body, 'system-ui, sans-serif') : undefined],
    ['font-mono', t.mono ? stack(t.mono, 'ui-monospace, monospace') : undefined],
    ['display-weight', cleanWeight(t.displayWeight)],
    ['heading-case', t.headingCase === 'upper' ? 'uppercase' : t.headingCase ? 'none' : undefined],
    ['radius', typeof system.tokens.radius === 'number' && Number.isFinite(system.tokens.radius) ? `${system.tokens.radius}px` : undefined],
    ['space', typeof system.tokens.spacing === 'number' && Number.isFinite(system.tokens.spacing) ? `${system.tokens.spacing}px` : undefined],
    ['motif', motif ? `url("../assets/${cleanAssetFileName(motif.name)}")` : undefined],
  ]
  const lines = props.filter(([, value]) => value !== undefined).map(([name, value]) => `  --brand-${name}: ${value};`)
  return [BRAND_BLOCK_START, `/* ${cleanComment(system.name)} · revision ${cleanComment(system.revision)} */`, ...faces, `:root {`, ...lines, `}`, BRAND_BLOCK_END].join('\n')
}

/** The stylesheet with the brand block in place of any earlier one, at the top. */
export function withBrandBlock(css: string, block: string): string {
  const start = css.indexOf(BRAND_BLOCK_START)
  const end = css.indexOf(BRAND_BLOCK_END)
  const rest = start >= 0 && end > start ? css.slice(0, start) + css.slice(end + BRAND_BLOCK_END.length) : css
  return `${block}\n\n${rest.replace(/^\s+/, '')}`
}
