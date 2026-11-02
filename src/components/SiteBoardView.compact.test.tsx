import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDefaultSiteDocument, orderedPages, type SiteDocument } from '../lib/siteDocument'
import { SiteBoardView } from './SiteBoardView'

const frames = vi.hoisted(() => ({ last: null as null | Record<string, unknown>, mounts: 0 }))
vi.mock('./PageFrame', async () => {
  const { useEffect } = await import('react')
  return { PageFrame: (props: Record<string, unknown>) => {
    frames.last = props
    useEffect(() => { frames.mounts += 1 }, [])
    return <div data-testid="frame" />
  } }
})
vi.mock('../bridge/platformBridge', () => ({ fetchLivePage: vi.fn(async () => null) }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root, host: HTMLDivElement
const twoPages = (): SiteDocument => {
  const document = createDefaultSiteDocument()
  document.pages['about.html'] = '<title>About</title><p>About us</p>'
  document.manifest.pages.push('about.html')
  return document
}
async function render(compact: boolean, extra: Record<string, unknown> = {}, site = twoPages()) {
  const props: Record<string, unknown> = {
    document: site, pages: orderedPages(site), material: [], previews: {}, collections: [], dataProvider: undefined,
    selectedPage: 'index.html', pageSelection: [], selection: null, findings: [],
    verification: { state: 'verified', reasons: [], pages: {} }, revisions: [], statusAction: null,
    status: '', asking: false, viewport: 'phone', describing: false, exporting: false, brandChip: null,
    onPreviewViewport: () => {}, ...extra,
  }
  const fullProps = Object.fromEntries(BOARD_PROPS.map(key => [key, key in props ? props[key] : key.startsWith('on') ? () => {} : undefined]))
  await act(async () => root.render(<SiteBoardView {...(fullProps as React.ComponentProps<typeof SiteBoardView>)} compact={compact} />))
}
const BOARD_PROPS = ['document', 'pages', 'material', 'previews', 'collections', 'dataProvider', 'onAddFormForCollection', 'onDeleteCollection', 'selectedPage', 'pageSelection', 'onPageSelection', 'selection', 'findings', 'verification', 'onRecheck', 'revisions', 'onRestoreRevision', 'statusAction', 'status', 'asking', 'viewport', 'onViewport', 'onPreviewViewport', 'onSelectPage', 'onSelectElement', 'onEditElement', 'onAddPage', 'onBuildPromise', 'onRepointPromise', 'onUnlinkPromise', 'onBuildAllPromises', 'onLinkSelection', 'onSetGoal', 'onDeletePage', 'onMovePage', 'onSetPageTitle', 'onSetElementText', 'onSetElementSrc', 'onAddFiles', 'onSetRole', 'onDescribe', 'onRenameFile', 'onUseFileInstead', 'onDescribeAll', 'describing', 'onAsk', 'onOpenHtml', 'onOpenInBrowser', 'onPublish', 'onExport', 'exporting', 'brandChip', 'onOpenBrand']
const button = (text: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === text)

beforeEach(() => {
  frames.last = null
  frames.mounts = 0
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

it('with compact off, adds nothing to the board', async () => {
  await render(false)
  expect(host.querySelector('[data-compact-hide], [data-compact-part]')).toBeNull()
  expect(host.querySelector('nav[aria-label="Pages"]')).toBeNull()
  expect(frames.last).toMatchObject({ editInPlace: false, width: 390 })
})

it('in compact, hides the chrome but keeps it mounted, with the page in place', async () => {
  await render(true)
  const hidden = host.querySelectorAll('[data-compact-hide]')
  expect(hidden.length).toBe(4)
  for (const name of ['Publish…', 'Map', 'Files', 'Pick elements'])
    expect(button(name)?.closest('[data-compact-hide]'), name).not.toBeNull()
  expect(host.querySelector('#page-title')?.closest('[data-compact-hide]')).not.toBeNull()
  expect(frames.last).toMatchObject({ editInPlace: true, picking: false })
  expect(host.querySelector('[data-testid="frame"]')?.closest('[data-compact-hide]')).toBeNull()
})

it('in compact, moves between pages by name and says where it is', async () => {
  const onSelectPage = vi.fn()
  await render(true, { onSelectPage })
  const names = host.querySelector('nav[aria-label="Pages"]')!
  expect(names.querySelector('[aria-current="page"]')).not.toBeNull()
  const commit = (frames.last?.commitRef as { current: unknown })
  commit.current = (then: () => void) => then()
  await act(async () => Array.from(names.querySelectorAll('button')).find(item => item.textContent === 'About')!.click())
  expect(onSelectPage).toHaveBeenCalledWith('about.html')
})

it('in compact, shows the page at the box width whatever preview size was chosen, and gives that back', async () => {
  const onViewport = vi.fn()
  await render(true, { onViewport })
  expect(frames.last?.width).not.toBe(390)
  await render(false, { onViewport })
  expect(frames.last?.width).toBe(390)
  expect(onViewport).not.toHaveBeenCalled()
})

it('entering and leaving compact keeps the same frame mounted', async () => {
  await render(false)
  await render(true)
  await render(false)
  expect(frames.mounts).toBe(1)
})

it('the keys for the map and the finder open nothing in compact', async () => {
  await render(true)
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', metaKey: true }))
  })
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(host.querySelectorAll('input, textarea').length).toBe(2)
})

it('an edit goes to the page the frame held in compact, and to the page on screen with compact off', async () => {
  const onEditElement = vi.fn()
  const typed = () => (frames.last?.onEdit as (path: string, html: string, from: string) => void)('0', '<p>x</p>', 'about.html')
  await render(true, { onEditElement })
  typed()
  expect(onEditElement).toHaveBeenLastCalledWith('about.html', '0', '<p>x</p>')
  await render(false, { onEditElement })
  typed()
  expect(onEditElement).toHaveBeenLastCalledWith('index.html', '0', '<p>x</p>')
})

it('following a promised link in compact opens no sheet', async () => {
  await render(true, { selectedPage: 'index.html' })
  const before = host.innerHTML
  await act(async () => (frames.last?.onNavigate as (to: string, state: string) => void)('missing.html', 'promised'))
  expect(host.innerHTML).toBe(before)
})

it('a page with nothing on it says so in compact only', async () => {
  const site = createDefaultSiteDocument()
  site.pages['index.html'] = '<!doctype html><html><head><title>Blank</title></head><body></body></html>'
  await render(true, {}, site)
  expect(host.textContent).toContain('Nothing on this page yet.')
  await render(false, {}, site)
  expect(host.textContent).not.toContain('Nothing on this page yet.')
})
