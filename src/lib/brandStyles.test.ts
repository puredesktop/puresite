import { describe, expect, it } from 'vitest'
import { parseDesignSystem } from '@purescience/platform-ui/design/brief'
import { BRAND_BLOCK_START, brandAssets, brandBlock, withBrandBlock } from './brandStyles'

const brand = parseDesignSystem(
  JSON.stringify({
    format: 'pure-design-system',
    version: 1,
    id: 'pure-science',
    name: 'pure.science',
    revision: '2026-10-29',
    guidelines: [],
    components: [],
    tokens: {
      colors: {
        background: '#0b1222',
        text: '#ffffff',
        accent: '#3b6fe8',
        onAccent: '#ffffff',
        palette: [
          { name: 'Lavender', hex: '#a9b4f5', role: 'accent2' },
          { name: 'Amber', hex: '#f2b84b', role: 'highlight' },
        ],
      },
      typography: { display: 'Inter', body: 'Inter', mono: 'JetBrains Mono', displayWeight: 800 },
      radius: 8,
    },
    fonts: [{ family: 'Inter', weight: 800, file: 'pure-science.brand/fonts/inter.woff2', licence: 'OFL-1.1' }],
    logos: [{ name: 'Wordmark', file: 'pure-science.brand/logos/wordmark.svg', onDark: true }],
    motifs: [{ name: 'Node network', description: 'Glowing nodes.', file: 'pure-science.brand/motifs/node network.png' }],
  }),
)

describe('a brand on the site', () => {
  const assets = brandAssets(brand, '/Brands/pure-science.designsystem.json')

  it('brings the brand files in under flat, prefixed names', () => {
    expect(assets).toEqual([
      { from: '/Brands/pure-science.brand/fonts/inter.woff2', name: 'brand-font-inter.woff2', role: 'font' },
      { from: '/Brands/pure-science.brand/logos/wordmark.svg', name: 'brand-logo-wordmark.svg', role: 'logo' },
      { from: '/Brands/pure-science.brand/motifs/node network.png', name: 'brand-motif-node-network.png', role: 'motif' },
    ])
  })

  it('writes self-hosted faces and the brand as properties', () => {
    const block = brandBlock(brand, assets)
    expect(block).toContain(`@font-face { font-family: 'Inter'; src: url("../assets/brand-font-inter.woff2") format("woff2"); font-weight: 800;`)
    expect(block).toContain('--brand-bg: #0b1222;')
    expect(block).toContain('--brand-accent-2: #a9b4f5;')
    expect(block).toContain('--brand-highlight: #f2b84b;')
    expect(block).toContain("--brand-font-mono: 'JetBrains Mono', ui-monospace, monospace;")
    expect(block).toContain('--brand-motif: url("../assets/brand-motif-node-network.png");')
    expect(block).not.toMatch(/https?:/)
  })

  it('replaces only its own block when applied again', () => {
    const site = 'body { margin: 0 }\n'
    const once = withBrandBlock(site, brandBlock(brand, assets))
    const twice = withBrandBlock(once, brandBlock(brand, assets))
    expect(twice).toBe(once)
    expect(twice.split(BRAND_BLOCK_START)).toHaveLength(2)
    expect(twice.endsWith('body { margin: 0 }\n')).toBe(true)
  })
})
