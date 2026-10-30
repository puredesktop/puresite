import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const call = vi.hoisted(() => vi.fn())
const mount = vi.hoisted(() => vi.fn())
vi.mock('@purescience/platform-ui/bridge/client', () => ({ bridge: { call } }))
vi.mock('@purescience/platform-ui/editing', () => ({ mountMeasuringFrame: mount }))
import { measurePage, probeSource, readPageOutline } from './hiddenMeasure'
import { collectLayout } from './responsiveCheck'

const html = '<!doctype html><html><body><h1>Hello</h1></body></html>'
const shellAnswer = { width: 390, height: 741, scrollWidth: 390, scrollHeight: 900, fontsLoaded: true, brokenImages: 0, value: { width: 390, scrollWidth: 390, boxes: [] } }
const setVisibility = (state: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
/** A measuring frame as the kit hands it back: laid out (`alive`) or not. */
const frame = (alive: boolean) => ({
  ok: true,
  frame: { document, window, fontsLoaded: true, measure: (fn: (d: Document, w: Window) => unknown) => (alive ? { ok: true, value: fn(document, window) } : { ok: false, reason: 'dead' }), dispose: vi.fn() },
})

beforeEach(() => {
  call.mockReset()
  mount.mockReset()
})
afterEach(() => setVisibility('visible'))

describe('measuring a page on screen or not', () => {
  it('reads a page in the measuring frame while PureSite is on screen', async () => {
    setVisibility('visible')
    document.body.innerHTML = '<h1>Hello</h1>'
    mount.mockResolvedValue(frame(true))
    const measured = await measurePage(html, { width: 390, height: 741 }, (doc: Document, _win: Window, width: number) => ({ width, title: doc.querySelector('h1')?.textContent }), 390)
    expect(measured).toEqual({ ok: true, value: { width: 390, title: 'Hello' }, fontsLoaded: true, where: 'frame' })
    expect(call).not.toHaveBeenCalled()
  })

  it('lays the page out in the shell while PureSite is hidden', async () => {
    setVisibility('hidden')
    call.mockResolvedValue(shellAnswer)
    const measured = await measurePage(html, { width: 390, height: 741, timeoutMs: 6000 }, collectLayout, 390)
    expect(measured).toEqual({ ok: true, value: shellAnswer.value, fontsLoaded: true, where: 'shell' })
    expect(mount).not.toHaveBeenCalled()
    expect(call).toHaveBeenCalledWith('render.measureHtml', [{ html, width: 390, height: 741, probe: probeSource(collectLayout), args: 390 }])
  })

  it('asks the shell when the frame has no layout, though the tab says it is visible', async () => {
    setVisibility('visible')
    mount.mockResolvedValue(frame(false))
    call.mockResolvedValue({ ...shellAnswer, fontsLoaded: false })
    await expect(measurePage(html, { width: 768, height: 1459 }, collectLayout, 768)).resolves.toMatchObject({ ok: true, fontsLoaded: false, where: 'shell' })
  })

  it('says why when nothing could measure it', async () => {
    setVisibility('hidden')
    call.mockRejectedValue(new Error('Method not allowed: render.measureHtml'))
    await expect(measurePage(html, { width: 390, height: 741 }, collectLayout, 390)).resolves.toEqual({
      ok: false,
      why: 'PureSite is hidden and this PureDesktop cannot measure hidden pages yet: update it, or bring PureSite on screen and check again',
    })
    call.mockRejectedValue(new Error('Measuring took longer than 15 s and stopped.'))
    await expect(measurePage(html, { width: 390, height: 741 }, collectLayout, 390)).resolves.toMatchObject({ ok: false, why: expect.stringContaining('Measuring took longer than 15 s') })
  })

  it('sends readings that run apart from PureSite', () => {
    document.body.innerHTML = '<section><h1>Hello</h1><a class="button">Book</a><p>Words</p></section>'
    // Evaluated in a fresh scope, as the shell does: a reading that leaned on a module-level name would throw here.
    const probe = (source: string) => new Function(`return (${source})`)() as (d: Document, w: Window, a: unknown) => unknown
    expect(probe(probeSource(collectLayout))(document, window, 390)).toMatchObject({ width: 390 })
    expect(probe(probeSource(readPageOutline))(document, window, null)).toMatchObject({ overflowX: false })
  })
})
