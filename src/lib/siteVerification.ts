/**
 * Is the site, as previewed, the site that will ship?
 *
 * A deck or a canvas verifies one render. A site verifies every page, and
 * two kinds of thing can be wrong with it:
 *
 *   - FILE facts — a link to a page that does not exist, an image never
 *     added, a stylesheet linked with the wrong number of `../`. These are
 *     true whether or not any frame has laid the page out, so they fail the
 *     site outright (`failed`), with the checker's own words.
 *   - RENDER facts — measured in a frame. The kit's rule holds per page: a
 *     page measured in a hidden frame or before fonts arrived is `checking`,
 *     never verified; a clean measurement that scrolls sideways at the
 *     chosen width is `failed`.
 *
 * And one honest gap: an asset too large to inline cannot be shown by the
 * preview at all. The build ships it fine. That is `checking` with a reason
 * that says so, because "verified" would claim the preview showed something
 * it did not.
 *
 * The site's state is the worst of its pages: any failed → failed; else any
 * checking → checking; else verified.
 */
import {
  verify,
  type FontsStatus,
  type Verification,
  type VerificationReason,
  type VerificationState,
} from '@purescience/platform-ui/editing/renderFingerprint'
import type { ExportDecision } from '@purescience/platform-ui/editing/exportGuard'
import { contentHash, pageHash, stylesHash } from './siteHash'
import type { CheckFinding } from './buildSite'
import type { SiteDocument } from './siteDocument'

/** What one page was measured to be, by whichever frame measured it. */
export interface PageEvidence {
  page: string
  /** Non-zero geometry was read — the frame was alive. */
  measured: boolean
  fontsStatus: FontsStatus
  /** The conditions it was measured under (`renderFingerprint`). */
  fingerprint: string
  /** `pageRenderHash` at measurement time. */
  renderHash: string
  /** The page is wider than the viewport it was measured at. */
  overflowX: boolean
  /** Laid-out height, CSS px. */
  height: number
  at: number
}

export interface PageVerification {
  page: string
  state: VerificationState
  /** People words, one per thing keeping the page from verified. */
  reasons: string[]
}

export interface SiteVerification {
  state: VerificationState
  reasons: string[]
  pages: Record<string, PageVerification>
}

export const UNCHECKED_SITE: SiteVerification = Object.freeze({
  state: 'checking',
  reasons: ['the pages have not been measured yet'],
  pages: {},
}) as SiteVerification

/** What a page's render depends on: its own markup and the shared stylesheet. */
export function pageRenderHash(document: SiteDocument, page: string): string {
  return contentHash(`${pageHash(document.pages[page] ?? '')}|${stylesHash(document.styles)}`)
}

function wordsFor(page: string, reason: VerificationReason, viewportWidth: number): string {
  switch (reason) {
    case 'hidden-frame':
      return `${page} has not been measured in a visible frame yet`
    case 'fonts-loading':
      return `fonts were still loading when ${page} was measured`
    case 'stale-content':
      return `${page} changed since it was measured`
    case 'stale-fingerprint':
      return `the viewport or fonts changed since ${page} was measured`
    case 'checks-failed':
      return `${page} scrolls sideways at ${viewportWidth}px — something on it is wider than the screen`
  }
}

export interface VerifySiteInput {
  document: SiteDocument
  /** Every finding the checker has, site-level ones included. */
  findings: CheckFinding[]
  evidence: Record<string, PageEvidence | undefined>
  /** The fingerprint a reader sees now — the stage's viewport and fonts. */
  currentFingerprint: string
  viewportWidth: number
  /** Page → the assets its preview cannot show, with their total bytes. */
  oversize?: Record<string, { names: string[]; bytes: number } | null>
}

function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`
}

/** One page's verdict: file facts first, then the kit's render machine. */
export function verifyPage(input: VerifySiteInput, page: string): PageVerification {
  const blocking = input.findings.filter(
    finding => finding.page === page && finding.severity === 'error',
  )
  if (blocking.length) {
    return {
      page,
      state: 'failed',
      reasons: blocking.map(finding => finding.message),
    }
  }
  const evidence = input.evidence[page]
  const renderHash = pageRenderHash(input.document, page)
  const verdict: Verification = verify({
    measured: evidence?.measured ?? false,
    fontsStatus: evidence?.fontsStatus ?? 'loading',
    fingerprint: evidence?.fingerprint ?? '',
    currentFingerprint: input.currentFingerprint,
    contentHash: evidence?.renderHash ?? '',
    currentHash: renderHash,
    passed: evidence ? !evidence.overflowX : true,
  })
  const reasons = evidence
    ? verdict.reasons.map(reason => wordsFor(page, reason, input.viewportWidth))
    : [`${page} has not been measured yet`]
  const oversize = input.oversize?.[page]
  if (oversize?.names.length) {
    reasons.push(
      `the preview can't show ${oversize.names.map(name => `assets/${name}`).join(', ')} (${megabytes(oversize.bytes)}) on ${page} — the build will include ${oversize.names.length === 1 ? 'it' : 'them'}`,
    )
    return { page, state: 'checking', reasons }
  }
  return { page, state: verdict.state, reasons }
}

export function verifySite(input: VerifySiteInput): SiteVerification {
  const pages: Record<string, PageVerification> = {}
  for (const page of Object.keys(input.document.pages).sort()) {
    pages[page] = verifyPage(input, page)
  }
  const siteLevel = input.findings.filter(
    finding => !finding.page && finding.severity === 'error',
  )
  const verdicts = Object.values(pages)
  const failed = [
    ...siteLevel.map(finding => finding.message),
    ...verdicts.filter(item => item.state === 'failed').flatMap(item => item.reasons),
  ]
  if (failed.length) return { state: 'failed', reasons: failed, pages }
  const checking = verdicts
    .filter(item => item.state === 'checking')
    .flatMap(item => item.reasons)
  if (checking.length) return { state: 'checking', reasons: checking, pages }
  return { state: 'verified', reasons: [], pages }
}

// ---- the words at the door out -------------------------------------------

/** What a person (or a tool) is told when the build or publish is refused. */
export function exportRefusalMessage(
  decision: Exclude<ExportDecision, { ok: true }>,
  verification: SiteVerification,
): string {
  const reasons = verification.reasons
  if (decision.reason === 'failed') {
    return `The site isn't ready to ship — ${reasons.join('; ')}.`
  }
  const first = reasons[0] ? ` (${reasons[0]})` : ''
  return `The site is still being checked${first}. Keep PureSite visible for a moment and try again.`
}

/** A build or publish the guard refused — the message is already in people words. */
export class SiteExportRefused extends Error {
  readonly verification: SiteVerification
  constructor(message: string, verification: SiteVerification) {
    super(message)
    this.name = 'SiteExportRefused'
    this.verification = verification
  }
}

/** The badge's words. */
export function verificationBadge(verification: SiteVerification): string {
  if (verification.state === 'verified') return 'Previews as it ships'
  if (verification.state === 'failed') {
    const count = verification.reasons.length
    return `Won't ship right · ${count} thing${count === 1 ? '' : 's'} to fix`
  }
  return 'Being checked'
}
