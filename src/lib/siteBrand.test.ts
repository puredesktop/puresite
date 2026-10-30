import { describe, expect, it } from 'vitest'
import { BRAND_BLOCK_END, BRAND_BLOCK_START } from './brandStyles'
import {
  brandArgument,
  brandChipLabel,
  brandLine,
  effectiveLook,
  keepBrandBlock,
  parseSiteBrand,
  sampleImages,
  wantsHouseStyle,
  withoutBrandBlock,
  type SiteBrand,
} from './siteBrand'
import { compositionFor, type DrawerRequest } from './drawerRequest'
import { createDefaultSiteDocument, parseSiteManifest, serializeSiteManifest } from './siteDocument'

const BLOCK = `${BRAND_BLOCK_START}\n:root { --brand-accent: #3b6fe8; }\n${BRAND_BLOCK_END}`
const HOUSE: SiteBrand = { name: 'pure.science', path: '/o/pure-science.designsystem.json', id: 'organisation:pure-science', source: 'organisation', organisation: 'pure.science', default: true, how: 'house-style' }

describe('the brand a site is in', () => {
  it('says the house style in words', () => {
    expect(brandLine(HOUSE)).toBe('In pure.science, your organisation’s house style')
    expect(brandLine({ name: 'Mine', path: '/b/m.designsystem.json', source: 'own', how: 'chosen' })).toBe('In Mine')
    expect(brandLine(undefined)).toBe('No brand yet')
    expect(brandChipLabel(HOUSE)).toBe('House style · pure.science')
  })

  it('round-trips through the manifest and drops a broken record', () => {
    const manifest = { ...createDefaultSiteDocument().manifest, brand: HOUSE }
    expect(parseSiteManifest(serializeSiteManifest(manifest)).brand).toEqual(HOUSE)
    expect(parseSiteManifest(JSON.stringify({ brand: { name: 'x' } })).brand).toBeUndefined()
  })

  it('starts a new site in the house style only when nothing else is there', () => {
    const fresh = createDefaultSiteDocument()
    expect(wantsHouseStyle(fresh)).toBe(true)
    expect(wantsHouseStyle({ ...fresh, manifest: { ...fresh.manifest, brand: { ...HOUSE, how: 'chosen' } } })).toBe(false)
    expect(wantsHouseStyle({ ...fresh, styles: `${BLOCK}\n${fresh.styles}` })).toBe(false)
    expect(wantsHouseStyle({ ...fresh, manifest: { ...fresh.manifest, look: 'editorial' } })).toBe(false)
    expect(wantsHouseStyle({ ...fresh, manifest: { ...fresh.manifest, look: 'auto' } })).toBe(true)
  })

  it('drafts in the house style while the site is in it', () => {
    expect(effectiveLook({ brand: HOUSE, look: 'house' })).toBe('house')
    expect(effectiveLook({ brand: { ...HOUSE, how: 'chosen' }, look: 'studio' })).toBe('studio')
    expect(effectiveLook({ look: 'house' })).toBe('auto')
  })

  it('keeps the brand block when a whole new stylesheet leaves it out, and can take it off', () => {
    const before = `${BLOCK}\n\nbody { color: var(--brand-accent) }`
    const kept = keepBrandBlock(before, 'h1 { color: red }')
    expect(kept.startsWith(BLOCK)).toBe(true)
    expect(kept).toContain('h1 { color: red }')
    expect(keepBrandBlock(before, `${BLOCK}\nh2 {}`)).toBe(`${BLOCK}\nh2 {}`)
    expect(keepBrandBlock('body {}', 'h1 {}')).toBe('h1 {}')
    expect(withoutBrandBlock(before)).not.toContain('brand:start')
    expect(withoutBrandBlock(before)).toContain('body { color: var(--brand-accent) }')
  })

  it('keeps the brand through a drafted site', () => {
    const current = { ...createDefaultSiteDocument(), styles: `${BLOCK}\n\nbody {}` }
    const request = { kind: 'draft', pages: [], document: current } as unknown as DrawerRequest
    const next = compositionFor(request, { pages: { 'index.html': '<html><body>Hi</body></html>' }, styles: 'main { padding: 0 }' }, current)
    expect(next.styles.startsWith(BLOCK)).toBe(true)
    expect(next.styles).toContain('main { padding: 0 }')
  })

  it('reads a brand argument as a path or an id', () => {
    expect(brandArgument('/b/x.designsystem.json')).toEqual({ path: '/b/x.designsystem.json' })
    expect(brandArgument('organisation:pure-science')).toEqual({ id: 'organisation:pure-science' })
    expect(brandArgument('/b/x.json')).toBeNull()
    expect(brandArgument('')).toBeNull()
  })

  it('takes only absolute picture paths as samples, at most 12', () => {
    expect(sampleImages(['/a.png', 'b.png', '/c.pdf', '/d.webp', 3])).toEqual(['/a.png', '/d.webp'])
    expect(sampleImages(Array.from({ length: 20 }, (_, i) => `/s${i}.png`))).toHaveLength(12)
  })

  it('reads a manifest with a look of house', () => {
    expect(parseSiteManifest(JSON.stringify({ look: 'house' })).look).toBe('house')
  })
})
