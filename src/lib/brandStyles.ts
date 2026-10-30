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

/** The files to bring in, each under a flat, prefixed name so nothing collides with the site's own. */
export function brandAssets(system: DesignSystem, brandPath: string): BrandAsset[] {
  const dir = brandPath.replace(/\/[^/]*$/, '')
  const out: BrandAsset[] = []
  for (const font of system.fonts ?? []) out.push({ from: `${dir}/${font.file}`, name: `brand-font-${safe(base(font.file))}`, role: 'font' })
  for (const logo of system.logos ?? []) out.push({ from: `${dir}/${logo.file}`, name: `brand-logo-${safe(base(logo.file))}`, role: 'logo' })
  for (const motif of system.motifs ?? []) if (motif.file) out.push({ from: `${dir}/${motif.file}`, name: `brand-motif-${safe(base(motif.file))}`, role: 'motif' })
  for (const ref of system.references ?? []) out.push({ from: `${dir}/${ref.file}`, name: `brand-reference-${safe(base(ref.file))}`, role: 'reference' })
  return out
}

const roleColor = (system: DesignSystem, role: string) => system.tokens.colors?.palette?.find(entry => entry.role === role)?.hex
const stack = (family: string | undefined, generic: string) => (family ? `'${family.split(',')[0].trim().replace(/^["']|["']$/g, '')}', ${generic}` : generic)

/** The managed block: @font-face for the brand's own files, then the brand as custom properties. */
export function brandBlock(system: DesignSystem, assets: BrandAsset[]): string {
  const c = system.tokens.colors ?? {}
  const t = system.tokens.typography ?? {}
  const fontFiles = assets.filter(asset => asset.role === 'font')
  const faces = (system.fonts ?? []).map((font, i) =>
    `@font-face { font-family: '${font.family.split(',')[0].trim().replace(/^["']|["']$/g, '')}'; src: url("../assets/${fontFiles[i].name}") format("woff2"); font-weight: ${font.weight ?? 400}; font-style: ${font.style ?? 'normal'}; font-display: swap; }`,
  )
  const motif = assets.find(asset => asset.role === 'motif')
  const props: [string, string | number | undefined][] = [
    ['bg', c.background ?? roleColor(system, 'background')],
    ['surface', c.surface ?? roleColor(system, 'surface')],
    ['ink', c.text ?? roleColor(system, 'text')],
    ['muted', c.muted ?? roleColor(system, 'muted')],
    ['accent', c.accent ?? roleColor(system, 'accent')],
    ['on-accent', c.onAccent],
    ['accent-2', roleColor(system, 'accent2')],
    ['highlight', roleColor(system, 'highlight')],
    ['line', c.border ?? roleColor(system, 'border')],
    ['font-display', t.display ? stack(t.display, 'system-ui, sans-serif') : undefined],
    ['font-body', t.body ? stack(t.body, 'system-ui, sans-serif') : undefined],
    ['font-mono', t.mono ? stack(t.mono, 'ui-monospace, monospace') : undefined],
    ['display-weight', t.displayWeight],
    ['heading-case', t.headingCase === 'upper' ? 'uppercase' : t.headingCase ? 'none' : undefined],
    ['radius', system.tokens.radius !== undefined ? `${system.tokens.radius}px` : undefined],
    ['space', system.tokens.spacing !== undefined ? `${system.tokens.spacing}px` : undefined],
    ['motif', motif ? `url("../assets/${motif.name}")` : undefined],
  ]
  const lines = props.filter(([, value]) => value !== undefined).map(([name, value]) => `  --brand-${name}: ${value};`)
  return [BRAND_BLOCK_START, `/* ${system.name} · revision ${system.revision} */`, ...faces, `:root {`, ...lines, `}`, BRAND_BLOCK_END].join('\n')
}

/** The stylesheet with the brand block in place of any earlier one, at the top. */
export function withBrandBlock(css: string, block: string): string {
  const start = css.indexOf(BRAND_BLOCK_START)
  const end = css.indexOf(BRAND_BLOCK_END)
  const rest = start >= 0 && end > start ? css.slice(0, start) + css.slice(end + BRAND_BLOCK_END.length) : css
  return `${block}\n\n${rest.replace(/^\s+/, '')}`
}
