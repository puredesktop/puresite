/**
 * Which brand a site is in, and the rules around the organisation's house style.
 *
 * The brand itself lands in the stylesheet as a managed block (brandStyles.ts);
 * the manifest remembers which brand that was and how it got there, so the app
 * can say so ("In pure.science, your organisation's house style") and know what
 * a proposal to the organisation is about. Pure: no bridge, no React.
 */
import { BRAND_BLOCK_END, BRAND_BLOCK_START, withBrandBlock } from './brandStyles'

/** The brand a site is in, as the manifest keeps it. */
export interface SiteBrand {
  name: string
  /** The .designsystem.json it was read from. */
  path: string
  /** The bridge's id (`organisation:…`, `workspace:…`, `own:…`), when the desktop lists brands. */
  id?: string
  source?: 'organisation' | 'workspace' | 'own'
  organisation?: string
  team?: string
  /** The organisation's house style for this person. */
  default?: boolean
  /**
   * `house-style`: put on a new site because nothing else was given — the
   * person picking another look takes it off again. `chosen`: someone asked
   * for this brand, and it stays until someone asks for another.
   */
  how: 'house-style' | 'chosen'
}

export function parseSiteBrand(raw: unknown): SiteBrand | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Partial<SiteBrand>
  if (typeof value.name !== 'string' || !value.name || typeof value.path !== 'string' || !value.path) return undefined
  const source = value.source === 'organisation' || value.source === 'workspace' || value.source === 'own' ? value.source : undefined
  return {
    name: value.name,
    path: value.path,
    ...(typeof value.id === 'string' && value.id ? { id: value.id } : {}),
    ...(source ? { source } : {}),
    ...(typeof value.organisation === 'string' && value.organisation ? { organisation: value.organisation } : {}),
    ...(typeof value.team === 'string' && value.team ? { team: value.team } : {}),
    ...(value.default === true ? { default: true } : {}),
    how: value.how === 'house-style' ? 'house-style' : 'chosen',
  }
}

/** What the bridge says about a brand, as far as the site needs to remember it. */
export function siteBrandFrom(
  entry: { name: string; path: string; id?: string; source?: string; organisation?: string; team?: string; default?: boolean },
  how: SiteBrand['how'],
): SiteBrand {
  return parseSiteBrand({ ...entry, how })!
}

/** The one line the app shows about the site's brand. */
export function brandLine(brand: SiteBrand | undefined): string {
  if (!brand) return 'No brand yet'
  if (brand.default) return `In ${brand.name}, your organisation’s house style`
  if (brand.source === 'organisation') return `In ${brand.name}, one of ${brand.organisation ?? 'your organisation'}’s brands`
  return `In ${brand.name}`
}

export function hasBrandBlock(css: string): boolean {
  const start = css.indexOf(BRAND_BLOCK_START)
  return start >= 0 && css.indexOf(BRAND_BLOCK_END, start) > start
}

/** The managed brand block of a stylesheet, or null. */
export function brandBlockOf(css: string): string | null {
  const start = css.indexOf(BRAND_BLOCK_START)
  const end = css.indexOf(BRAND_BLOCK_END, start)
  return start >= 0 && end > start ? css.slice(start, end + BRAND_BLOCK_END.length) : null
}

/** The stylesheet with its brand block taken out. */
export function withoutBrandBlock(css: string): string {
  const block = brandBlockOf(css)
  if (!block) return css
  const at = css.indexOf(block)
  return (css.slice(0, at) + css.slice(at + block.length)).replace(/\n{3,}/g, '\n\n')
}

/**
 * A whole new stylesheet (a draft, writeStyles) keeps the brand the site is
 * in: an agent writing the stylesheet from scratch forgets the block, and the
 * --brand-* properties its rules use would then point at nothing.
 */
export function keepBrandBlock(previous: string, next: string): string {
  if (hasBrandBlock(next)) return next
  const block = brandBlockOf(previous)
  return block ? withBrandBlock(next, block) : next
}

/**
 * Whether a new site should start in the organisation's house style. Only a
 * site with no brand and no look of its own: never over a brand someone
 * chose, a stylesheet that already carries one, or a look picked in the wizard.
 */
export function wantsHouseStyle(site: { styles: string; manifest: { brand?: SiteBrand; look?: string } }): boolean {
  if (site.manifest.brand) return false
  if (hasBrandBlock(site.styles)) return false
  const look = site.manifest.look
  return !look || look === 'auto' || look === 'house'
}

/** A brand argument: the absolute path of a .designsystem.json, or an id from listBrands. */
export function brandArgument(value: unknown): { path: string } | { id: string } | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const text = value.trim()
  if (text.startsWith('/')) return text.endsWith('.designsystem.json') ? { path: text } : null
  return { id: text }
}

/** Files PureSite copied in from a brand (brandStyles.brandAssets names them so). */
export function isBrandAsset(name: string): boolean {
  return /^brand-(font|logo|motif|reference)-/.test(name)
}

/** Images a sample proposal can carry: absolute PNG, JPEG or WebP paths, at most 12. */
export function sampleImages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.startsWith('/') && /\.(png|jpe?g|webp)$/i.test(item))
    .slice(0, 12)
}

/** The look drafting works from: the house style while the site is in it, else the one picked. */
export function effectiveLook(manifest: { brand?: SiteBrand; look?: string }): string {
  if (manifest.brand?.how === 'house-style') return 'house'
  return manifest.look && manifest.look !== 'house' ? manifest.look : 'auto'
}

/** What the toolbar's brand chip says. */
export function brandChipLabel(brand: SiteBrand | undefined): string {
  if (!brand) return 'No brand'
  return brand.default ? `House style · ${brand.name}` : `Brand · ${brand.name}`
}
