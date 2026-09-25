import { describe, expect, it } from 'vitest'
import {
  createDefaultSiteDocument,
  parseSiteManifest,
  serializeSiteManifest,
} from './siteDocument'

describe('the published record in the manifest', () => {
  it('round-trips through serialize and parse', () => {
    const manifest = {
      ...createDefaultSiteDocument().manifest,
      published: {
        service: 'herenow',
        slug: 'quiet-otter-42',
        claimToken: 'tok_once_and_never_again',
        url: 'https://quiet-otter-42.here.now',
        at: '2026-09-01T10:00:00.000Z',
      },
    }
    const back = parseSiteManifest(serializeSiteManifest(manifest))
    // The claim token is returned exactly once by the host; losing it in a
    // round trip is losing the site.
    expect(back.published).toEqual(manifest.published)
  })

  it('keeps a record without the optional parts', () => {
    const manifest = {
      ...createDefaultSiteDocument().manifest,
      published: { service: 'herenow', slug: 'plain-site' },
    }
    const back = parseSiteManifest(serializeSiteManifest(manifest))
    expect(back.published).toEqual({ service: 'herenow', slug: 'plain-site' })
  })

  it('drops a partial record rather than keeping half of one', () => {
    expect(
      parseSiteManifest(JSON.stringify({ published: { slug: 'no-service' } }))
        .published,
    ).toBeUndefined()
    expect(
      parseSiteManifest(JSON.stringify({ published: { service: 'herenow' } }))
        .published,
    ).toBeUndefined()
    expect(
      parseSiteManifest(JSON.stringify({ published: 'yes' })).published,
    ).toBeUndefined()
  })
})

describe('the wizard answers in the manifest', () => {
  it('round-trips pageCount and look', () => {
    const manifest = {
      ...createDefaultSiteDocument().manifest,
      pageCount: 7,
      look: 'editorial',
    }
    const back = parseSiteManifest(serializeSiteManifest(manifest))
    expect(back.pageCount).toBe(7)
    expect(back.look).toBe('editorial')
  })

  it('drops answers that are not usable', () => {
    const back = parseSiteManifest(
      JSON.stringify({ pageCount: 'seven', look: '' }),
    )
    expect(back.pageCount).toBeUndefined()
    expect(back.look).toBeUndefined()
  })

  it('leaves both absent on an older manifest', () => {
    const back = parseSiteManifest(JSON.stringify({ title: 'Old site' }))
    expect(back.pageCount).toBeUndefined()
    expect(back.look).toBeUndefined()
    expect(back.published).toBeUndefined()
  })
})
