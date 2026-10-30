import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteAgentToolContext } from './catalog'

const bridge = vi.hoisted(() => ({
  offered: false,
  brandsOffered: vi.fn(() => bridge.offered),
  listBrands: vi.fn(async () => [] as unknown[]),
  getBrand: vi.fn(async (_id: string): Promise<unknown> => {
    throw new Error('no such brand')
  }),
  defaultBrand: vi.fn(async () => null),
  proposeBrand: vi.fn(async (_input: unknown) => ({ proposed: true, id: 'p1', organisation: 'pure.science', message: 'Sent to pure.science for approval.' })),
  proposeBrandSamples: vi.fn(async (_input: unknown) => ({ proposed: true, id: 'p2', organisation: 'pure.science', message: 'Samples sent to pure.science for approval.' })),
  onBrandsChanged: vi.fn(() => () => {}),
}))
vi.mock('../bridge/platformBridge', () => ({
  brandsOffered: bridge.brandsOffered,
  listBrands: bridge.listBrands,
  getBrand: bridge.getBrand,
  defaultBrand: bridge.defaultBrand,
  proposeBrand: bridge.proposeBrand,
  proposeBrandSamples: bridge.proposeBrandSamples,
  onBrandsChanged: bridge.onBrandsChanged,
}))

import {
  applyBrand,
  listBrandsHandler,
  makeImageHandler,
  proposeBrandToOrganisationHandler,
  proposeSamplesToOrganisationHandler,
  useBrandHandler,
} from './brandTools'

const SYSTEM = {
  format: 'pure-design-system',
  version: 1,
  id: 'pure-science',
  name: 'pure.science',
  revision: '1',
  guidelines: [],
  components: [],
  tokens: { colors: { background: '#0b1222', text: '#ffffff', accent: '#3b6fe8' }, typography: { display: 'Inter' } },
  logos: [{ name: 'Wordmark', file: 'pure-science.brand/logos/wordmark.png' }],
  motifs: [{ name: 'Nodes', description: 'Glowing nodes.', file: 'pure-science.brand/motifs/nodes.png' }],
}
const BRAND = JSON.stringify(SYSTEM)
const ORG_PATH = '/Users/me/Library/PureDesktop/brands/organisation/pure-science/pure-science.designsystem.json'
const ORG_DETAIL = {
  id: 'organisation:pure-science',
  source: 'organisation',
  name: 'pure.science',
  default: true,
  path: ORG_PATH,
  revision: '1',
  organisation: 'pure.science',
  summary: { palette: [{ name: 'accent', hex: '#3b6fe8', role: 'accent' }], fonts: ['Inter'], logos: 1, motifs: 1, samples: 1 },
  system: SYSTEM,
  folder: ORG_PATH.replace(/\/[^/]*$/, ''),
  files: {},
  samples: [`${ORG_PATH.replace(/\/[^/]*$/, '')}/pure-science.brand/references/site.png`],
}

function site(overrides: Partial<SiteAgentToolContext> = {}) {
  const copied: string[] = []
  const roles: [string, string][] = []
  const landings: { brand: unknown; origin: string; base: unknown }[] = []
  const exports: { page?: string; width?: number }[] = []
  let styles = 'body { margin: 0 }'
  let manifest: Record<string, unknown> = {}
  const context = {
    documentPath: '/Work/Pilot.site',
    selectedPage: 'index.html',
    pageSelection: [],
    get document() {
      return { styles, manifest, pages: { 'index.html': '<html></html>', 'about/index.html': '<html></html>' } }
    },
    brandFiles: {
      readText: async () => BRAND,
      readBase64: async () => ({ base64: 'iVBORw0KGgo=', mimeType: 'image/png' }),
      copyIn: async (_from: string, name: string) => void copied.push(name),
      writeAsset: async (name: string) => void copied.push(name),
      refresh: async () => {},
    },
    setAssetRole: (name: string, role: string) => void roles.push([name, role]),
    writeBrand: (block: string, brand: Record<string, unknown>, base: unknown, origin = 'agent') => {
      styles = `${block}\n\n${styles}`
      manifest = { ...manifest, brand }
      landings.push({ brand, origin, base })
      return { hash: 'h2', pageHashes: {}, changed: true, snapshot: null, warning: null }
    },
    exportPage: async (input: { page?: string; width?: number }) => {
      exports.push(input)
      return { outputPath: `/Work/Pilot.site/reviews/${input.page?.replace(/\//g, '-')}-${input.width}.png` }
    },
    generateImage: null,
    ...overrides,
  } as unknown as SiteAgentToolContext
  const setManifest = (next: Record<string, unknown>) => void (manifest = next)
  return { context, copied, roles, landings, exports, styles: () => styles, manifest: () => manifest, setManifest }
}

const json = async (result: Promise<{ content: unknown }>) => JSON.parse(String((await result).content))

beforeEach(() => {
  bridge.offered = false
  vi.clearAllMocks()
})

describe('useBrand', () => {
  it('brings a saved brand in by path and writes it at the top of the stylesheet', async () => {
    const s = site()
    const result = await json(useBrandHandler(s.context, { brand: '/Brands/pure-science.designsystem.json', baseHash: 'h1' }))
    expect(s.copied).toEqual(['brand-logo-wordmark.png', 'brand-motif-nodes.png'])
    expect(s.roles).toEqual([['brand-logo-wordmark.png', 'logo']])
    expect(s.styles()).toMatch(/^\/\* brand:start/)
    expect(s.styles()).toContain('--brand-motif: url("../assets/brand-motif-nodes.png");')
    expect(s.styles()).toContain('body { margin: 0 }')
    expect(result.brand).toBe('pure.science')
    expect(s.landings[0]).toMatchObject({ origin: 'agent', base: { baseHash: 'h1' }, brand: { name: 'pure.science', how: 'chosen' } })
    // An older shell: no bridge calls at all.
    expect(bridge.getBrand).not.toHaveBeenCalled()
  })

  it('takes an organisation brand by its id and reads its files as plain paths', async () => {
    bridge.offered = true
    bridge.getBrand.mockResolvedValueOnce(ORG_DETAIL)
    const s = site({ brandFiles: { ...site().context.brandFiles, readText: async () => { throw new Error('not read for an id') } } })
    const result = await json(useBrandHandler(s.context, { brand: 'organisation:pure-science', baseHash: 'h1' }))
    expect(bridge.getBrand).toHaveBeenCalledWith('organisation:pure-science')
    expect(result.houseStyle).toBe(true)
    expect(result.in).toBe('In pure.science, your organisation’s house style')
    expect(result.samples).toEqual(ORG_DETAIL.samples)
    expect(s.manifest().brand).toMatchObject({ id: 'organisation:pure-science', source: 'organisation', default: true, how: 'chosen', path: ORG_PATH })
  })

  it('refuses a brand id where the desktop does not list brands', async () => {
    await expect(useBrandHandler(site().context, { brand: 'organisation:pure-science', baseHash: 'h1' })).rejects.toThrow(/pass the absolute path/)
  })

  it('puts the house style on through the same path, as the app’s own doing', async () => {
    const s = site()
    await applyBrand(s.context, { system: ORG_DETAIL.system as never, path: ORG_PATH, detail: ORG_DETAIL as never }, 'house-style', {}, 'manual')
    expect(s.landings[0]).toMatchObject({ origin: 'manual', brand: { how: 'house-style', default: true } })
    expect(s.styles()).toMatch(/^\/\* brand:start/)
  })
})

describe('listBrands', () => {
  it('says so when the desktop does not list brands', async () => {
    const result = await json(listBrandsHandler(site().context))
    expect(result.offered).toBe(false)
    expect(result.next).toMatch(/absolute path/)
  })

  it('lists the organisation’s brands with the house style marked and its samples', async () => {
    bridge.offered = true
    bridge.listBrands.mockResolvedValueOnce([
      ORG_DETAIL,
      { ...ORG_DETAIL, id: 'own:/b/x.designsystem.json', source: 'own', name: 'Mine', default: false, organisation: undefined, path: '/b/x.designsystem.json' },
    ])
    bridge.getBrand.mockResolvedValueOnce(ORG_DETAIL)
    const result = await json(listBrandsHandler(site().context))
    expect(result.brands[0]).toMatchObject({ id: 'organisation:pure-science', default: true, samples: ORG_DETAIL.samples, palette: ['accent #3b6fe8'] })
    expect(result.brands[1]).toMatchObject({ name: 'Mine', default: false, samples: 1 })
    expect(result.next).toMatch(/house style.*view_image/)
  })
})

describe('proposing to the organisation', () => {
  it('cannot propose where the desktop does not offer it', async () => {
    await expect(proposeBrandToOrganisationHandler(site().context, { brand: '/b/x.designsystem.json' })).rejects.toThrow(/organisation/)
    await expect(proposeSamplesToOrganisationHandler(site().context, {})).rejects.toThrow(/organisation/)
  })

  it('proposes the site’s own brand when none is named, with the note', async () => {
    bridge.offered = true
    const s = site()
    s.setManifest({ brand: { name: 'Mine', path: '/b/x.designsystem.json', id: 'own:/b/x.designsystem.json', source: 'own', how: 'chosen' } })
    const result = await json(proposeBrandToOrganisationHandler(s.context, { note: 'Our new look' }))
    expect(bridge.proposeBrand).toHaveBeenCalledWith({ id: 'own:/b/x.designsystem.json', note: 'Our new look' })
    expect(result.message).toBe('Sent to pure.science for approval.')
  })

  it('passes the server’s plain words on when it refuses', async () => {
    bridge.offered = true
    bridge.proposeBrand.mockRejectedValueOnce(new Error('This brand has no sample images yet. Add at least one first.'))
    await expect(proposeBrandToOrganisationHandler(site().context, { brand: '/b/x.designsystem.json' })).rejects.toThrow('This brand has no sample images yet. Add at least one first.')
  })

  it('captures the pages asked for, at each width, as samples of the site’s organisation brand', async () => {
    bridge.offered = true
    const s = site()
    s.setManifest({ brand: { name: 'pure.science', path: ORG_PATH, id: 'organisation:pure-science', source: 'organisation', how: 'house-style' } })
    const result = await json(proposeSamplesToOrganisationHandler(s.context, { pages: ['index.html', 'about/index.html'], widths: [1280, 390] }))
    expect(s.exports).toEqual([
      { format: 'png', page: 'index.html', width: 1280 },
      { format: 'png', page: 'index.html', width: 390 },
      { format: 'png', page: 'about/index.html', width: 1280 },
      { format: 'png', page: 'about/index.html', width: 390 },
    ])
    expect(bridge.proposeBrandSamples).toHaveBeenCalledWith({ brand: 'organisation:pure-science', images: result.images })
    expect(result.images).toHaveLength(4)
  })

  it('sends given images as they are, for the house style when the site has no organisation brand', async () => {
    bridge.offered = true
    const s = site()
    await proposeSamplesToOrganisationHandler(s.context, { images: ['/Decks/one.png', '/Decks/two.JPG'], note: 'A great deck' })
    expect(s.exports).toEqual([])
    expect(bridge.proposeBrandSamples).toHaveBeenCalledWith({ images: ['/Decks/one.png', '/Decks/two.JPG'], note: 'A great deck' })
  })

  it('refuses images that are not pictures by path', async () => {
    bridge.offered = true
    await expect(proposeSamplesToOrganisationHandler(site().context, { images: ['deck.pdf'] })).rejects.toThrow(/PNG, JPEG or WebP/)
  })
})

describe('makeImage', () => {
  it('says when there is no image model instead of drawing a substitute', async () => {
    await expect(makeImageHandler(site().context, { prompt: 'glowing nodes' })).rejects.toThrow(/no image model/)
  })

  it('generates background-safe art from the reference and shows it', async () => {
    const requests: { prompt: string; quality?: string; sourceImages?: unknown[] }[] = []
    const s = site({
      generateImage: async request => {
        requests.push(request)
        return { base64: 'iVBORw0KGgo=', mimeType: 'image/png', modelId: 'openai:gpt-image-1' }
      },
    })
    const result = await makeImageHandler(s.context, { prompt: 'Glowing amber and blue nodes', name: 'Hero nodes', reference: 'site.png' })
    expect(JSON.parse(String(result.content)).file).toBe('assets/hero-nodes.png')
    expect(result.images).toHaveLength(1)
    expect(requests[0].quality).toBe('high')
    expect(requests[0].prompt).toMatch(/quiet areas.*No text/)
    expect(requests[0].sourceImages).toHaveLength(1)
  })
})
