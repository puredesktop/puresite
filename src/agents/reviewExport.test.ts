import { describe, expect, it, vi } from 'vitest'
import { exportPageHandler } from './handlers'
import type { SiteAgentToolContext } from './catalog'

function fixture() {
  const exportPage = vi.fn().mockResolvedValue({ artifactPaths: ['/site/reviews/page.pdf'] })
  const context = { selectedPage: 'index.html', document: { pages: { 'index.html': '<h1>Home</h1>', 'about/index.html': '<h1>About</h1>' } }, exportPage } as unknown as SiteAgentToolContext
  return { context, exportPage }
}

describe('drawer review export', () => {
  it('exports the current page and returns the artifact', async () => {
    const { context, exportPage } = fixture()
    const result = await exportPageHandler(context, { format: 'pdf' })
    expect(exportPage).toHaveBeenCalledWith({ format: 'pdf', page: 'index.html' })
    expect(JSON.parse(result.content as string).artifactPaths).toEqual(['/site/reviews/page.pdf'])
  })
  it('exports a named page with the requested PNG width', async () => {
    const { context, exportPage } = fixture()
    await exportPageHandler(context, { format: 'png', page: 'about/index.html', width: 390 })
    expect(exportPage).toHaveBeenCalledWith({ format: 'png', page: 'about/index.html', width: 390 })
  })
  it.each([{ format: 'svg' }, { format: 'png', page: '../outside.html' }, { format: 'png', width: 10 }, { format: 'png', width: 390.5 }])('refuses invalid requests before rendering: %j', async args => {
    const { context, exportPage } = fixture()
    await expect(exportPageHandler(context, args)).rejects.toThrow()
    expect(exportPage).not.toHaveBeenCalled()
  })
  it('propagates renderer failures instead of returning a false artifact', async () => {
    const { context, exportPage } = fixture()
    exportPage.mockRejectedValue(new Error('Renderer failed'))
    await expect(exportPageHandler(context, { format: 'pdf' })).rejects.toThrow('Renderer failed')
  })
})
