import { bridge } from '@purescience/platform-ui/bridge/client'
import { mountMeasuringFrame } from '@purescience/platform-ui/editing'

/**
 * Lay a page out at a width and read it, on screen or not.
 *
 * PureSite measures in the kit's measuring frame when it is visible. A hidden
 * PureSite lays nothing out — every frame answers `dead` — so then the shell
 * lays the same page out in a window of its own (`render.measureHtml`) and
 * runs the same reading there. Only when neither can is there no answer, and
 * `why` says so in words a person can act on.
 */

/** A reading of a laid-out page: self-contained (no imports, no module-level names), because it also runs in the shell. */
export type PageReader<T, A> = (doc: Document, win: Window, args: A) => T

export type Measured<T> =
  | { ok: true; value: T; fontsLoaded: boolean; where: 'frame' | 'shell' }
  | { ok: false; why: string }

/** The source of a reading the shell can run apart from PureSite. */
export function probeSource(read: (...args: never[]) => unknown): string {
  return `(doc, win, args) => (${read.toString()})(doc, win, args)`
}

export async function measurePage<T, A>(
  html: string,
  size: { width: number; height: number; timeoutMs?: number },
  read: PageReader<T, A>,
  args: A,
): Promise<Measured<T>> {
  if (window.document.visibilityState !== 'hidden') {
    const mounted = await mountMeasuringFrame(html, size)
    if (!mounted.ok) return { ok: false, why: `the page did not load (${mounted.reason})` }
    const frame = mounted.frame
    const result = frame.measure((doc, win) => read(doc, win, args), frame.document.documentElement)
    const fontsLoaded = frame.fontsLoaded
    frame.dispose()
    if (result.ok) return { ok: true, value: result.value, fontsLoaded, where: 'frame' }
  }
  // Hidden, or a frame with no layout: the shell lays the page out instead.
  try {
    const measured = (await bridge.call('render.measureHtml', [
      // The shell keeps its own, longer wait: it opens a window before it lays anything out.
      { html, width: size.width, height: size.height, probe: probeSource(read as (...args: never[]) => unknown), args },
    ])) as { value?: T; fontsLoaded?: boolean }
    return { ok: true, value: measured.value as T, fontsLoaded: measured.fontsLoaded !== false, where: 'shell' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      why: /Method not allowed: render\.measureHtml/.test(message)
        ? 'PureSite is hidden and this PureDesktop cannot measure hidden pages yet: update it, or bring PureSite on screen and check again'
        : `PureSite is hidden and the shell could not measure the page (${message}): bring PureSite on screen and check again`,
    }
  }
}

/**
 * What the build's verification needs of a page: its height, whether it
 * scrolls sideways at the viewport it was given (no page here may), and
 * whether its fonts had arrived. Self-contained, like every reading.
 */
export function readPageOutline(doc: Document): { height: number; overflowX: boolean; fontsStatus: 'loaded' | 'loading' | 'unavailable' } {
  const root = doc.documentElement
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts
  return {
    height: root.scrollHeight,
    overflowX: root.scrollWidth > root.clientWidth + 1,
    fontsStatus: !fonts ? 'unavailable' : fonts.status === 'loaded' ? 'loaded' : 'loading',
  }
}
