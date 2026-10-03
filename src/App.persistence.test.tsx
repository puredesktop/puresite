import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  path: null as string | null,
  serialize: null as null | (() => { name: string; content: string }[]),
  board: null as any, switcher: null as any, header: null as any,
  writes: [] as { path: string; files: { name: string; content: string }[] }[],
  read: vi.fn(), list: vi.fn(), binary: vi.fn(), flush: vi.fn(), adopt: vi.fn(),
  chooseFolder: vi.fn(), registerFolder: vi.fn(),
}))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformBridge', () => ({ usePlatformBridge: () => ({ ready: true, meta: {}, error: null }) }))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformViewportResource', () => ({ usePlatformViewportResource: () => ({ resource: null, clearResource: () => {} }) }))
vi.mock('@purescience/platform-ui/bridge/react/useDocumentLifecycle', () => ({ useDocumentLifecycle: (options: any) => {
  mocks.serialize = options.serialize
  return { doc: { path: null }, flush: mocks.flush, adopt: mocks.adopt,
    markDirty: () => {}, reset: () => { mocks.path = null }, ensureDraft: async () => null }
} }))
vi.mock('@purescience/platform-bridge/components/AppFrame', () => ({ AppFrame: ({ children, headerActions }: any) => <>{headerActions}{children}</> }))
vi.mock('@purescience/platform-ui/components/common/documents', () => ({
  DocumentHeaderActions: (props: any) => { mocks.header = props; return null },
  DocumentSwitcher: (props: any) => { mocks.switcher = props; return null },
}))
vi.mock('./components/SiteBoardView', () => ({ SiteBoardView: (props: any) => { mocks.board = props; return <div>{props.document.title}</div> } }))
vi.mock('./components/NewSiteWizard', () => ({ NewSiteWizard: () => null }))
vi.mock('./components/PublishDialog', () => ({ PublishDialog: () => null }))
vi.mock('./hooks/usePureSiteAgentTools', () => ({ usePureSiteAgentTools: () => {} }))
vi.mock('@purescience/platform-ui/bridge/react/useVideoDrop', () => ({ useVideoDrop: () => {}, useImageDrop: () => {} }))
vi.mock('./bridge/platformBridge', () => ({
  bridge: { call: vi.fn(async () => null) }, readTextFile: mocks.read, listFiles: mocks.list,
  chooseSiteFolder: mocks.chooseFolder, registerSiteFolder: mocks.registerFolder,
  readBinaryDataUrl: mocks.binary, writeTextFile: vi.fn(async () => {}), deleteFileQuietly: vi.fn(async () => {}),
  createFolder: vi.fn(async () => {}), listMyTools: vi.fn(async () => []),
}))
vi.mock('@purescience/platform-ui/editing', async importOriginal => ({ ...await importOriginal<any>(), mountMeasuringFrame: vi.fn(async () => ({ ok: false })) }))
import { App } from './App'
let root: Root, host: HTMLDivElement
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks(); mocks.path = null; mocks.writes = []; mocks.board = null
  mocks.chooseFolder.mockResolvedValue(null); mocks.registerFolder.mockResolvedValue(undefined)
  mocks.adopt.mockImplementation((path: string) => { mocks.path = path })
  mocks.flush.mockImplementation(async () => {
    if (mocks.path) mocks.writes.push({ path: mocks.path, files: mocks.serialize!() })
  })
  mocks.read.mockImplementation(async (path: string) => {
    if (path.endsWith('/site.json')) return JSON.stringify({ title: path.split('/')[1], pages: ['index.html'], assets: [] })
    if (path.endsWith('/pages/index.html')) return `<title>${path.split('/')[1]}</title><p>Original words</p>`
    if (path.endsWith('/styles/site.css')) return 'body { color: navy }'
    if (path.endsWith('/collections.json')) return '[]'
    throw Error(`ENOENT: ${path}`)
  })
  mocks.list.mockImplementation(async (path: string) => ({ entries: path.endsWith('/pages') ? [{ name: 'index.html' }] : [] }))
  mocks.binary.mockResolvedValue('data:image/png;base64,AA==')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<App />))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
async function open(path: string) { await act(async () => mocks.switcher.onOpenDocument(path)) }
async function switcher() { await act(async () => mocks.header.onOpenSwitcher()) }
async function settle() { await act(async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }) }

it('opens and registers a site folder from the system chooser', async () => {
  mocks.chooseFolder.mockResolvedValue('/Picked.site/')
  await act(async () => mocks.switcher.onChooseFromSystem()); await settle()
  expect(mocks.registerFolder).toHaveBeenCalledWith('/Picked.site')
  expect(mocks.path).toBe('/Picked.site')
  expect(mocks.board.document.title).toBe('Picked.site')
})

it('keeps the current site when the folder chooser is cancelled', async () => {
  await open('/Alpha.site'); await settle(); await switcher()
  await act(async () => mocks.switcher.onChooseFromSystem())
  expect(mocks.registerFolder).not.toHaveBeenCalled()
  expect(mocks.path).toBe('/Alpha.site')
})

it('reports an invalid folder without opening or registering it', async () => {
  mocks.chooseFolder.mockResolvedValue('/Documents')
  await act(async () => mocks.switcher.onChooseFromSystem())
  expect(mocks.registerFolder).not.toHaveBeenCalled()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Choose a .site folder')
})

it('reports a folder chooser failure and keeps the current document', async () => {
  await open('/Alpha.site'); await settle(); await switcher()
  mocks.chooseFolder.mockRejectedValueOnce(Error('Dialog unavailable'))
  await act(async () => mocks.switcher.onChooseFromSystem())
  expect(mocks.path).toBe('/Alpha.site')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Dialog unavailable')
})

it('flushes the departing site before binding another package', async () => {
  await open('/Alpha.site'); await settle()
  await act(async () => mocks.board.onSetPageTitle('index.html', 'Unsaved Alpha'))
  await switcher(); await open('/Beta.site'); await settle()
  expect(mocks.board.document.title).toBe('Beta.site')
  const saved = mocks.writes.find(w => w.path === '/Alpha.site')!
  expect(saved.files.find(f => f.name === 'pages/index.html')!.content).toContain('Unsaved Alpha')
  expect(saved.files.find(f => f.name === 'pages/index.html')!.content).not.toContain('Beta.site')
})

it('keeps the current site and edits when the departing save fails', async () => {
  await open('/Alpha.site'); await settle(); await switcher()
  mocks.flush.mockRejectedValueOnce(Error('Disk full'))
  await open('/Beta.site'); await settle()
  expect(mocks.board.document.title).toBe('Alpha.site')
  expect(mocks.adopt).not.toHaveBeenCalledWith('/Beta.site', expect.anything())
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Disk full')
})

it('ignores an older open that finishes after a newer selection', async () => {
  await open('/Alpha.site'); await settle(); await switcher()
  const gate = deferred<string>(), read = mocks.read.getMockImplementation()!
  mocks.read.mockImplementation((path: string) => path === '/Slow.site/pages/index.html' ? gate.promise : read(path))
  await open('/Slow.site'); await open('/Latest.site'); await settle()
  gate.resolve('<title>Slow</title>'); await settle()
  expect(mocks.board.document.title).toBe('Latest.site')
  expect(mocks.path).toBe('/Latest.site')
})

it('does not let a previous package image replace the current package preview', async () => {
  const gate = deferred<string>()
  mocks.list.mockImplementation(async (path: string) => ({ entries: path.endsWith('/pages') ? [{ name: 'index.html' }] : [{ name: 'hero.png' }] }))
  mocks.binary.mockImplementation((path: string) => path.startsWith('/Alpha.site/') ? gate.promise : Promise.resolve('data:image/png;base64,Qg=='))
  await open('/Alpha.site'); await settle(); await switcher(); await open('/Beta.site'); await settle()
  gate.resolve('data:image/png;base64,QQ=='); await settle()
  expect(mocks.board.previews).toEqual({ 'hero.png': 'data:image/png;base64,Qg==' })
})

it('saves edits before creating a new site', async () => {
  await open('/Alpha.site'); await settle()
  await act(async () => mocks.board.onSetPageTitle('index.html', 'Keep this'))
  await switcher(); await act(async () => mocks.switcher.onCreateNew()); await settle()
  expect(mocks.writes.find(w => w.path === '/Alpha.site')!.files.find(f => f.name === 'pages/index.html')!.content).toContain('Keep this')
  expect(mocks.board.document.title).toBe('Untitled site')
})

it('keeps saved asset notes while their directory listing is still loading', async () => {
  const gate = deferred<unknown>(), read = mocks.read.getMockImplementation()!
  mocks.read.mockImplementation((path: string) => path === '/Alpha.site/site.json'
    ? Promise.resolve(JSON.stringify({ title: 'Alpha', pages: ['index.html'], assets: [{ name: 'hero.png', alias: 'cover', description: '' }] })) : read(path))
  const list = mocks.list.getMockImplementation()!
  mocks.list.mockImplementation((path: string) => path === '/Alpha.site/assets' ? gate.promise : list(path))
  await open('/Alpha.site'); await settle(); await switcher(); await open('/Beta.site'); await settle()
  const manifest = mocks.writes.find(w => w.path === '/Alpha.site')!.files.find(f => f.name === 'site.json')!
  expect(JSON.parse(manifest.content).assets[0].alias).toBe('cover')
  gate.resolve({ entries: [] }); await settle()
})

it('loads image and font previews with at most four concurrent binary reads', async () => {
  const names = ['face.woff2', ...Array.from({ length: 11 }, (_, i) => `photo-${i}.png`)]
  mocks.list.mockImplementation(async (path: string) => ({ entries: path.endsWith('/pages') ? [{ name: 'index.html' }] : names.map(name => ({ name })) }))
  let active = 0, peak = 0
  mocks.binary.mockImplementation(async () => {
    active++; peak = Math.max(peak, active); await Promise.resolve(); active--
    return 'data:application/octet-stream;base64,AA=='
  })
  await open('/Alpha.site'); await settle()
  expect(peak).toBe(4)
  expect(Object.keys(mocks.board.previews)).toHaveLength(12)
  expect(mocks.board.previews['face.woff2']).toBeTruthy()
})
