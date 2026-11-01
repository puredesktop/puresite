import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readBinaryBase64 } from '../bridge/platformBridge'
import { createDefaultSiteDocument, type SiteDocument } from '../lib/siteDocument'
import { draftState, type DraftState } from '../lib/draftState'
import { publicationComparison } from '../lib/publicationSnapshot'
import { usePublicationAssets } from './usePublicationAssets'
import type { MaterialItem } from '../lib/material'

vi.mock('../bridge/platformBridge', () => ({ readBinaryBase64: vi.fn() }))
let root: Root
let container: HTMLDivElement
let state: DraftState
let document: SiteDocument
let material: MaterialItem[]
let revision: number
let path: string
function Probe() {
  const fingerprints = usePublicationAssets(document, path, material, revision)
  state = draftState(document, document.manifest.published, fingerprints)
  return <span>{state.incomplete ? 'Comparison incomplete' : state.matchesLive ? 'Matches what is published' : 'Unpublished changes'}</span>
}
async function render() { await act(async () => { root.render(<Probe />) }) }
beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = window.document.createElement('div'); window.document.body.append(container)
  root = createRoot(container)
  document = createDefaultSiteDocument()
  document.pages = { 'index.html': '<img src="assets/hero.png">' }; document.styles = ''; document.manifest.assets = []
  document.manifest.published = { service: 'fake', slug: 'fixture', ...publicationComparison(document, [
    { path: 'assets/hero.png', content: btoa('AAAA'), encoding: 'base64', contentType: 'image/png' },
  ]) }
  material = []; path = '/fixture'; revision = 0
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

it('refreshes real bytes after a same-path, same-size replacement and clears when restored', async () => {
  vi.mocked(readBinaryBase64).mockResolvedValue({ base64: btoa('AAAA'), mimeType: 'image/png' })
  await render()
  expect(state.matchesLive).toBe(true)
  expect(readBinaryBase64).toHaveBeenCalledWith('/fixture/assets/hero.png')
  vi.mocked(readBinaryBase64).mockResolvedValue({ base64: btoa('BBBB'), mimeType: 'image/png' })
  revision++; await render()
  expect(state.assetsChanged).toEqual(['assets/hero.png'])
  expect(container.textContent).toBe('Unpublished changes')
  vi.mocked(readBinaryBase64).mockResolvedValue({ base64: btoa('AAAA'), mimeType: 'image/png' })
  material = [...material]; await render()
  expect(state.matchesLive).toBe(true)
  document = { ...document, styles: 'body { color: blue }' }; await render()
  expect(state.stylingChanged).toBe(true)
  expect(readBinaryBase64).toHaveBeenCalledTimes(3)
})
it('keeps reads incomplete while pending or unreadable and discards an old package response', async () => {
  let release!: (value: { base64: string; mimeType: string }) => void
  vi.mocked(readBinaryBase64).mockReturnValue(new Promise(resolve => { release = resolve }))
  await render()
  expect(state.incomplete).toBe(true)
  expect(state.matchesLive).toBe(false)
  path = '/another'; material = []
  vi.mocked(readBinaryBase64).mockRejectedValue(new Error('Unreadable required file'))
  await render()
  await act(async () => release({ base64: btoa('AAAA'), mimeType: 'image/png' }))
  expect(state.incomplete).toBe(true)
  expect(container.textContent).toBe('Comparison incomplete')
})
