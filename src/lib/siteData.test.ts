import { describe, expect, it } from 'vitest'
import {
  checkCollections,
  defaultAccess,
  formSnippetFor,
  HERENOW_DATA,
  parseCollections,
  siteNeedsData,
  type Collection,
} from './siteData'

const enquiries: Collection = {
  name: 'enquiries',
  fields: [
    { name: 'name', type: 'string', required: true, maxLength: 80, trim: true },
    { name: 'email', type: 'email', required: true },
    { name: 'message', type: 'string', maxLength: 2000 },
  ],
  access: defaultAccess(),
}

describe('the safe default', () => {
  it('lets anyone submit and only the owner read', () => {
    // A feedback box whose contents are a public URL away is a data leak,
    // so widening this has to be a decision rather than an omission.
    expect(defaultAccess()).toEqual({
      read: 'owner',
      insert: 'public',
      update: 'owner',
      delete: 'owner',
    })
  })
})

describe('what the host will refuse', () => {
  it('accepts a well-formed collection', () => {
    expect(checkCollections([enquiries]).filter(f => f.severity === 'error')).toEqual([])
  })

  it('rejects a name that is not an identifier', () => {
    const bad = { ...enquiries, name: 'My Enquiries' }
    expect(checkCollections([bad]).map(f => f.code)).toContain('bad-collection-name')
  })

  it('rejects a field the host uses for its own bookkeeping', () => {
    const bad: Collection = {
      ...enquiries,
      fields: [{ name: 'created_at', type: 'datetime' }],
    }
    expect(checkCollections([bad]).map(f => f.code)).toContain('reserved-field')
  })

  it('rejects a rate limit in a shape the host does not parse', () => {
    const bad = { ...enquiries, rateLimit: '10 per hour' }
    expect(checkCollections([bad]).map(f => f.code)).toContain('bad-rate-limit')
  })

  it('warns when anything submitted is also readable by anyone', () => {
    const open: Collection = {
      ...enquiries,
      access: { ...defaultAccess(), read: 'public' },
    }
    expect(checkCollections([open]).map(f => f.code)).toContain('public-read-and-write')
  })

  it('warns when anyone can edit or remove records', () => {
    const open: Collection = {
      ...enquiries,
      access: { ...defaultAccess(), update: 'public' },
    }
    expect(checkCollections([open]).map(f => f.code)).toContain('public-mutation')
  })
})

describe('the manifest a host reads', () => {
  it('renders the documented shape', () => {
    const manifest = JSON.parse(HERENOW_DATA.render([enquiries]))
    expect(manifest).toEqual({
      collections: {
        enquiries: {
          fields: {
            name: { type: 'string', required: true, maxLength: 80, trim: true },
            email: { type: 'email', required: true },
            message: { type: 'string', maxLength: 2000 },
          },
          access: { read: 'owner', insert: 'public', update: 'owner', delete: 'owner' },
        },
      },
    })
  })

  it('adds the double opt-in only when public writes are asked for', () => {
    const plain = JSON.parse(HERENOW_DATA.render([enquiries]))
    expect(plain.collections.enquiries.publicMutation).toBeUndefined()

    const open = JSON.parse(
      HERENOW_DATA.render([
        { ...enquiries, access: { ...defaultAccess(), update: 'public' } },
      ]),
    )
    expect(open.collections.enquiries.publicMutation).toBe('open')
  })

  it('turns storage off explicitly rather than by omission', () => {
    // An omitted manifest preserves whatever the host already has, so an
    // empty one is the only way to actually stop storing records.
    expect(JSON.parse(HERENOW_DATA.render([]))).toEqual({ collections: {} })
  })

  it('round-trips through a manifest a package already carries', () => {
    const parsed = parseCollections(HERENOW_DATA.render([enquiries]))
    expect(parsed).toEqual([enquiries])
  })
})

describe('the form that submits to it', () => {
  const snippet = formSnippetFor(enquiries, HERENOW_DATA)

  it('posts to the collection with no key in the page', () => {
    expect(snippet).toContain("fetch('/api/data/enquiries'")
    expect(snippet).not.toMatch(/Authorization|api[_-]?key/i)
  })

  it('carries an input per field, typed as the field is', () => {
    expect(snippet).toContain('name="name"')
    expect(snippet).toContain('type="email"')
    expect(snippet).toContain('maxlength="80"')
  })

  it('gives a long string room to be written in', () => {
    expect(snippet).toContain('<textarea name="message"')
  })
})

describe('when the Data tab earns its place', () => {
  const page = (body: string): Record<string, string> => ({
    'index.html': `<html><body>${body}</body></html>`,
  })

  it('stays hidden for a site that is only pages', () => {
    // The common case, and the reason this is not a capability check: every
    // here.now site *could* store records, so that test would show the tab
    // on everything.
    expect(siteNeedsData({ pages: page('<h1>Hello</h1>'), collections: [] })).toBe(false)
  })

  it('appears once a page has a form', () => {
    expect(siteNeedsData({ pages: page('<form><input name="a"></form>'), collections: [] })).toBe(
      true,
    )
  })

  it('appears when the site already stores something, form or not', () => {
    expect(siteNeedsData({ pages: page('<h1>Hello</h1>'), collections: [enquiries] })).toBe(true)
  })

  it('is not fooled by the word form in prose', () => {
    expect(
      siteNeedsData({ pages: page('<p>Fill in the form below.</p>'), collections: [] }),
    ).toBe(false)
  })
})
