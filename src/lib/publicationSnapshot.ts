import { requiredAssetNames } from './buildSite'
import { mapConcurrent } from './packageIO'
import { fingerprintPages, pageFingerprint } from './draftState'
import { publishSite, type PublishFile, type PublishOptions } from './publish'
import type { PublishedRecord, SiteDocument } from './siteDocument'

export type PublicationComparison = Pick<PublishedRecord, 'pages' | 'styles' | 'assets'>

/** Hash decoded bytes, never the transport spelling, filename or reported size. */
export function assetFingerprint(base64: string): string {
  return pageFingerprint(atob(base64))
}

/** Missing required bytes stay absent so the comparison explicitly remains incomplete. */
export async function readAssetFingerprints(
  document: SiteDocument,
  read: (name: string) => Promise<{ base64: string; byteLength?: number }>,
): Promise<Record<string, string>> {
  const entries = await mapConcurrent(requiredAssetNames(document), async name => {
    try {
      const binary = await read(name)
      if (binary.byteLength !== undefined && atob(binary.base64).length !== binary.byteLength) return null
      return [`assets/${name}`, assetFingerprint(binary.base64)] as const
    }
    catch { return null }
  })
  return Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null))
}

/** Capture before upload. Assets come only from the immutable files actually sent. */
export function publicationComparison(document: SiteDocument, files: readonly PublishFile[]): PublicationComparison {
  const assets: Record<string, string> = {}
  for (const file of [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    if (file.path.startsWith('assets/')) {
      assets[file.path] = file.encoding === 'base64'
        ? assetFingerprint(file.content)
        : pageFingerprint(new TextEncoder().encode(file.content).reduce((text, byte) => text + String.fromCharCode(byte), ''))
    }
  }
  // Never certify a snapshot whose required bytes weren't sent.
  const complete = requiredAssetNames(document).every(name => assets[`assets/${name}`] !== undefined)
  return { pages: fingerprintPages(document.pages), styles: pageFingerprint(document.styles), ...(complete ? { assets } : {}) }
}

/** The existing host must finalize successfully before callers can save this baseline. */
export async function publishWithComparison(document: SiteDocument, files: PublishFile[], options: Omit<PublishOptions, 'files' | 'displayName'>) {
  const sent = structuredClone(document)
  const sentFiles = files.map(file => ({ ...file }))
  const comparison = publicationComparison(sent, sentFiles)
  const live = await publishSite({ ...options, files: sentFiles, displayName: sent.title })
  return { live, comparison, document: sent }
}
