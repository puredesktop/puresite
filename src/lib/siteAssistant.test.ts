import { describe, expect, it } from 'vitest'
import { extractElement, extractPage } from './siteAssistant'

describe('getting one element out of the answer', () => {
  it('takes a bare element as it is', () => {
    expect(extractElement('<h1 style="color: #1f6feb">Hello</h1>')).toBe(
      '<h1 style="color: #1f6feb">Hello</h1>',
    )
  })

  it('drops prose and fences around it', () => {
    expect(
      extractElement('Sure —\n```html\n<p class="lead">Blue now.</p>\n```\nDone.'),
    ).toBe('<p class="lead">Blue now.</p>')
  })

  it('returns nothing when there is no element', () => {
    expect(extractElement('Which element do you mean?')).toBeNull()
  })
})

describe('getting the page out of the answer', () => {
  const PAGE = '<!doctype html><html><head><title>x</title></head><body><p>a</p></body></html>'

  it('takes the page whole, prose stripped', () => {
    expect(extractPage(`Here it is:\n${PAGE}\nAnything else?`)).toBe(PAGE)
  })

  it('returns nothing for a cut-off page', () => {
    expect(extractPage('<!doctype html><html><body><p>a')).toBeNull()
  })
})
