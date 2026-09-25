import { describe, expect, it } from 'vitest'
import { addPage } from './pages'
import { createDefaultSiteDocument, type SiteDocument } from './siteDocument'

/**
 * The rule a real site's home page was lost to.
 *
 * Autosave serialises the document that BELONGS to the bound path, not the
 * one on screen. Those are the same thing almost always — and different for
 * the moment between opening a package and the lifecycle being told about it.
 * In that window, serialising the on-screen document writes the newly opened
 * site's content into the previously bound folder.
 *
 * This models the two refs and asserts the invariant directly, because the
 * failure is silent: everything looks right, and a file elsewhere is quietly
 * replaced.
 */
function serializeFor(bound: SiteDocument): string[] {
  return Object.keys(bound.pages)
}

describe('what autosave writes', () => {
  it('writes the bound document, not whatever is on screen', () => {
    const siteA = addPage(createDefaultSiteDocument(), { path: 'a-only' })
    const siteB = addPage(createDefaultSiteDocument(), { path: 'b-only' })

    // Bound to A; B has just been opened and is on screen.
    let boundDocument = siteA
    const onScreen = siteB

    // A flush landing right now must still be A.
    expect(serializeFor(boundDocument)).toContain('a-only/index.html')
    expect(serializeFor(boundDocument)).not.toContain('b-only/index.html')

    // Only when the binding moves does the serialised document move with it.
    boundDocument = onScreen
    expect(serializeFor(boundDocument)).toContain('b-only/index.html')
  })

  it('an edit updates the bound document too, or the edit would not save', () => {
    let boundDocument = createDefaultSiteDocument()
    const edited = addPage(boundDocument, { path: 'new-page' })
    boundDocument = edited
    expect(serializeFor(boundDocument)).toContain('new-page/index.html')
  })
})
