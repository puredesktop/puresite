/** The one output contract used by build/ and the explicit human Publish action. */
import { createFolder, readBinaryBase64, resetBuildFolder, writeBinaryFile, writeTextFile } from '../bridge/platformBridge'
import { SITE_ASSETS_DIR, SITE_BUILD_DIR, SITE_STYLESHEET } from '../constants'
import { checkSite, hasBlockingFinding, planBuild, type BuildResult } from './buildSite'
import { internalLinks } from './preview'
import { type PublishFile, type PublishOptions } from './publish'
import { publishWithComparison } from './publicationSnapshot'
import { dataProviderFor } from './siteData'
import type { PublishService } from './publishServices'
import { orderedPages, type SiteDocument } from './siteDocument'
import { stableStringify } from './siteHash'
import { llmsText, robotsText, sitemapXml } from './siteLenses'
import { linkGraph, shipPage } from './siteLinks'

export interface SiteOutputSnapshot {
  root: string
  document: SiteDocument
  availableAssets: string[]
  serviceId: string
  /** Only an address already known to the app, never inferred from a slug. */
  address?: string
}

/** An existing address applies only when updating that same host, under its declared contract. */
export function effectiveSiteAddress(document: SiteDocument, serviceId: string, service?: PublishService): string | undefined {
  const previous = document.manifest.published
  return previous?.service === serviceId && (!service || service.endpoints.update) ? previous.url : undefined
}

export interface SiteOutputInput {
  readSnapshot(): SiteOutputSnapshot
  /** Flush edits and write the managed public fonts before capturing a snapshot. */
  save(): Promise<void>
  /** The existing visible-frame verification gate. Throws its existing refusal on failure. */
  verify(): Promise<void>
}

export interface PreparedSite {
  snapshot: SiteOutputSnapshot
  files: PublishFile[]
  result: BuildResult
}

function bytes(file: PublishFile): number {
  return file.encoding === 'text' ? new TextEncoder().encode(file.content).length : atob(file.content).length
}

/** Prepare final paths and bytes once. Every consumer uses these, never rereads editor content. */
export async function prepareSiteOutput(snapshot: SiteOutputSnapshot): Promise<PreparedSite> {
  const { document, root, availableAssets, address, serviceId } = snapshot
  const findings = checkSite(document, availableAssets, Object.fromEntries(
    Object.entries(document.pages).map(([page, html]) => [page, internalLinks(html, page)]),
  ))
  if (hasBlockingFinding(findings)) throw new Error(findings.filter(f => f.severity === 'error').map(f => `${f.message}. ${f.fix}`).join('; '))
  const plan = planBuild(document, availableAssets)
  const files: PublishFile[] = []
  const text = (path: string, content: string, contentType: string): void => {
    files.push({ path, content, encoding: 'text', contentType })
  }
  for (const page of orderedPages(document)) text(page.path,
    shipPage(document.pages[page.path] ?? '', page.path, Object.keys(document.pages)), 'text/html; charset=utf-8')
  text(SITE_STYLESHEET, document.styles, 'text/css; charset=utf-8')
  text('llms.txt', llmsText(document, linkGraph(document)), 'text/plain; charset=utf-8')
  if (address) {
    text('sitemap.xml', sitemapXml(document, address), 'application/xml; charset=utf-8')
    text('robots.txt', robotsText(address), 'text/plain; charset=utf-8')
  }
  const provider = dataProviderFor(serviceId)
  if (document.collections.length && provider) text(provider.manifestPath, provider.render(document.collections), 'application/json')
  for (const name of plan.assets) {
    try {
      const binary = await readBinaryBase64(`${root}/${SITE_ASSETS_DIR}/${name}`)
      // Validate the transport before either consumer writes anything.
      const length = atob(binary.base64).length
      if (binary.byteLength !== undefined && length !== binary.byteLength) throw new Error('The asset read returned incomplete bytes.')
      files.push({ path: `${SITE_ASSETS_DIR}/${name}`, content: binary.base64, encoding: 'base64', contentType: binary.mimeType || 'application/octet-stream' })
    } catch (error) {
      throw new Error(`Required asset assets/${name} cannot be shipped. Restore the file or change its reference, then check again. ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { snapshot, files, result: { ...plan, files: files.map(file => ({ path: file.path, bytes: bytes(file) })), totalBytes: files.reduce((sum, file) => sum + bytes(file), 0) } }
}

/** Bind the guard to the captured input, including changes during asynchronous asset reads. */
export async function prepareCheckedSite(input: SiteOutputInput): Promise<PreparedSite> {
  const root = input.readSnapshot().root
  await input.save()
  if (root !== input.readSnapshot().root) throw new Error('The site changed while it was being saved. Check it again before building or publishing.')
  const source = stableStringify(input.readSnapshot())
  const snapshot: SiteOutputSnapshot = JSON.parse(source)
  await input.verify()
  if (source !== stableStringify(input.readSnapshot())) throw new Error('The site changed while it was being checked. Check it again before building or publishing.')
  const prepared = await prepareSiteOutput(snapshot)
  if (source !== stableStringify(input.readSnapshot())) throw new Error('The site changed while its files were being prepared. Check it again before building or publishing.')
  // Font/viewport/evidence changes are also subject to the original gate.
  await input.verify()
  if (source !== stableStringify(input.readSnapshot())) throw new Error('The site changed while it was being checked. Check it again before building or publishing.')
  // Asset bytes are not in the snapshot: the same files must still read the same after the check.
  const again = await prepareSiteOutput(snapshot)
  if (prepared.files.some((file, index) => file.content !== again.files[index]?.content)) throw new Error('The site changed while it was being checked. A file it uses was replaced. Check it again before building or publishing.')
  return prepared
}

/** Actual build entry path, shared by the UI and buildSite drawer tool. Never publishes. */
export async function runSiteBuild(input: SiteOutputInput): Promise<BuildResult & { buildPath: string }> {
  const prepared = await prepareCheckedSite(input)
  const buildPath = `${prepared.snapshot.root}/${SITE_BUILD_DIR}`
  // Old generated files must not survive a build with fewer pages/assets or no address.
  await resetBuildFolder(prepared.snapshot.root)
  for (const file of prepared.files) {
    const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
    if (folder) await createFolder(buildPath, folder)
    if (file.encoding === 'base64') await writeBinaryFile(`${buildPath}/${file.path}`, file.content)
    else await writeTextFile(`${buildPath}/${file.path}`, file.content)
  }
  return { ...prepared.result, buildPath }
}

/** Called only by the existing human Publish handler, with every host call intercepted in tests. */
export async function sendSiteOutput(input: SiteOutputInput, options: Omit<PublishOptions, 'files' | 'displayName'>) {
  const prepared = await prepareCheckedSite(input)
  if (prepared.snapshot.serviceId !== options.service.id) throw new Error('The publishing service changed. Check the site again before publishing.')
  return publishWithComparison(prepared.snapshot.document, prepared.files, options)
}
