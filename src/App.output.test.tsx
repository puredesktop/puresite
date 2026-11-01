import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  serialize: null as null | (() => { name: string; content: string }[]),
  publish: null as any, agent: null as any, externalChange: null as any, measure: vi.fn(),
  board: null as any, switcher: null as any, header: null as any,
  read: vi.fn(), list: vi.fn(), binary: vi.fn(), flush: vi.fn(), adopt: vi.fn(),
  chooseFolder: vi.fn(), registerFolder: vi.fn(),
  draftPath: null as string | null, brandsOffered: false, defaultBrand: vi.fn(async (): Promise<any> => null),
}))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformBridge', () => ({ usePlatformBridge: () => ({ ready: true, meta: {}, error: null }) }))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformViewportResource', () => ({ usePlatformViewportResource: () => ({ resource: null, clearResource: () => {} }) }))
vi.mock('@purescience/platform-ui/bridge/react/useDocumentLifecycle', () => ({ useDocumentLifecycle: (options: any) => {
  mocks.serialize = options.serialize
  mocks.externalChange = options.onExternalChange
  return { doc: { path: null }, flush: mocks.flush, adopt: mocks.adopt,
    markDirty: () => {}, reset: () => {}, ensureDraft: async () => mocks.draftPath }
} }))
vi.mock('@purescience/platform-bridge/components/AppFrame', () => ({ AppFrame: ({ children, headerActions }: any) => <>{headerActions}{children}</> }))
vi.mock('@purescience/platform-ui/components/common/documents', () => ({
  DocumentHeaderActions: (props: any) => { mocks.header = props; return null },
  DocumentSwitcher: (props: any) => { mocks.switcher = props; return null },
}))
vi.mock('./components/SiteBoardView', () => ({ SiteBoardView: (props: any) => { mocks.board = props; return <div>{props.document.title}</div> } }))
vi.mock('./components/NewSiteWizard', () => ({ NewSiteWizard: () => null }))
vi.mock('./components/PublishDialog', () => ({ PublishDialog: (props: any) => { mocks.publish = props; return null } }))
vi.mock('./hooks/usePureSiteAgentTools', () => ({ usePureSiteAgentTools: (_ready: boolean, context: any) => { mocks.agent = context } }))
vi.mock('@purescience/platform-ui/bridge/react/useVideoDrop', () => ({ useVideoDrop: () => {}, useImageDrop: () => {} }))
vi.mock('./bridge/platformBridge', () => ({
  bridge: { call: vi.fn(async () => null) }, readTextFile: mocks.read, listFiles: mocks.list,
  chooseSiteFolder: mocks.chooseFolder, registerSiteFolder: mocks.registerFolder,
  readBinaryDataUrl: mocks.binary, writeTextFile: vi.fn(async () => {}), deleteFileQuietly: vi.fn(async () => {}),
  resetBuildFolder: vi.fn(), fetchJson: vi.fn(), fetchRaw: vi.fn(), recordOperation: vi.fn(async () => null),
  createFolder: vi.fn(async () => {}), listMyTools: vi.fn(async () => []),
  brandsOffered: () => mocks.brandsOffered, defaultBrand: mocks.defaultBrand, onBrandsChanged: () => () => {},
  readBinaryBase64: vi.fn(async () => ({ base64: 'AA==', mimeType: 'image/png' })), writeBinaryFile: vi.fn(async () => {}),
  listBrands: vi.fn(async () => []), getBrand: vi.fn(), proposeBrand: vi.fn(), proposeBrandSamples: vi.fn(),
}))
vi.mock('./lib/hiddenMeasure', async importOriginal => ({ ...await importOriginal<any>(), measurePage: mocks.measure }))
vi.mock('./lib/publishServices', async importOriginal => ({ ...await importOriginal<any>(), loadPublishServices: async () => ({ services: [fakeService], all: [fakeService] }) }))
vi.mock('@purescience/platform-ui/editing', async importOriginal => ({ ...await importOriginal<any>(), mountMeasuringFrame: vi.fn(async () => ({ ok: false })) }))
import { App } from './App'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as bridge from './bridge/platformBridge'
import { draftState, draftSummary, pageFingerprint } from './lib/draftState'
import { type PublishService } from './lib/publishServices'
import { type SiteDocument } from './lib/siteDocument'
import { shipPage } from './lib/siteLinks'

const fakeService: PublishService = {
  id: 'herenow', name: 'Fake host', description: 'Local tests', anonymous: true, builtIn: false,
  endpoints: {
    create: { method: 'POST', url: 'https://fake.invalid/create' },
    update: { method: 'PUT', url: 'https://fake.invalid/update/{slug}' },
    finalize: { method: 'POST', url: 'https://fake.invalid/finalize/{slug}' },
  },
}
let root: Root, host: HTMLDivElement, workspace: string, site: string
let uploaded: Record<string, Buffer>, finalizations: number
async function tree(path: string, prefix = ''): Promise<Record<string, Buffer>> {
  const files: Record<string, Buffer> = {}
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) Object.assign(files, await tree(join(path, entry.name), prefix + entry.name + '/'))
    else files[prefix + entry.name] = await readFile(join(path, entry.name))
  }
  return files
}
async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    if (predicate()) return
  }
  expect(predicate()).toBe(true)
}
async function openSite(known: boolean) {
  if (known) {
    const manifest = JSON.parse(await readFile(join(site, 'site.json'), 'utf8'))
    manifest.published = { service: 'herenow', slug: 'fixture', url: 'https://known.example.org', claimToken: 'fixture-token' }
    await writeFile(join(site, 'site.json'), JSON.stringify(manifest))
  }
  await act(async () => mocks.switcher.onOpenDocument(site))
  await waitFor(() => mocks.board?.document.title === 'Community research' && Object.keys(mocks.board.previews).length >= 5)
  await act(async () => mocks.board.onPublish())
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks(); mocks.board = null; mocks.publish = null
  workspace = await mkdtemp(join(tmpdir(), 'puresite-app-output-')); site = join(workspace, 'Fixture.site')
  await cp(join(process.cwd(), 'src/lib/fixtures/checked-site.site'), site, { recursive: true })
  uploaded = {}; finalizations = 0
  mocks.brandsOffered = false; mocks.draftPath = null
  mocks.flush.mockResolvedValue(undefined)
  mocks.read.mockImplementation((path: string) => readFile(path, 'utf8'))
  mocks.list.mockImplementation(async (path: string) => ({ entries: (await readdir(path, { withFileTypes: true })).map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() })) }))
  mocks.binary.mockImplementation(async (path: string) => `data:application/octet-stream;base64,${(await readFile(path)).toString('base64')}`)
  // Layout evidence is supplied by the host double; the production verification gate remains real.
  mocks.measure.mockResolvedValue({ ok: true, fontsLoaded: true, where: 'frame', value: { height: 600, overflowX: false, fontsStatus: 'loaded' } })
  vi.mocked(bridge.readBinaryBase64).mockImplementation(async path => ({ base64: (await readFile(path)).toString('base64'), mimeType: 'application/octet-stream' }))
  vi.mocked(bridge.createFolder).mockImplementation(async (parent, name) => { await mkdir(join(parent, name), { recursive: true }) })
  vi.mocked(bridge.resetBuildFolder).mockImplementation(async root => { await rm(join(root, 'build'), { recursive: true, force: true }); await mkdir(join(root, 'build')) })
  vi.mocked(bridge.writeTextFile).mockImplementation(async (path, content) => { await writeFile(path, content) })
  vi.mocked(bridge.writeBinaryFile).mockImplementation(async (path, content) => { await writeFile(path, Buffer.from(content, 'base64')) })
  vi.mocked(bridge.fetchJson).mockImplementation(async request => {
    if (request.url.includes('/finalize/')) { finalizations++; return { siteUrl: 'https://returned-by-fake.invalid' } }
    expect(request.url.startsWith('https://fake.invalid/')).toBe(true)
    const { files } = request.body as { files: { path: string }[] }
    return { slug: 'fixture', claimToken: 'fixture-once', claimUrl: 'https://fake.invalid/claim/fixture-once', upload: { versionId: 'fixture-v1', uploads: files.map(file => ({ path: file.path, url: 'https://fake.invalid/upload/' + encodeURIComponent(file.path), method: 'PUT', headers: {} })) } }
  })
  vi.mocked(bridge.fetchRaw).mockImplementation(async request => {
    uploaded[decodeURIComponent(request.url.split('/upload/')[1])] = Buffer.from(request.body, request.encoding === 'base64' ? 'base64' : 'utf8')
  })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<App />))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }) })

it.each([false, true])('App build and Publish handlers send the same fixture bytes (known address: %s)', async known => {
  await openSite(known)
  await act(async () => mocks.publish.onBuild())
  await waitFor(() => mocks.publish.state.phase !== 'building')
  expect(mocks.publish.state.phase, mocks.publish.state.message).toBe('built')
  expect(bridge.fetchJson).not.toHaveBeenCalled()
  const built = await tree(join(site, 'build'))
  expect(built['llms.txt']).toBeDefined()
  expect(Boolean(built['sitemap.xml'])).toBe(known)
  expect(Boolean(built['robots.txt'])).toBe(known)
  expect(built['assets/fonts/fixture-sans.woff2']).toEqual(await readFile(join(site, 'assets/fonts/fixture-sans.woff2')))
  expect(built['assets/reference.png']).toBeUndefined()
  expect(built['assets/unused.png']).toBeUndefined()
  expect(built['obsolete.html']).toBeUndefined()
  expect(built['index.html'].toString()).not.toContain('href="/future/"')
  // Invoke the handler delivered to the existing human-only Publish control; never click a real host.
  await act(async () => mocks.publish.onSend())
  await waitFor(() => mocks.publish.state.phase !== 'sending')
  expect(mocks.publish.state.phase, mocks.publish.state.message).toBe('live')
  expect(finalizations).toBe(1)
  expect(uploaded).toEqual(built)
})

it('App Publish handler refuses a failed check before any host call', async () => {
  await openSite(false)
  await act(async () => mocks.board.onSetPageTitle('index.html', 'Changed page'))
  mocks.measure.mockResolvedValue({ ok: true, fontsLoaded: true, where: 'frame', value: { height: 600, overflowX: true, fontsStatus: 'loaded' } })
  await act(async () => mocks.publish.onSend())
  await waitFor(() => mocks.publish.state.phase === 'error')
  expect(mocks.publish.state.message).toContain('scrolls sideways')
  expect(bridge.fetchJson).not.toHaveBeenCalled()
})

it('App refuses an editor change made during asset preparation after verification', async () => {
  await openSite(false)
  await act(async () => mocks.publish.onBuild())
  await waitFor(() => mocks.publish.state.phase === 'built')
  vi.mocked(bridge.readBinaryBase64).mockImplementationOnce(async path => {
    mocks.board.onSetPageTitle('index.html', 'Unverified changed title')
    return { base64: (await readFile(path)).toString('base64'), mimeType: 'image/png' }
  })
  await act(async () => mocks.publish.onSend())
  await waitFor(() => mocks.publish.state.phase === 'error')
  expect(mocks.publish.state.message).toContain('site changed')
  expect(bridge.fetchJson).not.toHaveBeenCalled()
})

it.each([false, true])('keeps publication attached to the sent package after navigation (record save fails: %s)', async saveFails => {
  await openSite(false)
  const other = join(workspace, 'Other.site')
  await cp(site, other, { recursive: true })
  const otherManifest = JSON.parse(await readFile(join(other, 'site.json'), 'utf8'))
  otherManifest.title = 'Other site'
  await writeFile(join(other, 'site.json'), JSON.stringify(otherManifest))
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const upload = vi.mocked(bridge.fetchRaw).getMockImplementation()!
  vi.mocked(bridge.fetchRaw).mockImplementationOnce(async request => { await gate; return upload(request) })
  await act(async () => mocks.publish.onSend())
  await waitFor(() => vi.mocked(bridge.fetchRaw).mock.calls.length > 0)
  await act(async () => mocks.switcher.onOpenDocument(other))
  await waitFor(() => mocks.board.document.title === 'Other site')
  if (saveFails) vi.mocked(bridge.writeTextFile).mockRejectedValueOnce(new Error('Disk full'))
  release()
  await waitFor(() => mocks.publish.state.phase === 'live')
  expect(mocks.board.document.manifest.published).toBeUndefined()
  expect(JSON.parse(await readFile(join(other, 'site.json'), 'utf8'))).toEqual(otherManifest)
  if (saveFails) {
    expect(mocks.publish.state.message).toContain('Disk full')
    expect(mocks.publish.state.live.claimToken).toBe('fixture-once')
    expect(mocks.publish.state.live.claimUrl).toBe('https://fake.invalid/claim/fixture-once')
  } else {
    expect(JSON.parse(await readFile(join(site, 'site.json'), 'utf8'))).toMatchObject({ published: { slug: 'fixture', url: 'https://returned-by-fake.invalid', claimToken: 'fixture-once' } })
  }
})

async function persistOpenDocument() {
  for (const file of mocks.serialize!()) {
    const output = join(site, file.name)
    await mkdir(join(output, '..'), { recursive: true })
    await writeFile(output, file.content)
  }
}
function currentDraft() {
  return draftState(mocks.board.document, mocks.board.document.manifest.published, mocks.board.publicationAssets)
}

/** Judged from what the fake host received, never from the code that recorded the baseline. */
function expectBaselineIsWhatWasDelivered(source: SiteDocument) {
  const baseline = mocks.board.document.manifest.published
  const pages = Object.keys(source.pages)
  expect(Object.keys(baseline.pages).sort()).toEqual([...pages].sort())
  for (const page of pages) {
    // A page's fingerprint is of the checked source that shipPage turned into the delivered file.
    expect(uploaded[page].toString(), page).toBe(shipPage(source.pages[page], page, pages))
    expect(baseline.pages[page], page).toBe(pageFingerprint(source.pages[page]))
  }
  expect(baseline.styles).toBe(pageFingerprint(uploaded['styles/site.css'].toString()))
  const delivered = Object.keys(uploaded).filter(path => path.startsWith('assets/')).sort()
  expect(delivered).toContain('assets/fonts/fixture-sans.woff2')
  expect(Object.keys(baseline.assets).sort()).toEqual(delivered)
  for (const path of delivered) expect(baseline.assets[path], path).toBe(pageFingerprint(uploaded[path].toString('latin1')))
  for (const excluded of ['assets/reference.png', 'assets/unused.png']) {
    expect(uploaded[excluded], excluded).toBeUndefined()
    expect(baseline.assets[excluded], excluded).toBeUndefined()
  }
}
async function publishOnce() {
  uploaded = {}
  await act(async () => mocks.publish.onSend())
  await waitFor(() => mocks.publish.state.phase === 'live' || mocks.publish.state.phase === 'error')
  expect(mocks.publish.state.phase, mocks.publish.state.message).toBe('live')
}

it('App reports the real comparison states from a baseline of the delivered bytes', async () => {
  await openSite(false)
  mocks.flush.mockImplementation(persistOpenDocument)
  await waitFor(() => currentDraft().neverPublished && !currentDraft().incomplete)
  expect(draftSummary(currentDraft())).toBe('Never published')
  // The door adds the foundation block once, so restoring below means restoring these exact bytes.
  await act(async () => mocks.agent.writeStyles(mocks.board.document.styles, {}))
  const source = structuredClone(mocks.board.document)
  await publishOnce()
  expectBaselineIsWhatWasDelivered(source)
  await waitFor(() => currentDraft().matchesLive)
  // CSS alone, then restored to exactly what was published.
  await act(async () => mocks.agent.writeStyles(source.styles + '\nmain { color: #583553; }', {}))
  expect(currentDraft()).toMatchObject({ stylingChanged: true, edited: [], matchesLive: false })
  await act(async () => mocks.agent.writeStyles(source.styles, {}))
  expect(currentDraft().matchesLive).toBe(true)
  // Content, then restored.
  await act(async () => mocks.agent.writePage('index.html', source.pages['index.html'].replace('Community research</h1>', 'Changed</h1>'), {}))
  expect(currentDraft()).toMatchObject({ edited: ['index.html'], stylingChanged: false, matchesLive: false })
  await act(async () => mocks.agent.writePage('index.html', source.pages['index.html'], {}))
  expect(currentDraft().matchesLive).toBe(true)
  // Additions and removals against the same saved baseline.
  const { 'about/team/index.html': team, ...kept } = mocks.board.document.pages
  expect(team).toBeDefined()
  const reshaped = draftState({ ...mocks.board.document, pages: { ...kept, 'news/index.html': '<h1>News</h1>' } }, mocks.board.document.manifest.published, mocks.board.publicationAssets)
  expect(reshaped).toMatchObject({ added: ['news/index.html'], removed: ['about/team/index.html'], matchesLive: false, incomplete: false })
  // A required file that can no longer be read is unknown, never "matches".
  await rm(join(site, 'assets/mark.svg'))
  await act(async () => mocks.externalChange({ path: site, dirty: true }))
  await waitFor(() => currentDraft().incomplete)
  expect(currentDraft().matchesLive).toBe(false)
  expect(draftSummary(currentDraft())).toContain('comparison incomplete')
})

it('App keeps a legacy record incomplete until a later publication completes it', async () => {
  const manifest = JSON.parse(await readFile(join(site, 'site.json'), 'utf8'))
  manifest.published = { service: 'herenow', slug: 'fixture', claimToken: 'fixture-token' }
  await writeFile(join(site, 'site.json'), JSON.stringify(manifest))
  await openSite(false)
  mocks.flush.mockImplementation(persistOpenDocument)
  await waitFor(() => currentDraft().comparisonNotes.length === 3)
  expect(currentDraft()).toMatchObject({ neverPublished: false, incomplete: true, matchesLive: false })
  const source = structuredClone(mocks.board.document)
  await publishOnce()
  expectBaselineIsWhatWasDelivered(source)
  await waitFor(() => currentDraft().matchesLive)
})

it('App notices a same-size picture replaced while a build is writing', async () => {
  await openSite(false)
  mocks.flush.mockImplementation(persistOpenDocument)
  await publishOnce()
  await waitFor(() => currentDraft().matchesLive)
  const imagePath = join(site, 'assets/mark.svg')
  const reset = vi.mocked(bridge.resetBuildFolder).getMockImplementation()!
  vi.mocked(bridge.resetBuildFolder).mockImplementationOnce(async path => {
    await writeFile(imagePath, (await readFile(imagePath, 'utf8')).replace('#583553', '#c4afcb'))
    await mocks.externalChange({ path: site, dirty: false })
    return reset(path)
  })
  await act(async () => mocks.publish.onBuild())
  await waitFor(() => mocks.publish.state.phase === 'built')
  await waitFor(() => currentDraft().assetsChanged.includes('assets/mark.svg'))
  expect(currentDraft().matchesLive).toBe(false)
})

it('App will not send a picture replaced while a build was writing under the check made before it', async () => {
  await openSite(false)
  mocks.flush.mockImplementation(persistOpenDocument)
  await publishOnce()
  await waitFor(() => currentDraft().matchesLive)
  const requests = vi.mocked(bridge.fetchJson).mock.calls.length
  const imagePath = join(site, 'assets/mark.svg')
  const reset = vi.mocked(bridge.resetBuildFolder).getMockImplementation()!
  vi.mocked(bridge.resetBuildFolder).mockImplementationOnce(async path => {
    await writeFile(imagePath, (await readFile(imagePath, 'utf8')).replace('#583553', '#c4afcb'))
    mocks.measure.mockResolvedValue({ ok: true, fontsLoaded: true, where: 'frame', value: { height: 600, overflowX: true, fontsStatus: 'loaded' } })
    await mocks.externalChange({ path: site, dirty: false })
    return reset(path)
  })
  await act(async () => mocks.publish.onBuild())
  await waitFor(() => mocks.publish.state.phase === 'built')
  await act(async () => mocks.publish.onSend())
  await waitFor(() => mocks.publish.state.phase === 'error' || vi.mocked(bridge.fetchJson).mock.calls.length > requests)
  expect(mocks.publish.state.message).toContain('scrolls sideways')
  expect(vi.mocked(bridge.fetchJson).mock.calls.length).toBe(requests)
})

it.each(['another site', 'the same site'])('App keeps the publication record when an upload finishes while %s is opening', async opening => {
  await openSite(false)
  mocks.flush.mockImplementation(persistOpenDocument)
  const other = join(workspace, 'Other.site')
  await cp(site, other, { recursive: true })
  const otherManifest = JSON.parse(await readFile(join(other, 'site.json'), 'utf8'))
  otherManifest.title = 'Other site'
  await writeFile(join(other, 'site.json'), JSON.stringify(otherManifest))
  const target = opening === 'another site' ? other : site
  let releaseUpload!: () => void, releaseOpen!: () => void
  const uploadGate = new Promise<void>(resolve => { releaseUpload = resolve })
  const openGate = new Promise<void>(resolve => { releaseOpen = resolve })
  const upload = vi.mocked(bridge.fetchRaw).getMockImplementation()!
  vi.mocked(bridge.fetchRaw).mockImplementationOnce(async request => { await uploadGate; return upload(request) })
  const read = mocks.read.getMockImplementation()!
  let opened = false
  mocks.read.mockImplementation(async (path: string) => {
    if (path === join(target, 'site.json')) { opened = true; await openGate }
    return read(path)
  })
  await act(async () => mocks.publish.onSend())
  await waitFor(() => vi.mocked(bridge.fetchRaw).mock.calls.length > 0)
  // Not awaited: the opening stays paused until the upload has finished.
  await act(async () => {
    if (target === other) void mocks.switcher.onOpenDocument(other)
    else void mocks.externalChange({ path: site, dirty: false })
  })
  await waitFor(() => opened)
  releaseUpload()
  await waitFor(() => finalizations === 1)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  releaseOpen()
  // The one-time claim link is there once the dialog is back.
  await waitFor(() => mocks.publish?.state.phase === 'live')
  expect(mocks.publish.state.live.claimToken).toBe('fixture-once')
  const record ={ slug: 'fixture', claimToken: 'fixture-once', styles: expect.any(String), assets: expect.any(Object), pages: expect.any(Object) }
  if (target === other) {
    await waitFor(() => mocks.board.document.title === 'Other site')
    await waitFor(() => mocks.publish.state.message.startsWith('Live at'))
    for (let attempt = 0; attempt < 100 && !JSON.parse(await read(join(site, 'site.json'))).published; attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(JSON.parse(await read(join(site, 'site.json')))).toMatchObject({ published: record })
    expect(mocks.board.document.manifest.published).toBeUndefined()
    expect(JSON.parse(await read(join(other, 'site.json')))).toEqual(otherManifest)
  } else {
    await waitFor(() => mocks.board.document.manifest.published !== undefined)
    expect(mocks.board.document.manifest.published).toMatchObject(record)
    await persistOpenDocument()
    expect(JSON.parse(await read(join(site, 'site.json')))).toMatchObject({ published: record })
  }
})

it('App will not send a same-size picture replaced after the check under that stale check', async () => {
  await openSite(false)
  mocks.flush.mockImplementation(persistOpenDocument)
  await publishOnce()
  await waitFor(() => currentDraft().matchesLive)
  const before = structuredClone(mocks.board.document.manifest.published)
  const requests = vi.mocked(bridge.fetchJson).mock.calls.length
  const imagePath = join(site, 'assets/mark.svg')
  const newImage = (await readFile(imagePath, 'utf8')).replace('#583553', '#c4afcb')
  // The replacement arrives while text edits are unsaved, so the site is not reopened.
  await writeFile(imagePath, newImage)
  mocks.measure.mockResolvedValue({ ok: true, fontsLoaded: true, where: 'frame', value: { height: 600, overflowX: true, fontsStatus: 'loaded' } })
  await act(async () => mocks.externalChange({ path: site, dirty: true }))
  await act(async () => mocks.publish.onSend())
  await waitFor(() => mocks.publish.state.phase === 'error' || vi.mocked(bridge.fetchJson).mock.calls.length > requests)
  expect(mocks.publish.state.message).toContain('scrolls sideways')
  expect(vi.mocked(bridge.fetchJson).mock.calls.length).toBe(requests)
  expect(mocks.board.document.manifest.published).toEqual(before)
  await waitFor(() => currentDraft().assetsChanged.includes('assets/mark.svg'))
})

it('App saves the sent baseline while content, styling and equal-length picture edits made during upload survive reload', async () => {
  await openSite(false)
  mocks.flush.mockImplementation(persistOpenDocument)
  const source = structuredClone(mocks.board.document)
  const imagePath = join(site, 'assets/mark.svg')
  const originalImage = await readFile(imagePath, 'utf8')
  const newImage = originalImage.replace('#583553', '#c4afcb')
  expect(newImage).not.toBe(originalImage)
  expect(Buffer.byteLength(newImage)).toBe(Buffer.byteLength(originalImage))
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const upload = vi.mocked(bridge.fetchRaw).getMockImplementation()!
  vi.mocked(bridge.fetchRaw).mockImplementationOnce(async request => { await gate; return upload(request) })
  await act(async () => mocks.publish.onSend())
  expect(mocks.publish.state.phase, mocks.publish.state.message).not.toBe('error')
  await waitFor(() => vi.mocked(bridge.fetchRaw).mock.calls.length > 0)
  await act(async () => {
    mocks.agent.writePage('index.html', source.pages['index.html'].replace('Community research</h1>', 'Research edited during upload</h1>'), {})
  })
  await act(async () => mocks.agent.writeStyles(source.styles + '\nmain { color: #583553; }', {}))
  await writeFile(imagePath, newImage)
  await act(async () => mocks.externalChange({ path: site, dirty: true }))
  await act(async () => { release() })
  await waitFor(() => mocks.publish.state.phase === 'live' && !currentDraft().incomplete)
  expect(uploaded['assets/mark.svg'].toString()).toBe(originalImage)
  expect(uploaded['index.html'].toString()).not.toContain('Research edited during upload')
  expect(uploaded['styles/site.css'].toString()).not.toContain('main { color: #583553; }')
  expectBaselineIsWhatWasDelivered(source)
  expect(currentDraft()).toMatchObject({ edited: ['index.html'], stylingChanged: true, assetsChanged: ['assets/mark.svg'], matchesLive: false, incomplete: false })
  await persistOpenDocument()
  await act(async () => mocks.switcher.onOpenDocument(site))
  await waitFor(() => !currentDraft().incomplete)
  expect(mocks.board.document.pages['index.html']).toContain('Research edited during upload')
  expect(mocks.board.document.styles).toContain('main { color: #583553; }')
  expect(await readFile(imagePath, 'utf8')).toBe(newImage)
  expect(currentDraft()).toMatchObject({ stylingChanged: true, assetsChanged: ['assets/mark.svg'], matchesLive: false })
  const later = structuredClone(mocks.board.document)
  await publishOnce()
  expect(uploaded['assets/mark.svg'].toString()).toBe(newImage)
  expectBaselineIsWhatWasDelivered(later)
  await waitFor(() => currentDraft().matchesLive)
  await persistOpenDocument()
  await act(async () => mocks.switcher.onOpenDocument(site))
  await waitFor(() => currentDraft().matchesLive)
})

it.each(['upload', 'finalize'])('App retains its preceding successful baseline and draft when the host fails during %s', async stage => {
  await openSite(false)
  mocks.flush.mockImplementation(persistOpenDocument)
  await act(async () => mocks.publish.onSend())
  expect(mocks.publish.state.phase, mocks.publish.state.message).not.toBe('error')
  await waitFor(() => mocks.publish.state.phase === 'live')
  const previous = structuredClone(mocks.board.document.manifest.published)
  await act(async () => mocks.agent.writeStyles(mocks.board.document.styles + '\nmain { color: red; }', {}))
  const host = vi.mocked(bridge.fetchJson).getMockImplementation()!
  if (stage === 'upload') vi.mocked(bridge.fetchRaw).mockRejectedValueOnce(new Error('Fake host upload failure'))
  else vi.mocked(bridge.fetchJson).mockImplementation(async request => {
    if (request.url.includes('/finalize/')) throw new Error('Fake host finalize failure')
    return host(request)
  })
  await act(async () => mocks.publish.onSend())
  await waitFor(() => mocks.publish.state.phase === 'error')
  expect(mocks.board.document.manifest.published).toEqual(previous)
  expect(currentDraft()).toMatchObject({ stylingChanged: true, matchesLive: false })
  await persistOpenDocument()
  await act(async () => mocks.switcher.onOpenDocument(site))
  await waitFor(() => !currentDraft().incomplete)
  expect(mocks.board.document.manifest.published).toEqual(previous)
  expect(currentDraft().stylingChanged).toBe(true)
})
