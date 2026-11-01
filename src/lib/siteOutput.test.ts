import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as bridge from '../bridge/platformBridge'
import { listAssetFiles, readSitePackage } from './packageIO'
import { checkSite, hasBlockingFinding } from './buildSite'
import { pageFingerprint } from './draftState'
import { internalLinks } from './preview'
import { localAssetReferences } from './siteReferences'
import { pageLinks, shipPage } from './siteLinks'
import { effectiveSiteAddress, prepareCheckedSite, runSiteBuild, sendSiteOutput, type SiteOutputInput, type SiteOutputSnapshot } from './siteOutput'
import { type PublishService } from './publishServices'

vi.mock('../bridge/platformBridge', () => ({
  createFolder: vi.fn(), readBinaryBase64: vi.fn(), resetBuildFolder: vi.fn(),
  writeBinaryFile: vi.fn(), writeTextFile: vi.fn(), fetchJson: vi.fn(), fetchRaw: vi.fn(),
}))

const service: PublishService = {
  id: 'herenow', name: 'Local fake host', description: 'Test transport only', anonymous: true, builtIn: false,
  endpoints: {
    create: { method: 'POST', url: 'https://fake.invalid/create' },
    update: { method: 'PUT', url: 'https://fake.invalid/update/{slug}' },
    finalize: { method: 'POST', url: 'https://fake.invalid/finalize/{slug}' },
  },
}
const fixture = join(process.cwd(), 'src/lib/fixtures/checked-site.site')
let root: string
let snapshot: SiteOutputSnapshot
let input: SiteOutputInput
let uploaded: Record<string, Buffer>
let declarations: { path: string; size: number }[]
let finalized: number

async function listing(path: string) {
  return { entries: (await readdir(path, { withFileTypes: true })).map(file => ({ name: file.name, isDirectory: file.isDirectory() })) }
}
async function tree(path: string, prefix = ''): Promise<Record<string, Buffer>> {
  const entries = await readdir(path, { withFileTypes: true })
  const files: Record<string, Buffer> = {}
  for (const entry of entries) {
    const name = prefix + entry.name
    if (entry.isDirectory()) Object.assign(files, await tree(join(path, entry.name), name + '/'))
    else files[name] = await readFile(join(path, entry.name))
  }
  return files
}

beforeEach(async () => {
  vi.resetAllMocks()
  root = await mkdtemp(join(tmpdir(), 'puresite-output-'))
  await cp(fixture, root, { recursive: true })
  snapshot = {
    root, document: await readSitePackage(root, { read: path => readFile(path, 'utf8'), list: listing }),
    availableAssets: (await listAssetFiles(root, listing)).map(file => file.name), serviceId: service.id,
  }
  input = { readSnapshot: () => snapshot, save: vi.fn(async () => {}), verify: vi.fn(async () => {}) }
  uploaded = {}; declarations = []; finalized = 0
  vi.mocked(bridge.createFolder).mockImplementation(async (parent, name) => { await mkdir(join(parent, name), { recursive: true }) })
  vi.mocked(bridge.resetBuildFolder).mockImplementation(async root => { await rm(join(root, 'build'), { recursive: true, force: true }); await mkdir(join(root, 'build')) })
  vi.mocked(bridge.readBinaryBase64).mockImplementation(async path => ({ base64: (await readFile(path)).toString('base64'), mimeType: 'application/octet-stream' }))
  vi.mocked(bridge.writeTextFile).mockImplementation(async (path, content) => { await writeFile(path, content, 'utf8') })
  vi.mocked(bridge.writeBinaryFile).mockImplementation(async (path, content) => { await writeFile(path, Buffer.from(content, 'base64')) })
  vi.mocked(bridge.fetchJson).mockImplementation(async request => {
    if (request.url.includes('/finalize/')) { finalized++; return { siteUrl: snapshot.address ?? 'https://returned-by-fake.invalid/' } }
    expect([service.endpoints.create!.url, 'https://fake.invalid/update/fixture']).toContain(request.url)
    declarations = (request.body as { files: typeof declarations }).files
    return { slug: 'fixture', upload: { versionId: 'test-version', uploads: declarations.map(file => ({ path: file.path, method: 'PUT', url: `https://fake.invalid/upload/${encodeURIComponent(file.path)}`, headers: {} })) } }
  })
  vi.mocked(bridge.fetchRaw).mockImplementation(async request => {
    const path = decodeURIComponent(request.url.split('/upload/')[1])
    uploaded[path] = Buffer.from(request.body, request.encoding === 'base64' ? 'base64' : 'utf8')
  })
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('actual checked build and human publish entry paths', () => {
  it.each([false, true])('ship exactly the same paths and decoded bytes (known address: %s)', async known => {
    if (known) {
      snapshot.address = 'https://known.example.org'
      snapshot.document.manifest.published = { service: service.id, slug: 'fixture', url: snapshot.address }
    }
    expect(hasBlockingFinding(checkSite(snapshot.document, snapshot.availableAssets, Object.fromEntries(Object.entries(snapshot.document.pages).map(([page, html]) => [page, internalLinks(html, page)]))))).toBe(false)
    const result = await runSiteBuild(input)
    expect(bridge.fetchJson).not.toHaveBeenCalled()
    expect(bridge.fetchRaw).not.toHaveBeenCalled()
    expect(finalized).toBe(0)
    const built = await tree(result.buildPath)
    const expected = ['index.html', 'about/index.html', 'about/team/index.html', 'styles/site.css', 'llms.txt', '.herenow/data.json', 'assets/hero.png', 'assets/mark.svg', 'assets/guide.pdf', 'assets/background.png', 'assets/fonts/fixture-sans.woff2', ...(known ? ['sitemap.xml', 'robots.txt'] : [])].sort()
    expect(Object.keys(built).sort()).toEqual(expected)
    expect(result.files.map(file => file.path).sort()).toEqual(expected)
    expect(result.totalBytes).toBe(Object.values(built).reduce((sum, file) => sum + file.length, 0))
    const { document: sent } = await sendSiteOutput(input, { service, ...(known ? { existing: { slug: 'fixture' } } : {}) })
    expect(finalized).toBe(1)
    expect(Object.keys(uploaded).sort()).toEqual(expected)
    for (const path of expected) {
      expect(uploaded[path], path).toEqual(built[path])
      expect(declarations.find(file => file.path === path)?.size, path).toBe(built[path].length)
      if (path.startsWith('assets/')) expect(built[path], path).toEqual(await readFile(join(root, path)))
    }
    for (const [page, html] of Object.entries(sent.pages)) {
      expect(built[page].toString()).toBe(shipPage(html, page, Object.keys(sent.pages)))
      for (const target of localAssetReferences(built[page].toString(), page)) expect(built[target], target).toBeDefined()
      expect(pageLinks(built[page].toString(), page).every(link => link.target in sent.pages)).toBe(true)
    }
    for (const target of localAssetReferences(built['styles/site.css'].toString(), 'styles/site.css')) expect(built[target], target).toBeDefined()
    expect(built['index.html'].toString()).toContain('>Read the guide</a>')
    expect(built['index.html'].toString()).toContain('https://example.org/')
    expect(built['index.html'].toString()).toContain('Future work')
    expect(built['index.html'].toString()).not.toContain('href="/future/"')
    if (known) {
      expect(built['sitemap.xml'].toString()).toContain('https://known.example.org/about/team/')
      expect(built['robots.txt'].toString()).toContain('https://known.example.org/sitemap.xml')
    } else {
      expect(built['sitemap.xml']).toBeUndefined()
      expect(built['robots.txt']).toBeUndefined()
      expect(Object.values(built).some(bytes => bytes.toString().includes('https://returned-by-fake.invalid'))).toBe(false)
    }
  })

  it.each(['missing', 'reference-only', 'unreadable'])('refuses required %s material before writing or calling any host', async problem => {
    if (problem === 'missing') snapshot.document.styles += '\nbody {background:url(../assets/missing.png)}'
    if (problem === 'reference-only') snapshot.document.pages['index.html'] += '<img src="/assets/reference.png">'
    if (problem === 'unreadable') await rm(join(root, 'assets/fonts/fixture-sans.woff2'))
    const error = problem === 'missing' ? /missing.png/ : problem === 'reference-only' ? /reference-only/ : /Required asset assets\/fonts\/fixture-sans.woff2 cannot be shipped/
    await expect(runSiteBuild(input)).rejects.toThrow(error)
    await expect(sendSiteOutput(input, { service })).rejects.toThrow(error)
    expect(bridge.writeTextFile).not.toHaveBeenCalled()
    expect(bridge.resetBuildFolder).not.toHaveBeenCalled()
    expect(bridge.fetchJson).not.toHaveBeenCalled()
    expect(bridge.fetchRaw).not.toHaveBeenCalled()
  })

  it.each(['failed', 'checking'])('retains the required verification gate: %s cannot publish or build', async state => {
    input.verify = vi.fn(async () => { throw new Error(`Existing verification gate: ${state}`) })
    await expect(runSiteBuild(input)).rejects.toThrow(state)
    await expect(sendSiteOutput(input, { service })).rejects.toThrow(state)
    expect(bridge.fetchJson).not.toHaveBeenCalled()
    expect(bridge.writeTextFile).not.toHaveBeenCalled()
  })

  it('refuses an edit made after a successful check, during asynchronous preparation', async () => {
    vi.mocked(bridge.readBinaryBase64).mockImplementationOnce(async path => {
      snapshot.document.pages['index.html'] += '<p>Unverified editor change</p>'
      return { base64: (await readFile(path)).toString('base64'), mimeType: 'image/png' }
    })
    await expect(sendSiteOutput(input, { service })).rejects.toThrow('site changed')
    expect(input.verify).toHaveBeenCalledOnce()
    expect(bridge.fetchJson).not.toHaveBeenCalled()
  })

  it('refuses same-size asset bytes replaced during the final check', async () => {
    const original = await readFile(join(root, 'assets/hero.png'))
    const replacement = Buffer.from(original); replacement[replacement.length - 1] ^= 0xff
    let checks = 0
    input.verify = vi.fn(async () => { if (++checks === 2) await writeFile(join(root, 'assets/hero.png'), replacement) })
    await expect(sendSiteOutput(input, { service })).rejects.toThrow('site changed')
    expect(bridge.fetchJson).not.toHaveBeenCalled()
  })

  it('fingerprints the asset bytes the final check covered, which are the bytes delivered', async () => {
    const original = await readFile(join(root, 'assets/hero.png'))
    const replacement = Buffer.from(original); replacement[replacement.length - 1] ^= 0xff
    let checks = 0
    input.verify = vi.fn(async () => { if (++checks === 1) await writeFile(join(root, 'assets/hero.png'), replacement) })
    const { comparison } = await sendSiteOutput(input, { service })
    expect(uploaded['assets/hero.png']).toEqual(replacement)
    expect(comparison.assets?.['assets/hero.png']).toBe(pageFingerprint(replacement.toString('latin1')))
    expect(comparison.assets?.['assets/hero.png']).not.toBe(pageFingerprint(original.toString('latin1')))
  })

  it('requires a fresh successful check when an editor change precedes Publish', async () => {
    await runSiteBuild(input)
    snapshot.document.pages['index.html'] += '<p>Unverified editor change</p>'
    input.verify = vi.fn(async () => { throw new Error('changed since it was measured') })
    await expect(sendSiteOutput(input, { service })).rejects.toThrow('changed since it was measured')
    expect(bridge.fetchJson).not.toHaveBeenCalled()
  })

  it('does not reread editor state while uploading the checked snapshot', async () => {
    const before = snapshot.document.pages['index.html']
    const fake = vi.mocked(bridge.fetchRaw).getMockImplementation()!
    vi.mocked(bridge.fetchRaw).mockImplementation(async request => {
      snapshot.document.pages['index.html'] += '<p>Edited during upload</p>'
      return fake(request)
    })
    const sent = await sendSiteOutput(input, { service })
    expect(sent.document.pages['index.html']).toBe(before)
    expect(uploaded['index.html'].toString()).not.toContain('Edited during upload')
  })

  it('preparation alone never contacts the host', async () => {
    await prepareCheckedSite(input)
    expect(bridge.fetchJson).not.toHaveBeenCalled()
    expect(bridge.fetchRaw).not.toHaveBeenCalled()
    expect(bridge.writeTextFile).not.toHaveBeenCalled()
  })
})

it('refuses a save failure before verification or contacting a host', async () => {
  input.save = vi.fn(async () => { throw new Error('Disk full') })
  await expect(sendSiteOutput(input, { service })).rejects.toThrow('Disk full')
  expect(input.verify).not.toHaveBeenCalled()
  expect(bridge.fetchJson).not.toHaveBeenCalled()
})

it('refuses incomplete binary reads instead of silently truncating output', async () => {
  vi.mocked(bridge.readBinaryBase64).mockResolvedValueOnce({ base64: 'AA==', byteLength: 100, mimeType: 'image/png' })
  await expect(sendSiteOutput(input, { service })).rejects.toThrow('incomplete bytes')
  expect(bridge.fetchJson).not.toHaveBeenCalled()
})

it('refuses a publishing service changed while the human handler was saving', async () => {
  input.save = async () => { snapshot.serviceId = 'another-service' }
  await expect(sendSiteOutput(input, { service })).rejects.toThrow('publishing service changed')
  expect(bridge.fetchJson).not.toHaveBeenCalled()
})

it('uses a known address only for the same updating host and never derives one from a slug', () => {
  expect(effectiveSiteAddress(snapshot.document, service.id, service)).toBeUndefined()
  snapshot.document.manifest.published = { service: service.id, slug: 'fixture' }
  expect(effectiveSiteAddress(snapshot.document, service.id, service)).toBeUndefined()
  snapshot.document.manifest.published.url = 'https://known.example.org'
  expect(effectiveSiteAddress(snapshot.document, service.id, service)).toBe('https://known.example.org')
  expect(effectiveSiteAddress(snapshot.document, 'other-host')).toBeUndefined()
  expect(effectiveSiteAddress(snapshot.document, service.id, { ...service, endpoints: { create: service.endpoints.create } })).toBeUndefined()
  // An offline local build can still use its recorded address without discovering a host.
  expect(effectiveSiteAddress(snapshot.document, service.id)).toBe('https://known.example.org')
})

it('refuses switching packages while the initial save is pending', async () => {
  input.save = async () => { snapshot.root = '/another-site.site' }
  await expect(sendSiteOutput(input, { service })).rejects.toThrow('site changed')
  expect(bridge.fetchJson).not.toHaveBeenCalled()
  expect(input.verify).not.toHaveBeenCalled()
})
