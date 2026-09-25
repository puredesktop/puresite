// @vitest-environment happy-dom
import { it, expect } from 'vitest'
import {
  compositionFor,
  recoverableSite,
  type DrawerRequest,
} from './drawerRequest'
import type { SiteDocument } from './siteDocument'
const html =
  '<html><head><title>Home</title></head><body><h1>Title</h1><p>Keep</p></body></html>'
const doc = {
  title: 'Site',
  pages: { 'index.html': html, 'about.html': html },
  styles: 'body{color:red}',
  collections: [],
  manifest: {
    title: 'Site',
    pages: ['index.html', 'about.html'],
    target: 'static-host',
    brief: 'Site',
    assets: [],
    published: { service: 'host', slug: 'original' },
  },
} as SiteDocument
const request = {
  kind: 'edit',
  document: doc,
  pages: ['index.html'],
  elementPath: '0',
} as DrawerRequest
it('preserves outside-element content, other pages and shared styles', () => {
  const next = compositionFor(
    request,
    { pages: { 'index.html': html.replace('Title', 'Updated') } },
    doc,
  )
  expect(next.pages['about.html']).toBe(html)
  expect(next.styles).toBe(doc.styles)
  expect(() =>
    compositionFor(
      request,
      { pages: { 'index.html': html.replace('Keep', 'Lost') } },
      doc,
    ),
  ).toThrow('outside')
  expect(() =>
    compositionFor(request, { pages: { 'about.html': html } }, doc),
  ).toThrow('outside')
  expect(() =>
    compositionFor(
      request,
      { pages: { 'index.html': html }, styles: 'changed' },
      doc,
    ),
  ).toThrow('outside')
})
it('validates whole-site batches and preserves publishing and collection data', () => {
  const draft = { ...request, kind: 'draft' } as DrawerRequest
  expect(() =>
    compositionFor(draft, { pages: { '../oops.html': html }, styles: '' }, doc),
  ).toThrow()
  expect(() =>
    compositionFor(draft, { pages: { 'about.html': html }, styles: '' }, doc),
  ).toThrow('index.html')
  const next = compositionFor(
    draft,
    { pages: { 'index.html': html }, styles: 'new css', title: 'New' },
    doc,
  )
  expect(next.collections).toBe(doc.collections)
  expect(next.manifest.published).toBe(doc.manifest.published)
  expect(next.manifest.pages).toEqual(['index.html', 'about.html'])
})

it('repairs a partial saved batch only when files match old or proposed content', () => {
  const proposed = {
    ...doc,
    pages: { ...doc.pages, 'index.html': html.replace('Title', 'New') },
    styles: 'new css',
  }
  const mixed = { ...doc, pages: proposed.pages }
  expect(recoverableSite(doc, proposed, mixed)).toBe(true)
  expect(
    recoverableSite(doc, proposed, { ...mixed, styles: 'external edit' }),
  ).toBe(false)
})

import { requestSession } from './drawerRequest'
it('binds follow-ups to the saved document session, including a verified rename', () => {
  const saved = {
    path: '/old',
    sessionId: 'document-session',
    outputHash: 'saved',
  } as DrawerRequest
  expect(requestSession(saved, '/old', 'changed')).toBe('document-session')
  expect(requestSession(saved, '/renamed', 'saved')).toBe('document-session')
  expect(requestSession(saved, '/other', 'different')).toBeNull()
  expect(requestSession(null, '/old', 'saved')).toBeNull()
})

import { descriptionState, assertDescriptionScope } from './drawerRequest'
it('preserves manual descriptions and roles while allowing a retry of the same applied description', () => {
  const before = [{ name: 'image.png', description: '', role: 'content' }]
  const next = [{ ...before[0], description: 'Actual pixel description' }]
  const request = { descriptionBase: descriptionState(before) } as DrawerRequest
  expect(() => assertDescriptionScope(request, before, next)).not.toThrow()
  expect(() => assertDescriptionScope(request, next, next)).not.toThrow()
  expect(() =>
    assertDescriptionScope(
      request,
      [{ ...before[0], description: 'Manually corrected' }],
      next,
    ),
  ).toThrow('changed')
  expect(() =>
    assertDescriptionScope(
      request,
      [{ ...before[0], role: 'reference' }],
      next,
    ),
  ).toThrow('changed')
})
