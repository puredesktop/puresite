import { describe, expect, it, vi } from 'vitest'
import { prepareSiteHandler } from './handlers'
import type { SiteAgentToolContext } from './catalog'
import { siteDesignGuide } from '../lib/draftSite'
import { createDefaultSiteDocument, starterPageHtml } from '../lib/siteDocument'

/** What App's prepareDrawerRequest resolves with: the saved request, the guide and the files. */
function preparedRequest(pageCount: number) {
  const document = createDefaultSiteDocument()
  const paragraph = '<p>' + 'A paragraph of real site copy that grows with the page. '.repeat(20) + '</p>'
  for (let i = 1; i < pageCount; i++) {
    document.pages[`page-${i}/index.html`] = starterPageHtml(`Page ${i}`, `page-${i}/index.html`).replace(
      '</main>',
      `${paragraph.repeat(4)}</main>`,
    )
  }
  return {
    id: 'req-1',
    path: '/sites/My site.site',
    baseHash: 'site-hash-abc',
    document,
    kind: 'draft' as const,
    prompt: 'A site for a small bakery',
    pages: [],
    images: [{ name: 'hero.png', sha256: 'f'.repeat(64) }],
    status: 'prepared' as const,
    guide: siteDesignGuide('auto'),
    material: [{ name: 'hero.png', reference: 'assets/hero.png', role: 'content', kind: 'image' }],
  }
}

describe('prepareSite reply', () => {
  it('returns the request identity the commit needs, not the site', async () => {
    const prepared = preparedRequest(8)
    const prepareSite = vi.fn().mockResolvedValue(prepared)
    const context = { prepareSite } as unknown as SiteAgentToolContext
    const result = await prepareSiteHandler(context, { brief: 'A bakery' })
    expect(prepareSite).toHaveBeenCalledWith({ brief: 'A bakery' })
    const reply = JSON.parse(result.content as string)
    expect(reply).toMatchObject({
      requestId: 'req-1',
      baseHash: 'site-hash-abc',
      path: '/sites/My site.site',
      kind: 'draft',
      status: 'prepared',
      sitePages: 8,
      images: 1,
    })
    expect(reply.nextAction).toContain('getDrawerRequest')
    expect(reply).not.toHaveProperty('document')
    expect(reply).not.toHaveProperty('guide')
    expect(reply).not.toHaveProperty('material')

    const before = JSON.stringify(prepared).length
    const after = (result.content as string).length
    console.info(`prepareSite reply chars: before ${before}, after ${after}`)
    expect(after).toBeLessThan(1000)
    // Does not grow with the site.
    const bigger = await prepareSiteHandler(
      { prepareSite: vi.fn().mockResolvedValue(preparedRequest(30)) } as unknown as SiteAgentToolContext,
      {},
    )
    expect((bigger.content as string).length).toBeLessThan(after + 10)
  })
})
