import { describe, expect, it } from 'vitest'
import {
  draftState,
  draftSummary,
  fingerprintPages,
  liveUrlFor,
  pageFingerprint,
  stateOf,
} from './draftState'
import type { PublishedRecord, SiteDocument } from './siteDocument'

function site(pages: Record<string, string>, published?: PublishedRecord): SiteDocument {
  return {
    pages,
    styles: '',
    manifest: {
      version: 1,
      title: 'Awards',
      pages: Object.keys(pages),
      target: { profile: 'static-host' },
      ...(published ? { published } : {}),
    },
  } as unknown as SiteDocument
}

const livePages = fingerprintPages({
  'index.html': '<h1>Home</h1>',
  'about/index.html': '<h1>About</h1>',
  'old/index.html': '<h1>Old</h1>',
})
const published: PublishedRecord = {
  service: 'herenow',
  slug: 'awards',
  url: 'https://awards.example/',
  pages: livePages,
}

describe('pageFingerprint', () => {
  it('changes when the page does, and not otherwise', () => {
    expect(pageFingerprint('<h1>Home</h1>')).toBe(pageFingerprint('<h1>Home</h1>'))
    expect(pageFingerprint('<h1>Home</h1>')).not.toBe(pageFingerprint('<h1>Home!</h1>'))
  })
})

describe('draftState', () => {
  const state = draftState(
    site(
      {
        'index.html': '<h1>Home</h1>',
        'about/index.html': '<h1>About the awards</h1>',
        'nominate/index.html': '<h1>Nominate</h1>',
      },
      published,
    ),
    published,
  )

  it('separates what a reader would meet, notice, or lose', () => {
    expect(state.added).toEqual(['nominate/index.html'])
    expect(state.edited).toEqual(['about/index.html'])
    expect(state.removed).toEqual(['old/index.html'])
    expect(state.matchesLive).toBe(false)
  })

  it('leaves a page that has not moved alone', () => {
    expect(stateOf(state, 'index.html')).toBe('same')
  })

  it('says it plainly', () => {
    expect(draftSummary(state)).toBe('Draft · 1 new, 1 changed, 1 gone')
  })

  it('knows when there is nothing to publish', () => {
    const same = site(
      {
        'index.html': '<h1>Home</h1>',
        'about/index.html': '<h1>About</h1>',
        'old/index.html': '<h1>Old</h1>',
      },
      published,
    )
    const unchanged = draftState(same, published)
    expect(unchanged.matchesLive).toBe(true)
    expect(draftSummary(unchanged)).toBe('Matches what is published')
  })

  it('treats a site that was never published as all new, and says so', () => {
    const fresh = draftState(site({ 'index.html': '<h1>Home</h1>' }), undefined)
    expect(fresh.neverPublished).toBe(true)
    expect(fresh.added).toEqual(['index.html'])
    expect(draftSummary(fresh)).toBe('Never published')
  })
})

describe('liveUrlFor', () => {
  it('points at the page on the published site', () => {
    expect(liveUrlFor(published, 'about/index.html')).toBe('https://awards.example/about/')
    expect(liveUrlFor(published, 'index.html')).toBe('https://awards.example/')
  })

  it('has nowhere to point before a first publish', () => {
    expect(liveUrlFor(undefined, 'index.html')).toBeNull()
  })
})
