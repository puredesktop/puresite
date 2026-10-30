import { describe, expect, it } from 'vitest'
import { analyseLayout, type TextBox } from './responsiveCheck'

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
