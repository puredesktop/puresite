import { describe, expect, it } from 'vitest'
import { analyseLayout, collectLayout, copyNotes, type TextBox } from './responsiveCheck'

const box = (over: Partial<TextBox>): TextBox => ({
  label: 'p', text: 'Words', left: 24, right: 366, top: 0, bottom: 20, fontSize: 16, lines: 1, align: 'left', letterSpacingEm: 0, kind: 'text', ...over,
})

describe('the mobile check', () => {
  it('finds a phone page out of scale the way the first pure.science page was', () => {
    const findings = analyseLayout({
      width: 390,
      scrollWidth: 390,
      boxes: [
        box({ kind: 'button', text: 'Book a demo', left: 250, right: 372, lines: 2, top: 10, bottom: 70 }),
        box({ kind: 'h1', text: 'Move from workshop to rollout with a focused pilot.', fontSize: 58, lines: 4, top: 200, bottom: 440, align: 'center', letterSpacingEm: -0.06 }),
        box({ kind: 'heading', text: 'Real work. Shown first.', top: 700, bottom: 780, left: 10, right: 380, section: 1 }),
        box({ kind: 'heading', text: 'Begin with a workshop.', top: 1500, bottom: 1560, align: 'center', section: 4 }),
        box({ kind: 'card', text: 'PureDesktop', left: 8, right: 382, top: 820, bottom: 960 }),
        box({ text: 'A caption', fontSize: 11, top: 980, bottom: 995 }),
      ],
    })
    expect([...new Set(findings.map(f => f.code))].sort()).toEqual(
      ['button-wraps', 'empty-band', 'headline-lines', 'mixed-alignment', 'narrow-gutter', 'small-text', 'tight-tracking'].sort(),
    )
    expect(findings.find(f => f.code === 'headline-lines')!.message).toMatch(/4 lines at 58px/)
    expect(findings.find(f => f.code === 'narrow-gutter')!.fix).toMatch(/var\(--gutter\)/)
  })

  it('passes a page in scale, and does not count a full-bleed band as a gutter', () => {
    expect(
      analyseLayout({
        width: 390,
        scrollWidth: 390,
        boxes: [
          box({ kind: 'button', text: 'Book a demo', lines: 1, left: 260, right: 366 }),
          box({ kind: 'h1', text: 'Workshops, then a pilot, then rollout.', fontSize: 36, lines: 3, top: 80, bottom: 200 }),
          box({ kind: 'card', text: 'band', left: 0, right: 390, fullBleed: true, top: 210, bottom: 400 }),
          box({ kind: 'heading', text: 'One', top: 260, bottom: 300, section: 1 }),
          box({ kind: 'heading', text: 'Two', top: 380, bottom: 420, section: 2 }),
        ],
      }),
    ).toEqual([])
  })

  it('reports sideways scrolling', () => {
    expect(analyseLayout({ width: 390, scrollWidth: 520, boxes: [] })[0].code).toBe('sideways-scroll')
  })
})

describe('the copy notes', () => {
  const read = (boxes: TextBox[]) => ({ width: 390, scrollWidth: 390, boxes })
  const card = (text: string, over: Partial<TextBox> = {}) => box({ kind: 'card', text, top: 400, bottom: 520, ...over })

  it('names cards that hold only a word or two, apart from the layout findings', () => {
    const page = read([card('01 Shape'), card('Learn'), card('Roll out'), card('Review Editors check every change before it ships.')])
    expect(copyNotes(page)).toEqual([
      {
        code: 'thin-card',
        message: '3 cards hold only a word or two ("01 Shape", "Learn", "Roll out")',
        fix: expect.stringMatching(/claim from the brief/),
      },
    ])
    // Advice only: the page is still clean for the mobile check.
    expect(analyseLayout(page)).toEqual([])
  })

  it('leaves stat cards, picture cards, pills, bands and the header alone', () => {
    expect(
      copyNotes(
        read([
          card('80% faster'),
          card('Acme', { media: true }),
          card('New', { right: 90, bottom: 430 }),
          card('Welcome', { left: 0, right: 390, fullBleed: true }),
          card('Menu', { chrome: true }),
          card(''),
        ]),
      ),
    ).toEqual([])
  })

  it('reads a picture and the chrome from the page', () => {
    const doc = new DOMParser().parseFromString(
      '<header><div style="background: #eee"><a href="/">Menu</a></div></header><main><div class="card" style="background: #eee"><img src="a.png"><p>Acme</p></div><div class="card" style="background: #eee"><h3>Shape</h3></div></main>',
      'text/html',
    )
    const win = { getComputedStyle: (element: Element) => ({ visibility: 'visible', display: 'block', fontSize: '16px', letterSpacing: 'normal', textAlign: 'left', backgroundColor: (element as HTMLElement).style?.background ? 'rgb(238, 238, 238)' : 'rgba(0, 0, 0, 0)', borderLeftWidth: '0px', borderTopWidth: '0px' }), scrollY: 0 } as unknown as Window
    for (const element of doc.querySelectorAll('*')) (element as HTMLElement).getBoundingClientRect = () => ({ left: 24, right: 366, top: 0, bottom: 120, width: 342, height: 120 }) as DOMRect
    const cards = collectLayout(doc, win, 390).boxes.filter(b => b.kind === 'card')
    expect(cards.map(c => [c.text, !!c.media, !!c.chrome])).toEqual([
      ['Menu', false, true],
      ['Acme', true, false],
      ['Shape', false, false],
    ])
  })
})
