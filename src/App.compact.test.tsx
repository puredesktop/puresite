import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { useCompactInRoom } from './hooks/useCompactInRoom'

const mocks = vi.hoisted(() => ({
  board: null as any, landing: null as any, modal: null as any, wizard: null as any, publish: null as any,
  boardMounts: 0, agentTools: 0, bridgeReady: true,
  list: vi.fn(), read: vi.fn(),
}))
vi.mock('./hooks/useCompactInRoom', () => ({ useCompactInRoom: vi.fn() }))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformBridge', () => ({ usePlatformBridge: () => ({ ready: mocks.bridgeReady, meta: {}, error: null }) }))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformViewportResource', () => ({ usePlatformViewportResource: () => ({ resource: null, clearResource: () => {} }) }))
vi.mock('@purescience/platform-ui/bridge/react/useDocumentLifecycle', () => ({ useDocumentLifecycle: () => ({
  doc: { path: null }, flush: vi.fn(async () => {}), adopt: vi.fn(), markDirty: () => {}, reset: () => {}, ensureDraft: async () => null,
}) }))
vi.mock('@purescience/platform-bridge/components/AppFrame', () => ({ AppFrame: ({ children, headerActions, headerDocumentName: _n, identityAppSlug: _i, ...rest }: any) => <div data-testid="frame" {...rest}>{headerActions}{children}</div> }))
vi.mock('@purescience/platform-ui/components/common/documents', () => ({
  DocumentHeaderActions: () => null,
  DocumentSwitcher: (props: any) => { if (props.variant === 'landing') mocks.landing = props; else mocks.modal = props; return null },
}))
vi.mock('./components/SiteBoardView', async () => {
  const { useEffect } = await import('react')
  return { SiteBoardView: (props: any) => {
    mocks.board = props
    useEffect(() => { mocks.boardMounts += 1 }, [])
    return <div data-testid="board" />
  } }
})
vi.mock('./components/NewSiteWizard', () => ({ NewSiteWizard: (props: any) => { mocks.wizard = props; return null } }))
vi.mock('./components/PublishDialog', () => ({ PublishDialog: (props: any) => { mocks.publish = props; return null } }))
vi.mock('./hooks/usePureSiteAgentTools', () => ({ usePureSiteAgentTools: () => { mocks.agentTools += 1 } }))
vi.mock('@purescience/platform-ui/bridge/react/useVideoDrop', () => ({ useVideoDrop: () => {}, useImageDrop: () => {} }))
vi.mock('./bridge/platformBridge', () => ({
  bridge: { call: vi.fn(async () => null) }, readTextFile: mocks.read, listFiles: mocks.list,
  chooseSiteFolder: vi.fn(), registerSiteFolder: vi.fn(), readBinaryDataUrl: vi.fn(), writeTextFile: vi.fn(async () => {}),
  deleteFileQuietly: vi.fn(async () => {}), createFolder: vi.fn(async () => {}), listMyTools: vi.fn(async () => []),
  brandsOffered: () => false, defaultBrand: vi.fn(async () => null), onBrandsChanged: () => () => {},
  readBinaryBase64: vi.fn(), writeBinaryFile: vi.fn(async () => {}), listBrands: vi.fn(async () => []), getBrand: vi.fn(), proposeBrand: vi.fn(), proposeBrandSamples: vi.fn(),
}))
vi.mock('@purescience/platform-ui/editing', async importOriginal => ({ ...await importOriginal<any>(), mountMeasuringFrame: vi.fn(async () => ({ ok: false })) }))

let root: Root, host: HTMLDivElement
const frame = () => host.querySelector('[data-testid="frame"]')!
const button = (text: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent === text)
async function render(compact: boolean) {
  vi.mocked(useCompactInRoom).mockReturnValue(compact)
  await act(async () => { root.render(<App />) })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.board = null; mocks.landing = null; mocks.modal = null
  mocks.boardMounts = 0; mocks.agentTools = 0; mocks.bridgeReady = true
  mocks.read.mockImplementation(async (path: string) => {
    if (path.endsWith('/site.json')) return JSON.stringify({ title: 'Acme', pages: ['index.html'], assets: [] })
    if (path.endsWith('/pages/index.html')) return '<!doctype html><html><head><title>Acme</title></head><body><p>Words</p></body></html>'
    if (path.endsWith('/styles/site.css')) return 'body { color: navy }'
    if (path.endsWith('/collections.json')) return '[]'
    throw Error(`ENOENT: ${path}`)
  })
  mocks.list.mockImplementation(async (path: string) => ({ entries: path.endsWith('/pages') ? [{ name: 'index.html' }] : [] }))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

async function openSite(compact: boolean) {
  await render(compact)
  await act(async () => mocks.landing.onOpenDocument('/sites/Acme.site'))
  await act(async () => { for (let i = 0; i < 40; i++) await Promise.resolve() })
  expect(mocks.board).not.toBeNull()
}

it('with compact off and nothing open, shows the landing as before', async () => {
  await render(false)
  expect(frame().hasAttribute('data-compact-room')).toBe(false)
  expect(mocks.landing.open).toBe(true)
  expect(host.querySelector('.site-compact-empty')).toBeNull()
})

it('in compact with nothing open, closes the list and offers one quiet line and one way forward', async () => {
  await render(true)
  expect(frame().hasAttribute('data-compact-room')).toBe(true)
  expect(mocks.landing.open).toBe(false)
  expect(host.querySelector('.site-compact-empty p')?.textContent).toBe('No site is open here.')
  expect(host.querySelectorAll('.site-compact-empty button').length).toBe(1)
  expect(button('New site')).toBeDefined()
})

it('the frame is compact while the bridge is still waking, so no other screen shows first', async () => {
  mocks.bridgeReady = false
  await render(true)
  expect(frame().hasAttribute('data-compact-room')).toBe(true)
})

it('with compact off and a site open, the board gets nothing new to do', async () => {
  await openSite(false)
  expect(mocks.board.compact).toBe(false)
  expect(frame().hasAttribute('data-compact-room')).toBe(false)
})

it('entering and leaving compact keeps the board mounted and the agent tools registered', async () => {
  await openSite(false)
  const before = mocks.agentTools
  await render(true)
  expect(mocks.board.compact).toBe(true)
  expect(frame().hasAttribute('data-compact-room')).toBe(true)
  await render(false)
  expect(mocks.boardMounts).toBe(1)
  expect(mocks.agentTools).toBeGreaterThan(before)
})

it('in compact, no publish dialog, wizard or switcher shows, and each comes back when it ends', async () => {
  await openSite(false)
  await act(async () => mocks.board.onPublish())
  expect(mocks.publish.open).toBe(true)
  await render(true)
  expect(mocks.publish.open).toBe(false)
  expect(mocks.wizard.open).toBe(false)
  expect(mocks.modal.open).toBe(false)
  await render(false)
  expect(mocks.publish.open).toBe(true)
})

it('an edit answers whether the frame already shows it, and goes through the same door either way', async () => {
  await openSite(true)
  let answer: unknown
  await act(async () => { answer = mocks.board.onEditElement('index.html', '0', '<p>New words</p>') })
  expect(answer).toBe(true)
  expect(mocks.board.document.pages['index.html']).toContain('New words')
  await act(async () => { answer = mocks.board.onEditElement('index.html', '0', '<p></p>') })
  expect(answer).toBe(false)
  expect(mocks.board.document.pages['index.html']).not.toContain('<p>')
})

it('every compact style starts from an attribute only compact or a held frame carries', () => {
  const selectors = readFileSync('src/compact-in-room.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) ?? []
  expect(selectors.length).toBeGreaterThan(5)
  for (const group of selectors)
    for (const part of group.split(',')) {
      const selector = part.trim()
      expect(selector.startsWith('[data-compact-room]') || selector.startsWith('html[data-held-in-room]'), selector).toBe(true)
    }
})
