import { expect, it } from 'vitest'
import { mapConcurrent, readSitePackage, serializeSitePackage } from './packageIO'
import { createDefaultSiteDocument } from './siteDocument'
import { defaultAccess, HERENOW_DATA } from './siteData'

const collection = { name: 'feedback', fields: [{ name: 'message', type: 'string' as const }], access: defaultAccess() }
function fixture() {
  const document = createDefaultSiteDocument()
  document.collections = [collection]
  const files = new Map(serializeSitePackage(document, []).map(f => [`/test/${f.name}`, f.content]))
  const io = {
    read: async (path: string) => { if (!files.has(path)) throw Error(`ENOENT: ${path}`); return files.get(path)! },
    list: async (path: string) => ({ entries: [...files.keys()].filter(p => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')).map(p => ({ name: p.slice(path.length + 1) })) }),
  }
  return { document, files, io }
}

it('saves and reopens collections before any build exists', async () => {
  const { document, io } = fixture()
  const opened = await readSitePackage('/test', io)
  expect(opened.collections).toEqual([collection])
  expect(opened.pages).toEqual(document.pages)
})

it('keeps an explicit empty collection list instead of resurrecting the last build', async () => {
  const { files, io } = fixture()
  files.set('/test/collections.json', '[]')
  files.set('/test/build/.herenow/data.json', HERENOW_DATA.render([collection]))
  expect((await readSitePackage('/test', io)).collections).toEqual([])
})

it('migrates a legacy build when the durable collection file is missing', async () => {
  const { files, io } = fixture()
  files.delete('/test/collections.json')
  files.set('/test/build/.herenow/data.json', HERENOW_DATA.render([collection]))
  expect((await readSitePackage('/test', io)).collections).toEqual([collection])
})

it.each(['not json', '{}', '[null]', '[{"name":"bad","fields":[]}]'])('refuses malformed collection data rather than dropping it: %s', async text => {
  const { files, io } = fixture()
  files.set('/test/collections.json', text)
  await expect(readSitePackage('/test', io)).rejects.toThrow()
  expect(files.get('/test/collections.json')).toBe(text)
})

it('keeps unreadable collection files from silently falling back to old definitions', async () => {
  const { io } = fixture()
  const read = io.read
  io.read = async path => { if (path.endsWith('collections.json')) throw Error('EACCES'); return read(path) }
  await expect(readSitePackage('/test', io)).rejects.toThrow('EACCES')
})

it('reads nested pages added outside the manifest and preserves their exact contents', async () => {
  const { files, io } = fixture()
  files.set('/test/pages/team/index.html', '<title>Team</title><p>Exact &amp; bytes</p>')
  const list = io.list
  io.list = async path => path.endsWith('/pages')
    ? { entries: [{ name: 'index.html' }, { name: 'team', isDirectory: true }] }
    : list(path)
  expect((await readSitePackage('/test', io)).pages['team/index.html']).toBe(files.get('/test/pages/team/index.html'))
})

it('bounds concurrent reads to four and retains order when they finish out of order', async () => {
  let active = 0, peak = 0
  const values = Array.from({ length: 20 }, (_, i) => i)
  const result = await mapConcurrent(values, async value => {
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, value % 4))
    active--; return value * 2
  })
  expect(peak).toBe(4)
  expect(result).toEqual(values.map(n => n * 2))
})
