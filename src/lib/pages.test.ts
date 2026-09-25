import { describe, expect, it } from 'vitest'
import {
  addPage,
  deletePage,
  insertElement,
  movePage,
  normalizePagePath,
  readElement,
  setElementSrc,
  setElementText,
  linkElement,
} from './pages'
import {
  createDefaultSiteDocument,
  isUntouchedStarter,
  orderedPages,
  relativePrefix,
  titleFromPage,
  urlPathFor,
} from './siteDocument'

describe('page paths', () => {
  it('turns a name into a folder with an index', () => {
    expect(normalizePagePath('About Us')).toBe('about-us/index.html')
  })

  it('keeps an explicit html file as itself', () => {
    expect(normalizePagePath('/pricing.html')).toBe('pricing.html')
  })

  it('refuses to climb out of the package', () => {
    expect(normalizePagePath('../../etc/passwd')).toBe('etc/passwd/index.html')
  })

  it('maps pages to the URLs a host will serve', () => {
    expect(urlPathFor('index.html')).toBe('/')
    expect(urlPathFor('work/index.html')).toBe('/work/')
    expect(urlPathFor('pricing.html')).toBe('/pricing.html')
  })

  it('knows how far a page sits from the root', () => {
    expect(relativePrefix('index.html')).toBe('')
    expect(relativePrefix('work/index.html')).toBe('../')
    expect(relativePrefix('a/b/index.html')).toBe('../../')
  })
})

describe('the page set', () => {
  it('adds a page and puts it last in the nav', () => {
    const next = addPage(createDefaultSiteDocument(), { path: 'about' })
    expect(next.manifest.pages).toEqual(['index.html', 'about/index.html'])
    expect(titleFromPage(next.pages['about/index.html'])).toBe('about/index.html')
  })

  it('links a nested page to the stylesheet one level up', () => {
    const next = addPage(createDefaultSiteDocument(), { path: 'work' })
    expect(next.pages['work/index.html']).toContain('href="../styles/site.css"')
  })

  it('refuses to delete the last page', () => {
    const document = createDefaultSiteDocument()
    expect(deletePage(document, 'index.html')).toBe(document)
  })

  it('reorders the nav without touching the page', () => {
    const document = addPage(createDefaultSiteDocument(), { path: 'about' })
    const moved = movePage(document, 1, 0)
    expect(moved.manifest.pages).toEqual(['about/index.html', 'index.html'])
    expect(moved.pages).toEqual(document.pages)
  })

  it('lists a page added by hand rather than losing it', () => {
    const document = createDefaultSiteDocument()
    document.pages['stray.html'] = '<html><head><title>Stray</title></head></html>'
    expect(orderedPages(document).map(page => page.path)).toEqual([
      'index.html',
      'stray.html',
    ])
  })

  it('knows the starter is still the starter', () => {
    expect(isUntouchedStarter(createDefaultSiteDocument())).toBe(true)
    const touched = addPage(createDefaultSiteDocument(), { path: 'about' })
    expect(isUntouchedStarter(touched)).toBe(false)
  })
})

describe('editing an element', () => {
  const page = `<!DOCTYPE html><html><head><title>T</title></head><body><main><h1>Hello</h1><div class="box"></div><img src="assets/a.png"></main></body></html>`

  it('reads a leaf as editable text', () => {
    const picked = readElement(page, '0/0')
    expect(picked?.editableText).toBe(true)
    expect(picked?.text).toBe('Hello')
  })

  it('will not offer to retype a container', () => {
    expect(readElement(page, '0')?.editableText).toBe(false)
  })

  it('refuses to overwrite a container, which would delete its children', () => {
    expect(setElementText(page, '0', 'gone')).toBe(page)
  })

  it('sets text on a leaf', () => {
    expect(setElementText(page, '0/0', 'Changed')).toContain('<h1>Changed</h1>')
  })

  it('repoints an image', () => {
    expect(setElementSrc(page, '0/2', 'assets/b.png')).toContain('src="assets/b.png"')
  })

  it('reaches up out of a nested page for its assets', () => {
    const out = setElementSrc(page, '0/2', 'assets/b.png', 'work/index.html')
    expect(out).toContain('src="../assets/b.png"')
  })

  it('fills an empty box with an image rather than replacing the box', () => {
    const out = setElementSrc(page, '0/1', 'assets/b.png')
    expect(out).toContain('class="box"')
    expect(out).toContain('object-fit: cover')
  })

  it('inserts in flow, before a sibling', () => {
    const out = insertElement(page, {
      markup: '<p>New</p>',
      beforePath: '0/0',
    })
    expect(out.indexOf('<p>New</p>')).toBeLessThan(out.indexOf('<h1>Hello</h1>'))
  })
})

describe('linkElement', () => {
  const page = '<!doctype html><html><body><main><p>Read the rules here.</p><h2>Judges</h2></main></body></html>'

  it('puts the link inside the element, so the element stays what it was', () => {
    const next = linkElement(page, '0/0', '/rules/')
    expect(next).toContain('<p><a href="/rules/">Read the rules here.</a></p>')
  })

  it('repoints an element that is already a link rather than nesting one', () => {
    const linked = linkElement(page, '0/0', '/rules/')
    const again = linkElement(linked, '0/0', '/eligibility/')
    expect(again).toContain('href="/eligibility/"')
    expect(again).not.toContain('/rules/')
    expect(again.match(/<a /g)).toHaveLength(1)
  })

  it('leaves a page alone when the path names nothing', () => {
    expect(linkElement(page, '9/9', '/rules/')).toBe(page)
  })
})
