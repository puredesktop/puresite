import { describe, expect, it } from 'vitest'
import { createDefaultSiteDocument, type SiteDocument } from './siteDocument'
import { addPage, writePage } from './pages'
import { pageHash, siteHash } from './siteHash'
import {
  admitSiteEdit,
  documentFromSnapshot,
  parseSiteSnapshot,
  serializeSiteSnapshot,
  siteTextChars,
  snapshotTextChars,
} from './siteDoor'

function site(): { content: SiteDocument; hash: string } {
  const content = addPage(createDefaultSiteDocument(), { path: 'about' })
  return { content, hash: siteHash(content) }
}

describe('the door', () => {
  it('lands an edit with the current hash and reports the new one', () => {
    const current = site()
    const out = admitSiteEdit(
      {
        next: doc => writePage(doc, 'index.html', '<p>hi</p>'),
        origin: 'agent',
        baseHash: current.hash,
      },
      current,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changed).toBe(true)
    expect(out.hash).not.toBe(current.hash)
    expect(out.hash).toBe(siteHash(out.content))
    expect(out.pageHashes['index.html']).toBe(pageHash('<p>hi</p>'))
  })

  it('refuses an agent edit computed against a stale site hash, naming the re-read', () => {
    const current = site()
    const out = admitSiteEdit(
      { next: doc => writePage(doc, 'index.html', '<p>hi</p>'), origin: 'agent', baseHash: 'stale' },
      current,
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('stale')
    expect(out.currentHash).toBe(current.hash)
    expect(out.message).toContain('getSiteContext')
  })

  it('accepts a page-scoped base hash and checks it against that page only', () => {
    const current = site()
    const aboutHash = pageHash(current.content.pages['about/index.html'])
    // The home page changed underneath — the about edit is still fresh.
    const moved = {
      content: writePage(current.content, 'index.html', '<p>moved on</p>'),
      hash: '',
    }
    moved.hash = siteHash(moved.content)
    const out = admitSiteEdit(
      {
        next: doc => writePage(doc, 'about/index.html', '<p>about, revised</p>'),
        origin: 'agent',
        baseHash: aboutHash,
        page: 'about/index.html',
      },
      moved,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.content.pages['index.html']).toBe('<p>moved on</p>')
    expect(out.content.pages['about/index.html']).toBe('<p>about, revised</p>')
  })

  it('refuses a page-scoped base hash when THAT page changed', () => {
    const current = site()
    const out = admitSiteEdit(
      {
        next: doc => writePage(doc, 'about/index.html', '<p>x</p>'),
        origin: 'ask',
        baseHash: 'old-about',
        page: 'about/index.html',
      },
      current,
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('stale')
    expect(out.currentHash).toBe(pageHash(current.content.pages['about/index.html']))
    expect(out.message).toContain('about/index.html changed while the assistant')
  })

  it('rebases a hand edit by re-running its transform on the latest document', () => {
    const current = site()
    const out = admitSiteEdit(
      {
        next: doc => addPage(doc, { path: 'contact' }),
        origin: 'manual',
        baseHash: 'from-an-old-render',
      },
      current,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.rebased).toBe(true)
    expect(Object.keys(out.content.pages)).toContain('contact/index.html')
    expect(Object.keys(out.content.pages)).toContain('about/index.html')
  })

  it('refuses a hand edit that is a whole document from a stale base', () => {
    const current = site()
    const out = admitSiteEdit(
      { next: createDefaultSiteDocument(), origin: 'manual', baseHash: 'stale' },
      current,
    )
    expect(out.ok).toBe(false)
  })

  it('refuses a site with no pages', () => {
    const current = site()
    const out = admitSiteEdit(
      { next: { ...current.content, pages: {} }, origin: 'import' },
      current,
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('invalid')
  })

  it('reports an unchanged edit as landed but not changed', () => {
    const current = site()
    const out = admitSiteEdit({ next: doc => doc, origin: 'manual' }, current)
    expect(out.ok && !out.changed).toBe(true)
  })
})

describe('snapshots', () => {
  it('round-trip the whole site without where it went', () => {
    const doc = addPage(createDefaultSiteDocument(), { path: 'about' })
    doc.manifest.published = { service: 'herenow', slug: 'abc', claimToken: 'once' }
    const parsed = parseSiteSnapshot(serializeSiteSnapshot(doc))
    expect(parsed.pages).toEqual(doc.pages)
    expect(parsed.styles).toBe(doc.styles)
    expect(parsed.manifest.pages).toEqual(doc.manifest.pages)
    expect('published' in parsed.manifest).toBe(false)
  })

  it('restore keeps the CURRENT published record, never the snapshot\'s', () => {
    const old = createDefaultSiteDocument()
    old.manifest.published = { service: 'herenow', slug: 'old-slug', claimToken: 'old-token' }
    const snapshot = parseSiteSnapshot(serializeSiteSnapshot(old))
    const current = addPage(createDefaultSiteDocument(), { path: 'about' })
    current.manifest.published = {
      service: 'herenow',
      slug: 'live-slug',
      claimToken: 'the-only-token',
      url: 'https://live.example',
    }
    const restored = documentFromSnapshot(snapshot, current)
    expect(Object.keys(restored.pages)).toEqual(['index.html'])
    expect(restored.manifest.published).toEqual(current.manifest.published)
  })

  it('restore into a never-published site carries no published record', () => {
    const snapshot = parseSiteSnapshot(serializeSiteSnapshot(createDefaultSiteDocument()))
    const restored = documentFromSnapshot(snapshot, createDefaultSiteDocument())
    expect(restored.manifest.published).toBeUndefined()
  })

  it('refuses a snapshot from another schema or with no pages', () => {
    expect(() => parseSiteSnapshot('{"schemaVersion":9}')).toThrow()
    expect(() => parseSiteSnapshot('{"schemaVersion":1,"pages":{}}')).toThrow()
  })

  it('measures visible text across every page', () => {
    const doc = addPage(createDefaultSiteDocument(), { path: 'about' })
    const chars = siteTextChars(doc)
    expect(chars).toBeGreaterThan(0)
    expect(snapshotTextChars(serializeSiteSnapshot(doc))).toBe(chars)
    expect(snapshotTextChars('junk')).toBe(0)
  })
})
