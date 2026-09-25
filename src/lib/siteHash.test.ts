import { describe, expect, it } from 'vitest'
import { createDefaultSiteDocument } from './siteDocument'
import { pageHash, pageHashes, siteHash, stableStringify } from './siteHash'
import { addPage, writePage } from './pages'

describe('the composite site hash', () => {
  it('is stable across page insertion order', () => {
    const a = createDefaultSiteDocument()
    a.pages = { 'index.html': '<p>home</p>', 'about/index.html': '<p>about</p>' }
    const b = createDefaultSiteDocument()
    b.pages = { 'about/index.html': '<p>about</p>', 'index.html': '<p>home</p>' }
    expect(siteHash(a)).toBe(siteHash(b))
  })

  it('is stable across manifest key order', () => {
    const a = createDefaultSiteDocument()
    const b = createDefaultSiteDocument()
    b.manifest = { brief: '', assets: [], target: 'static-host', pages: ['index.html'], title: b.manifest.title }
    expect(siteHash(a)).toBe(siteHash(b))
    expect(stableStringify({ z: 1, a: [{ y: 2, x: 1 }] })).toBe('{"a":[{"x":1,"y":2}],"z":1}')
  })

  it('changes when a page, the stylesheet, the nav order or a collection changes', () => {
    const base = createDefaultSiteDocument()
    const hash = siteHash(base)
    expect(siteHash(writePage(base, 'index.html', '<p>x</p>'))).not.toBe(hash)
    expect(siteHash({ ...base, styles: 'body{}' })).not.toBe(hash)
    const two = addPage(base, { path: 'about' })
    const reordered = {
      ...two,
      manifest: { ...two.manifest, pages: [...two.manifest.pages].reverse() },
    }
    expect(siteHash(reordered)).not.toBe(siteHash(two))
    expect(
      siteHash({
        ...base,
        collections: [
          {
            name: 'notes',
            fields: [{ name: 'text', type: 'string' }],
            access: { read: 'owner', insert: 'public', update: 'none', delete: 'none' },
          },
        ],
      }),
    ).not.toBe(hash)
  })

  it('ignores where the site was published', () => {
    const base = createDefaultSiteDocument()
    const published = {
      ...base,
      manifest: {
        ...base.manifest,
        published: { service: 'herenow', slug: 'abc', claimToken: 'once' },
      },
    }
    expect(siteHash(published)).toBe(siteHash(base))
  })

  it('exposes a hash per page that only that page moves', () => {
    const base = addPage(createDefaultSiteDocument(), { path: 'about' })
    const before = pageHashes(base)
    const next = pageHashes(writePage(base, 'about/index.html', '<p>new</p>'))
    expect(next['index.html']).toBe(before['index.html'])
    expect(next['about/index.html']).not.toBe(before['about/index.html'])
    expect(next['about/index.html']).toBe(pageHash('<p>new</p>'))
  })
})
