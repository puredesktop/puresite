/**
 * PureServer PureCloud `publish` Client for PureSite.
 *
 * Uses `bridge.call(PLATFORM_BRIDGE_METHODS.CLOUD_CALL, [{ service: 'publish', action, input }])`
 * to publish static sites to `/s/<slug>/`, manage versions & rollbacks, and
 * read/delete zero-JS `_forms/contact` submissions — degrading gracefully when
 * PureServer is offline or not attached.
 */
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import { bridge } from '../bridge/platformBridge'
import { SITE_STYLESHEET } from '../constants'
import { orderedPages, type SiteDocument } from './siteDocument'
import { llmsText } from './siteLenses'
import { linkGraph, shipPage } from './siteLinks'

export interface CloudPublishStatus {
  connected: boolean
  publicUrl?: string
  counts?: Record<string, number>
  reason?: string
}

export interface CloudPublishedSiteItem {
  id: string
  slug: string
  title: string
  description?: string
  url: string
  active?: boolean
  activeVersion?: number
  hasPasscode?: boolean
  passcode?: string
  expiresAt?: string | null
  allowForms?: boolean
  updatedAt?: string
  createdAt?: string
}

export interface CloudSiteVersion {
  version: number
  note?: string
  contentHash?: string
  createdAt?: string
  fileCount?: number
}

export interface CloudFormSubmission {
  id: string
  formName: string
  fields: Record<string, string>
  createdAt: string
}

export interface CloudPublishFileInput {
  path: string
  contentType: string
  text?: string
  base64?: string
}

export interface PublishCloudSiteInput {
  id?: string
  slug: string
  title: string
  description?: string
  files: CloudPublishFileInput[]
  passcode?: string
  expiresAt?: string
  allowForms?: boolean
  note?: string
}

async function callPublishService<T>(action: string, input?: Record<string, unknown>): Promise<T> {
  return (await bridge.call(PLATFORM_BRIDGE_METHODS.CLOUD_CALL, [
    {
      service: 'publish',
      action,
      ...(input !== undefined ? { input } : {}),
    },
  ])) as T
}

/** Generate a clean URL slug for `/s/<slug>/`. */
export function slugifySiteTitle(title: string): string {
  const cleaned = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return cleaned || 'my-site'
}

function guessContentType(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8'
  if (lower.endsWith('.xml')) return 'application/xml; charset=utf-8'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.woff2')) return 'font/woff2'
  if (lower.endsWith('.ico')) return 'image/x-icon'
  return 'application/octet-stream'
}

/**
 * Assemble a ready-to-publish static file list from the active `SiteDocument`
 * and any in-memory preview asset data URLs.
 */
export function buildCloudSiteFiles(
  document: SiteDocument,
  previewDataUrls: Record<string, string> = {},
): CloudPublishFileInput[] {
  const files: CloudPublishFileInput[] = []
  const pageKeys = Object.keys(document.pages)
  for (const page of orderedPages(document)) {
    const shipped = shipPage(document.pages[page.path] ?? '', page.path, pageKeys)
    files.push({
      path: page.path,
      contentType: 'text/html; charset=utf-8',
      text: shipped,
    })
  }
  files.push({
    path: SITE_STYLESHEET,
    contentType: 'text/css; charset=utf-8',
    text: document.styles,
  })
  files.push({
    path: 'llms.txt',
    contentType: 'text/plain; charset=utf-8',
    text: llmsText(document, linkGraph(document)),
  })

  for (const [name, dataUrl] of Object.entries(previewDataUrls)) {
    const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) continue
    files.push({
      path: `assets/${name}`,
      contentType: match[1] || guessContentType(name),
      base64: match[2]!,
    })
  }

  return files
}

/** Check PureServer PureCloud `publish` connectivity; never throws on offline/standalone setups. */
export async function getCloudPublishStatus(): Promise<CloudPublishStatus> {
  try {
    const res = await callPublishService<Partial<CloudPublishStatus>>('status')
    if (!res || typeof res !== 'object') {
      return { connected: false, reason: 'PureServer publish service is not attached.' }
    }
    return {
      connected: Boolean(res.connected),
      publicUrl: res.publicUrl,
      counts: res.counts,
      ...(res.connected ? {} : { reason: 'PureServer is currently disconnected.' }),
    }
  } catch (error) {
    return {
      connected: false,
      reason:
        error instanceof Error
          ? error.message
          : 'PureServer is not attached in this session.',
    }
  }
}

export async function listCloudSites(): Promise<{
  publicUrl?: string
  items: CloudPublishedSiteItem[]
}> {
  const res = await callPublishService<{
    publicUrl?: string
    items?: CloudPublishedSiteItem[]
  }>('list', { kind: 'site' })
  return {
    publicUrl: res?.publicUrl,
    items: Array.isArray(res?.items) ? res.items : [],
  }
}

export async function getCloudSite(id: string): Promise<{
  item: CloudPublishedSiteItem
  versions: CloudSiteVersion[]
  formSubmissions: CloudFormSubmission[]
}> {
  const res = await callPublishService<{
    item: CloudPublishedSiteItem
    versions?: CloudSiteVersion[]
    formSubmissions?: CloudFormSubmission[]
  }>('get', { id })
  return {
    item: res.item,
    versions: Array.isArray(res.versions) ? res.versions : [],
    formSubmissions: Array.isArray(res.formSubmissions) ? res.formSubmissions : [],
  }
}

export async function publishCloudSite(input: PublishCloudSiteInput): Promise<{
  item: CloudPublishedSiteItem
  version?: CloudSiteVersion | number
  contentHash?: string
}> {
  return callPublishService('publishSite', input as unknown as Record<string, unknown>)
}

export async function rollbackCloudSiteVersion(
  id: string,
  version: number,
): Promise<{ item: CloudPublishedSiteItem }> {
  return callPublishService('rollbackVersion', { id, version })
}

export async function updateCloudSite(input: {
  id: string
  active?: boolean
  passcode?: string
  allowForms?: boolean
}): Promise<{ item: CloudPublishedSiteItem }> {
  return callPublishService('update', input)
}

export async function removeCloudSite(id: string): Promise<void> {
  await callPublishService('remove', { id })
}

export async function listCloudFormSubmissions(
  id: string,
): Promise<{ submissions: CloudFormSubmission[] }> {
  const res = await callPublishService<{ submissions?: CloudFormSubmission[] }>(
    'listFormSubmissions',
    { id },
  )
  return {
    submissions: Array.isArray(res?.submissions) ? res.submissions : [],
  }
}

export async function deleteCloudFormSubmission(
  id: string,
  submissionId: string,
): Promise<void> {
  await callPublishService('deleteFormSubmission', { id, submissionId })
}
