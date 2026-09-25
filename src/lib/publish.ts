/**
 * Getting the build out to a host.
 *
 * Publishing is three steps and only two of them are JSON: declare the files
 * and receive a presigned URL for each, PUT each file's bytes to its URL, and
 * finalize the version to make it live. The middle step is why this lives in
 * the app rather than entirely in a tool — every MyTools request body is
 * JSON-encoded, so a tool cannot carry file bytes.
 *
 * Nothing here names a provider in its logic: the endpoints come from the
 * chosen service and the upload targets come from the service's own response,
 * so another host that speaks the same three steps needs no code.
 */
import { fetchJson, fetchRaw } from '../bridge/platformBridge'
import { endpointUrl, type PublishService } from './publishServices'

export interface PublishFile {
  path: string
  /** Text is written as text; binary arrives as base64 from the package. */
  content: string
  encoding: 'text' | 'base64'
  contentType: string
}

export interface PublishProgress {
  step: 'declaring' | 'uploading' | 'finalizing' | 'done'
  uploaded: number
  total: number
  message: string
}

export interface PublishResult {
  slug: string
  siteUrl: string
  /** Anonymous sites only, and returned exactly once — never summarise it. */
  claimUrl?: string
  claimToken?: string
  skipped: number
  uploaded: number
}

export interface PublishOptions {
  service: PublishService
  files: PublishFile[]
  displayName: string
  /** Present when republishing a site this package has published before. */
  existing?: { slug: string; claimToken?: string; baseVersionId?: string }
  apiKey?: string
  onProgress?: (progress: PublishProgress) => void
  shouldCancel?: () => boolean
}

export class PublishCancelled extends Error {
  constructor() {
    super('Publishing stopped.')
    this.name = 'PublishCancelled'
  }
}

function byteLength(file: PublishFile): number {
  if (file.encoding === 'base64') {
    // Four base64 characters carry three bytes; the padding is not content.
    const padding = (file.content.match(/=+$/)?.[0].length ?? 0)
    return Math.floor((file.content.length * 3) / 4) - padding
  }
  return new TextEncoder().encode(file.content).length
}

/**
 * sha256 of a file, so the host can skip what it already holds.
 *
 * Optional in the contract, and worth sending: on a republish where one page
 * changed, everything else comes back under "skipped" and is never uploaded.
 */
async function hashOf(file: PublishFile): Promise<string | undefined> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return undefined
  try {
    const bytes =
      file.encoding === 'base64'
        ? Uint8Array.from(atob(file.content), char => char.charCodeAt(0))
        : new TextEncoder().encode(file.content)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return undefined
  }
}

export async function publishSite(
  options: PublishOptions,
): Promise<PublishResult> {
  const { files, onProgress, shouldCancel, service } = options
  const check = (): void => {
    if (shouldCancel?.()) throw new PublishCancelled()
  }

  // The endpoints are the chosen service's own, discovered from its tool (the
  // built-in fills gaps from its shipped defaults). Nothing past this line
  // knows which host it is talking to.
  const creating = !options.existing
  const declareTo = creating
    ? service.endpoints.create
    : service.endpoints.update
  if (!declareTo) {
    throw new Error(
      creating
        ? `${service.name} does not say where to send files — its tool has no create operation with a URL.`
        : `${service.name} does not say how to update a published site — its tool has no update operation with a URL.`,
    )
  }

  onProgress?.({
    step: 'declaring',
    uploaded: 0,
    total: files.length,
    message: `Declaring ${files.length} files…`,
  })
  check()

  const declared = await Promise.all(
    files.map(async file => ({
      path: file.path,
      size: byteLength(file),
      contentType: file.contentType,
      hash: await hashOf(file),
    })),
  )

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
  }

  const created = (await fetchJson({
    url: endpointUrl(declareTo, options.existing?.slug),
    method: declareTo.method || (creating ? 'POST' : 'PUT'),
    headers,
    body: {
      files: declared,
      displayName: options.displayName.slice(0, 80),
      ...(options.existing?.claimToken
        ? { claimToken: options.existing.claimToken }
        : {}),
      ...(options.existing?.baseVersionId
        ? { baseVersionId: options.existing.baseVersionId }
        : {}),
    },
  })) as {
    slug?: string
    siteUrl?: string
    claimUrl?: string
    claimToken?: string
    upload?: {
      versionId?: string
      uploads?: { path: string; method: string; url: string; headers: Record<string, string> }[]
      skipped?: string[]
      finalizeUrl?: string
    }
  }

  const slug = created.slug
  const upload = created.upload
  if (!slug || !upload?.versionId) {
    throw new Error('The service did not return a version to upload into.')
  }

  const targets = upload.uploads ?? []
  const byPath = new Map(files.map(file => [file.path, file]))

  let uploaded = 0
  for (const target of targets) {
    check()
    const file = byPath.get(target.path)
    if (!file) continue
    onProgress?.({
      step: 'uploading',
      uploaded,
      total: targets.length,
      message: `Uploading ${target.path}…`,
    })
    // The presigned URL carries its own authorisation; sending ours as well
    // is how a signature gets rejected.
    await fetchRaw({
      url: target.url,
      method: target.method || 'PUT',
      headers: target.headers,
      body: file.content,
      encoding: file.encoding,
    })
    uploaded += 1
  }

  check()
  onProgress?.({
    step: 'finalizing',
    uploaded,
    total: targets.length,
    message: 'Making it live…',
  })

  // The service's response names the finalize URL when it has one; the
  // discovered endpoint is the fallback, not the override.
  const finalize = service.endpoints.finalize
  const finalizeUrl =
    upload.finalizeUrl ?? (finalize ? endpointUrl(finalize, slug) : undefined)
  if (!finalizeUrl) {
    throw new Error(
      `${service.name} did not say how to make the version live — no finalize URL in its response or its tool.`,
    )
  }
  const live = (await fetchJson({
    url: finalizeUrl,
    method: upload.finalizeUrl ? 'POST' : finalize?.method || 'POST',
    headers,
    body: {
      versionId: upload.versionId,
      ...(created.claimToken || options.existing?.claimToken
        ? { claimToken: created.claimToken ?? options.existing?.claimToken }
        : {}),
    },
  })) as { siteUrl?: string }

  const result: PublishResult = {
    slug,
    siteUrl: live.siteUrl ?? created.siteUrl ?? '',
    // Returned exactly once by the service. It is carried through verbatim
    // and shown in full — a claim link with anything trimmed out of it does
    // not work, and there is no second copy to fall back on.
    ...(created.claimUrl ? { claimUrl: created.claimUrl } : {}),
    ...(created.claimToken ? { claimToken: created.claimToken } : {}),
    skipped: upload.skipped?.length ?? 0,
    uploaded,
  }

  onProgress?.({
    step: 'done',
    uploaded,
    total: targets.length,
    message: `Live at ${result.siteUrl}`,
  })
  return result
}
