/**
 * Does the page hold together on a phone and a tablet?
 *
 * A page that looks right at 1280 can be out of scale at 390: a header
 * button wrapping onto two lines, a headline in five, cards against the
 * screen edge, a 12px caption, empty bands where a desktop's generous
 * spacing did not step down, sections that switch between centred and left.
 * None of it shows at the width the page was written at. This measures it.
 *
 * `collectLayout` reads a page rendered in a frame of the given width (DOM
 * and layout only); `analyseLayout` turns what was read into findings, as a
 * pure function the tests drive with plain boxes.
 */

export interface TextBox {
  /** A short selector-ish label, for the finding. */
  label: string
  text: string
  left: number
  right: number
  top: number
  bottom: number
  fontSize: number
  /** Distinct line boxes the text occupies. */
  lines: number
  align: string
  letterSpacingEm: number
  kind: 'heading' | 'h1' | 'button' | 'text' | 'card' | 'media'
  /** Text wider than its box: it overflows rather than wraps. */
  overflows?: boolean
  /** Spans the whole viewport (a band with its own background): its edges are not a gutter. */
  fullBleed?: boolean
  /** The section it belongs to, by order. */
  section?: number
}

export interface LayoutRead {
  width: number
  scrollWidth: number
  boxes: TextBox[]
}

export interface LayoutFinding {
  code:
    | 'button-wraps'
    | 'button-overflows'
    | 'headline-lines'
    | 'narrow-gutter'
    | 'small-text'
    | 'empty-band'
    | 'mixed-alignment'
    | 'tight-tracking'
    | 'sideways-scroll'
  width: number
  message: string
  fix: string
}

export interface LayoutLimits {
  minGutter: number
  minTextPx: number
  /** Most lines for the page's main headline. */
  maxHeadlineLines: number
  /** A gap between content taller than this reads as an empty band. */
  maxBand: number
  minTrackingEm: number
}

export function limitsFor(width: number): LayoutLimits {
  return {
    minGutter: width <= 480 ? 16 : 24,
    minTextPx: 14,
    maxHeadlineLines: width <= 480 ? 3 : 3,
    maxBand: width <= 480 ? 160 : width <= 900 ? 220 : 320,
    minTrackingEm: -0.035,
  }
}

const clip = (text: string, max = 48) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

export function analyseLayout(read: LayoutRead, limits: LayoutLimits = limitsFor(read.width)): LayoutFinding[] {
  const { width } = read
  const findings: LayoutFinding[] = []
  const push = (finding: Omit<LayoutFinding, 'width'>) => findings.push({ ...finding, width })

  if (read.scrollWidth > width + 1)
    push({
      code: 'sideways-scroll',
      message: `the page is ${Math.round(read.scrollWidth)}px wide in a ${width}px window: it scrolls sideways`,
      fix: 'find the element wider than the screen (a fixed width, a long word, a wide grid) and let it shrink',
    })

  for (const box of read.boxes) {
    if (box.kind === 'button' && box.lines > 1)
      push({
        code: 'button-wraps',
        message: `the button "${clip(box.text)}" wraps onto ${box.lines} lines`,
        fix: 'shorten its words, shrink its padding and type on small screens, or move it; buttons stay on one line',
      })
    if (box.kind === 'button' && box.overflows)
      push({ code: 'button-overflows', message: `the text of "${clip(box.text)}" overflows its button`, fix: 'let the button grow or shorten its words' })
  }

  const h1 = read.boxes.find(box => box.kind === 'h1')
  if (h1 && h1.lines > limits.maxHeadlineLines)
    push({
      code: 'headline-lines',
      message: `the headline "${clip(h1.text)}" runs to ${h1.lines} lines at ${Math.round(h1.fontSize)}px`,
      fix: `size it with the fluid scale (font-size: var(--step-5) or a clamp() whose minimum suits ${width}px) and keep it short, so it takes at most ${limits.maxHeadlineLines} lines`,
    })

  const narrow = read.boxes.filter(
    box =>
      !box.fullBleed &&
      box.kind !== 'media' &&
      (box.left < limits.minGutter - 0.5 || width - box.right < limits.minGutter - 0.5) &&
      box.right > 0 &&
      box.left < width,
  )
  if (narrow.length) {
    const worst = narrow.reduce((a, b) => (Math.min(a.left, width - a.right) <= Math.min(b.left, width - b.right) ? a : b))
    push({
      code: 'narrow-gutter',
      message: `${narrow.length} element${narrow.length === 1 ? '' : 's'} sit closer than ${limits.minGutter}px to the screen edge — "${clip(worst.text || worst.label)}" is ${Math.round(Math.min(worst.left, width - worst.right))}px from it`,
      fix: 'give every section the same side padding, padding-inline: var(--gutter), and keep cards inside it',
    })
  }

  const small = read.boxes.filter(box => box.text.trim() && box.fontSize < limits.minTextPx - 0.25)
  if (small.length)
    push({
      code: 'small-text',
      message: `${small.length} piece${small.length === 1 ? '' : 's'} of text are under ${limits.minTextPx}px — smallest "${clip(small[0].text)}" at ${small.reduce((m, b) => Math.min(m, b.fontSize), 99)}px`,
      fix: `nothing under ${limits.minTextPx}px; use var(--step--1) for the smallest text`,
    })

  const tight = read.boxes.filter(box => (box.kind === 'heading' || box.kind === 'h1') && box.letterSpacingEm < limits.minTrackingEm - 0.001)
  if (tight.length)
    push({
      code: 'tight-tracking',
      message: `"${clip(tight[0].text)}" is tracked at ${tight[0].letterSpacingEm.toFixed(3)}em: the letters touch`,
      fix: `no tighter than ${limits.minTrackingEm}em; use var(--tracking-display)`,
    })

  // Empty bands: the gaps between consecutive content, top to bottom.
  const content = read.boxes.filter(box => box.kind !== 'card').sort((a, b) => a.top - b.top)
  let reach = content[0]?.bottom ?? 0
  for (const box of content.slice(1)) {
    const gap = box.top - reach
    if (gap > limits.maxBand) {
      push({
        code: 'empty-band',
        message: `${Math.round(gap)}px of empty space before "${clip(box.text || box.label)}"`,
        fix: 'step the section spacing down on small screens: padding-block: var(--space-section)',
      })
    }
    reach = Math.max(reach, box.bottom)
  }

  // Sections whose headings are centred and sections whose headings sit left.
  const headings = read.boxes.filter(box => box.kind === 'heading' && box.section !== undefined)
  const centred = headings.filter(box => box.align === 'center')
  const left = headings.filter(box => box.align !== 'center')
  if (centred.length && left.length)
    push({
      code: 'mixed-alignment',
      message: `section headings switch alignment: ${centred.length} centred ("${clip(centred[0].text, 30)}"), ${left.length} left ("${clip(left[0].text, 30)}")`,
      fix: 'pick one alignment for section headings and hold it down the page (the hero may differ)',
    })

  return findings
}

/** Distinct line boxes an element's text occupies. */
function lineCount(doc: Document, element: Element): number {
  const range = doc.createRange()
  range.selectNodeContents(element)
  const tops: number[] = []
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width < 1 || rect.height < 1) continue
    if (!tops.some(top => Math.abs(top - rect.top) < rect.height * 0.5)) tops.push(rect.top)
  }
  return Math.max(tops.length, element.textContent?.trim() ? 1 : 0)
}

const BUTTONISH = 'button, .button, .btn, [class*="button"], a[role="button"], input[type="submit"]'

function label(element: Element): string {
  const cls = element.getAttribute('class')?.trim().split(/\s+/)[0]
  return `${element.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`
}

/** Read the rendered page's text, buttons, cards and media: what analyseLayout needs. */
export function collectLayout(doc: Document, win: Window, width: number): LayoutRead {
  const boxes: TextBox[] = []
  const body = doc.body
  const sections = Array.from(body.querySelectorAll(':scope > section, :scope > main > section, :scope > main > *, :scope > header, :scope > footer'))
  const sectionOf = (element: Element) => {
    const index = sections.findIndex(section => section.contains(element))
    return index < 0 ? undefined : index
  }
  const seen = new Set<Element>()
  const add = (element: Element, kind: TextBox['kind']) => {
    if (seen.has(element)) return
    const rect = element.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const style = win.getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none') return
    seen.add(element)
    const fontSize = Number.parseFloat(style.fontSize) || 16
    const tracking = style.letterSpacing === 'normal' ? 0 : Number.parseFloat(style.letterSpacing) || 0
    boxes.push({
      label: label(element),
      text: (element.textContent ?? '').trim(),
      left: rect.left,
      right: rect.right,
      top: rect.top + win.scrollY,
      bottom: rect.bottom + win.scrollY,
      fontSize,
      lines: kind === 'card' || kind === 'media' ? 0 : lineCount(doc, element),
      align: style.textAlign === 'start' || style.textAlign === 'left' || style.textAlign === 'justify' ? 'left' : style.textAlign,
      letterSpacingEm: tracking / fontSize,
      kind,
      ...(kind === 'button' && element.scrollWidth > element.clientWidth + 1 ? { overflows: true } : {}),
      ...(rect.width >= width - 1 ? { fullBleed: true } : {}),
      section: sectionOf(element),
    })
  }
  const h1 = body.querySelector('h1')
  if (h1) add(h1, 'h1')
  body.querySelectorAll(BUTTONISH).forEach(element => add(element, 'button'))
  body.querySelectorAll('h2, h3').forEach(element => add(element, 'heading'))
  body.querySelectorAll('img, video, picture, svg').forEach(element => add(element, 'media'))
  // Leaf text: every element holding text of its own.
  body.querySelectorAll('p, li, dt, dd, span, small, strong, em, a, label, figcaption, blockquote, td, th, h4, h5, h6, div').forEach(element => {
    const own = Array.from(element.childNodes).some(node => node.nodeType === 3 && node.textContent?.trim())
    if (own) add(element, 'text')
  })
  // Cards: boxes with a background or border that hold content, so their edges count as gutters too.
  body.querySelectorAll('article, li, div, section, aside').forEach(element => {
    if (seen.has(element)) return
    const style = win.getComputedStyle(element)
    const filled = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'
    const bordered = Number.parseFloat(style.borderLeftWidth) > 0 || Number.parseFloat(style.borderTopWidth) > 0
    if ((filled || bordered) && element.textContent?.trim()) add(element, 'card')
  })
  return { width, scrollWidth: doc.documentElement.scrollWidth, boxes }
}
