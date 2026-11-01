/**
 * Does the page hold together on a phone and a tablet?
 *
 * A page that looks right at 1280 can be out of scale at 390: a header
 * button wrapping onto two lines, a headline in five, cards against the
 * screen edge, a 12px caption, empty bands where a desktop's generous
 * spacing did not step down, sections that switch between centred and left.
 * A header whose links vanish on a phone leaves the rest of the site out of
 * reach. None of it shows at the width the page was written at. This measures it.
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
  /** A card holding a picture (an image, video or svg): its words may be a caption. */
  media?: boolean
  /** Inside the header, the nav or the footer: chrome, not copy. */
  chrome?: boolean
}

export interface MissingNavLink {
  label: string
  href: string
  /** Not shown at all, or shown but cut off by the screen edge or a box. */
  why: 'hidden' | 'clipped'
}

/** Can a reader at this width reach every link in the header? */
export type NavigationRead =
  | {
      status: 'checked'
      /** Links the header holds, shown or not. */
      links: number
      missing: MissingNavLink[]
      /** The working menus that had to be opened to reach them, by name. */
      menus: string[]
      /** A menu that does hold the links, with no name for a screen reader to say. */
      unnamedMenu?: boolean
    }
  | { status: 'incomplete'; why: string }

export interface LayoutRead {
  width: number
  scrollWidth: number
  boxes: TextBox[]
  /** Absent means it was never read, which is not the same as fine. */
  navigation?: NavigationRead
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
    | 'nav-links-hidden'
    | 'nav-check-incomplete'
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

export function analyseLayout(read: LayoutRead, limits: LayoutLimits = limitsFor(read.width), page = 'this page'): LayoutFinding[] {
  const { width } = read
  const findings: LayoutFinding[] = []
  const push = (finding: Omit<LayoutFinding, 'width'>) => findings.push({ ...finding, width })

  if (read.scrollWidth > width + 1)
    push({
      code: 'sideways-scroll',
      message: `the page is ${Math.round(read.scrollWidth)}px wide in a ${width}px window: it scrolls sideways`,
      fix: 'find the element wider than the screen (a fixed width, a long word, a wide grid) and let it shrink',
    })

  const navigation = read.navigation
  if (navigation?.status !== 'checked')
    push({
      code: 'nav-check-incomplete',
      message: `could not tell whether ${page} can be navigated at ${width}px: ${navigation?.why ?? 'its navigation was not read'}`,
      fix: 'this is not a pass. Bring PureSite on screen and check again; a menu that needs a script cannot be proved here, so use a <details class="site-menu"> that opens without one',
    })
  else if (navigation.missing.length) {
    const many = navigation.missing.length > 1
    const names = navigation.missing.slice(0, 6).map(link => `"${clip(link.label || link.href, 30)}"`).join(', ') + (navigation.missing.length > 6 ? `, and ${navigation.missing.length - 6} more` : '')
    const clipped = navigation.missing.every(link => link.why === 'clipped')
    push({
      code: 'nav-links-hidden',
      message: `on ${page} at ${width}px, the header link${many ? 's' : ''} ${names} ${clipped ? `run${many ? '' : 's'} off the screen or out of ${many ? 'their' : 'its'} box` : `${many ? 'are' : 'is'} hidden`} with no working replacement, so a reader there cannot reach ${many ? 'those pages' : 'that page'}${navigation.unnamedMenu ? '. A menu holds them but has no name a screen reader can say: give its control words or an aria-label' : ''}`,
      fix: 'keep the destinations: add <details class="site-menu"><summary>Menu</summary><nav>the same links</nav></details> to the header and mark the row <nav class="site-nav"> (the foundation shows one or the other), or let the links wrap (flex-wrap: wrap; no nowrap or fixed width). A stylesheet that still has the old foundation block hides them: save it again with writeStyles to refresh it',
    })
  }

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

/** A card with this many words or fewer holds a label, not a claim. */
export const THIN_CARD_WORDS = 2

export interface CopyNote {
  code: 'thin-card'
  message: string
  fix: string
}

/**
 * Advice from the suite's copy rule (the words come from the brief): cards
 * holding only a word or two are filler. Kept apart from the layout findings,
 * so it never stops checkResponsive reporting clean; it is advice, not a block.
 */
export function copyNotes(read: LayoutRead): CopyNote[] {
  const seen = new Set<string>()
  const thin = read.boxes.filter(box => {
    if (box.kind !== 'card' || box.fullBleed || box.media || box.chrome) return false
    // A pill or a tag is not a card.
    if (box.right - box.left < 120 || box.bottom - box.top < 48) return false
    const text = box.text.replace(/\s+/g, ' ').trim()
    const words = text.split(' ').filter(word => /\p{L}/u.test(word))
    // A figure ("80%", "3×", "$1.2m") makes a stat card; a bare "01" is only its number.
    const figure = text.split(' ').some(token => /\d/.test(token) && !/^\d{1,2}[.):]?$/.test(token))
    if (!words.length || words.length > THIN_CARD_WORDS || figure || seen.has(text)) return false
    seen.add(text)
    return true
  })
  if (!thin.length) return []
  const shown = thin.slice(0, 3).map(box => `"${clip(box.text, 40)}"`).join(', ') + (thin.length > 3 ? ', …' : '')
  return [
    {
      code: 'thin-card',
      message: thin.length === 1 ? `a card holds only ${shown}` : `${thin.length} cards hold only a word or two (${shown})`,
      fix: "every card carries a claim from the brief (quoted, closely restated, or cut short with the same meaning), or it is removed. Read Copy comes from the brief in the Matching a house style skill",
    },
  ]
}

/**
 * Read the rendered page's text, buttons, cards and media: what analyseLayout
 * needs. It runs in PureSite's measuring frame and, when PureSite is hidden,
 * in the shell's measuring window, so it is self-contained: everything it
 * uses is an argument, a browser global or defined inside it.
 */
export function collectLayout(doc: Document, win: Window, width: number): LayoutRead {
  /** Distinct line boxes an element's text occupies. */
  const lineCount = (element: Element): number => {
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
  const label = (element: Element): string => {
    const cls = element.getAttribute('class')?.trim().split(/\s+/)[0]
    return `${element.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`
  }
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
      lines: kind === 'card' || kind === 'media' ? 0 : lineCount(element),
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
    if ((filled || bordered) && element.textContent?.trim()) {
      add(element, 'card')
      const card = boxes[boxes.length - 1]
      if (card?.kind === 'card' && seen.has(element)) {
        if (element.querySelector('img, video, picture, svg, canvas')) card.media = true
        if (element.closest('header, nav, footer')) card.chrome = true
      }
    }
  })
  const scrollWidth = doc.documentElement.scrollWidth

  /** Can this be seen and pressed where it is, as far as layout can say? */
  const reach = (element: Element): 'ok' | 'hidden' | 'clipped' => {
    if (element.closest('[inert]')) return 'hidden'
    // A closed disclosure's contents still measure as laid out (content-visibility), so size alone would call them shown.
    const shut = element.closest('details:not([open])')
    if (shut && !shut.querySelector(':scope > summary')?.contains(element)) return 'hidden'
    if (element.checkVisibility?.() === false) return 'hidden'
    const rect = element.getBoundingClientRect()
    // A 1px box is the visually-hidden pattern, not a link anyone can press.
    if (rect.width < 2 || rect.height < 2 || rect.bottom + win.scrollY <= 0) return 'hidden'
    if (win.getComputedStyle(element).visibility !== 'visible') return 'hidden'
    let scrolls = false
    for (let node: Element | null = element; node && node !== doc.documentElement; node = node.parentElement) {
      const style = win.getComputedStyle(node)
      if (Number.parseFloat(style.opacity) < 0.01 || style.pointerEvents === 'none') return 'hidden'
      const cutsX = style.overflowX === 'hidden' || style.overflowX === 'clip'
      const cutsY = style.overflowY === 'hidden' || style.overflowY === 'clip'
      if (node === element) {
        if (cutsX && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1) return 'clipped'
        continue
      }
      // A row that scrolls by itself still gets its links on screen.
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') scrolls = true
      const box = node.getBoundingClientRect()
      if (cutsY && (rect.top >= box.bottom || rect.bottom <= box.top)) return 'hidden'
      if (cutsX && !scrolls && (rect.right > box.right + 1 || rect.left < box.left - 1)) return 'clipped'
      if (cutsY && (rect.bottom > box.bottom + 1 || rect.top < box.top - 1)) return 'clipped'
    }
    return !scrolls && (rect.right > width + 1 || rect.left < -1) ? 'clipped' : 'ok'
  }

  const readNavigation = (): NavigationRead => {
    // A frame with no layout measures everything 0x0: no answer, never "all hidden" or "fine".
    if (doc.documentElement.getBoundingClientRect().width < 1) return { status: 'incomplete', why: 'the page had no layout when it was measured' }
    const roots = Array.from(body.querySelectorAll('header, nav, .site-header, [role="banner"], [role="navigation"]')).filter(
      root => !root.parentElement?.closest('main, article, section, aside, footer'),
    )
    const keyOf = (link: HTMLAnchorElement) => (link.href || link.getAttribute('href') || '').replace(/\/index\.html(?=$|[?#])/, '/')
    const isDestination = (link: HTMLAnchorElement) => {
      const href = link.getAttribute('href') ?? ''
      if (!href || /^javascript:/i.test(href)) return false
      if (!href.startsWith('#')) return true
      // A skip link parks off screen, and a link that opens the menu is the control, not a place to go.
      if (href === '#' || /skip/i.test(`${link.textContent} ${link.className}`)) return false
      const target = doc.getElementById(href.slice(1))
      return !(target?.closest('header, nav') || target?.querySelector('nav'))
    }
    const destinations = new Map<string, HTMLAnchorElement>()
    for (const root of roots)
      for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')))
        if (isDestination(link) && !destinations.has(keyOf(link))) destinations.set(keyOf(link), link)

    const reached = new Set<string>()
    const look = () => {
      // A menu that slides open: read where it lands, not where it starts.
      for (const animation of doc.getAnimations?.() ?? []) {
        try {
          animation.finish()
        } catch {
          // An endless animation has no end to jump to.
        }
      }
      for (const link of Array.from(body.querySelectorAll<HTMLAnchorElement>('a[href]'))) if (reach(link) === 'ok') reached.add(keyOf(link))
    }
    const unreached = () => [...destinations.keys()].filter(key => !reached.has(key))
    const nameOf = (control: Element) => {
      const labelled = control.getAttribute('aria-labelledby')
      const named = control.getAttribute('aria-label') || (labelled && doc.getElementById(labelled)?.textContent) || control.textContent || control.querySelector('img[alt]')?.getAttribute('alt') || control.getAttribute('title')
      return (named ?? '').replace(/\s+/g, ' ').trim()
    }

    look()
    const menus: string[] = []
    let unnamedMenu = false
    /** Open a menu in this measuring copy, keep what it reveals if it has a name, and shut it again. */
    const attempt = (control: Element, open: () => void, close?: () => void) => {
      if (reach(control) !== 'ok') return
      const before = new Set(reached)
      open()
      look()
      if (reached.size > before.size) {
        const named = nameOf(control)
        if (named) menus.push(named)
        else {
          // No name, no replacement: put back what only it revealed.
          reached.clear()
          before.forEach(key => reached.add(key))
          unnamedMenu = true
        }
      }
      close?.()
    }

    // Native disclosures, outermost first and left open until the end, so a nested one can be reached.
    const opened: HTMLDetailsElement[] = []
    for (const details of Array.from(body.querySelectorAll<HTMLDetailsElement>('details:not([open])'))) {
      const summary = details.querySelector(':scope > summary')
      if (!summary || !unreached().length) continue
      attempt(summary, () => {
        details.open = true
        opened.push(details)
      })
      if (!nameOf(summary)) details.open = false
    }
    // The checkbox menu: a pressable label, or the box itself.
    for (const input of Array.from(body.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]'))) {
      if (!unreached().length) break
      if (input.closest('form')) continue
      const control = Array.from(input.labels ?? []).find(label => reach(label) === 'ok') ?? input
      const was = input.checked
      attempt(control, () => { input.checked = !was }, () => { input.checked = was })
    }
    // The native popover.
    for (const control of Array.from(body.querySelectorAll('[popovertarget]'))) {
      const target = doc.getElementById(control.getAttribute('popovertarget') ?? '')
      if (!target || !unreached().length) continue
      attempt(control, () => target.showPopover(), () => target.hidePopover())
    }
    // The :target panel: a link to an element that holds the links.
    for (const control of Array.from(body.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))) {
      const id = control.getAttribute('href')!.slice(1)
      const target = id ? doc.getElementById(id) : null
      if (!target || !unreached().some(key => target.contains(destinations.get(key)!))) continue
      attempt(control, () => { win.location.hash = id }, () => { win.location.hash = '' })
    }
    // A scripted button: press it, and press it again to put it back.
    const scripted = Array.from(new Set([...roots.flatMap(root => Array.from(root.querySelectorAll('button, [role="button"]'))), ...Array.from(body.querySelectorAll('[aria-controls], [aria-expanded]'))])).filter(
      control => reach(control) === 'ok' && !control.closest('form'),
    ) as HTMLElement[]
    for (const control of scripted) {
      if (!unreached().length) break
      attempt(control, () => control.click(), () => control.click())
    }
    opened.reverse().forEach(details => { details.open = false })

    const left = unreached()
    // A script may be the menu, and may not have run here: that is no answer either way.
    if (left.length && scripted.length && (doc.scripts.length > 0 || body.querySelector('[onclick]')))
      return { status: 'incomplete', why: `its menu ("${nameOf(scripted[0]).slice(0, 30)}") relies on a script that did not reveal the links here, and ${left.length} header link${left.length === 1 ? ' is' : 's are'} otherwise out of reach` }
    return {
      status: 'checked',
      links: destinations.size,
      missing: left.map(key => {
        const link = destinations.get(key)!
        return { label: (link.textContent ?? '').replace(/\s+/g, ' ').trim() || link.getAttribute('aria-label') || '', href: link.getAttribute('href') ?? '', why: reach(link) === 'clipped' ? 'clipped' : 'hidden' }
      }),
      menus,
      ...(left.length && unnamedMenu ? { unnamedMenu } : {}),
    }
  }

  let navigation: NavigationRead
  try {
    navigation = readNavigation()
  } catch (error) {
    navigation = { status: 'incomplete', why: `reading the header failed (${error instanceof Error ? error.message : String(error)})` }
  }
  return { width, scrollWidth, boxes, navigation }
}
