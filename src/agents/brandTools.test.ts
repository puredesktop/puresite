import { describe, expect, it } from 'vitest'
import type { SiteAgentToolContext } from './catalog'
import { makeImageHandler, useBrandHandler } from './brandTools'

const BRAND = JSON.stringify({
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
})

function site(overrides: Partial<SiteAgentToolContext> = {}) {
  const copied: string[] = []
  const roles: [string, string][] = []
  let styles = 'body { margin: 0 }'
  const context = {
    documentPath: '/Work/Pilot.site',
    get document() {
      return { styles }
    },
    brandFiles: {
      readText: async () => BRAND,
      readBase64: async () => ({ base64: 'iVBORw0KGgo=', mimeType: 'image/png' }),
      copyIn: async (_from: string, name: string) => void copied.push(name),
      writeAsset: async (name: string) => void copied.push(name),
      refresh: async () => {},
    },
    setAssetRole: (name: string, role: string) => void roles.push([name, role]),
    writeStyles: (css: string) => {
      styles = css
      return { hash: 'h2', pageHashes: {}, changed: true, snapshot: null, warning: null }
    },
    generateImage: null,
    ...overrides,
  } as unknown as SiteAgentToolContext
  return { context, copied, roles, styles: () => styles }
}

describe('brand tools on the site', () => {
  it('brings a saved brand in and writes it at the top of the stylesheet', async () => {
    const s = site()
    const result = JSON.parse(String((await useBrandHandler(s.context, { brand: '/Brands/pure-science.designsystem.json', baseHash: 'h1' })).content))
    expect(s.copied).toEqual(['brand-logo-wordmark.png', 'brand-motif-nodes.png'])
    expect(s.roles).toEqual([['brand-logo-wordmark.png', 'logo']])
    expect(s.styles()).toMatch(/^\/\* brand:start/)
    expect(s.styles()).toContain('--brand-motif: url("../assets/brand-motif-nodes.png");')
    expect(s.styles()).toContain('body { margin: 0 }')
    expect(result.brand).toBe('pure.science')
  })

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
