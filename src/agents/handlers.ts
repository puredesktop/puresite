/**
 * What each tool actually does.
 *
 * Handlers validate, call the app's own callback, and return something the
 * model can read back — never a bare "ok". A tool that changes the site says
 * what the site now looks like, so the next call does not need a round trip
 * to find out: every write returns the new site hash and the page's hash.
 *
 * A write computed against a page that has since changed is refused by the
 * door with "changed since your read" — the refusal names the tool to call
 * again. Nothing here retries with stale content on the agent's behalf.
 */
import { formatAgentToolJson } from '@purescience/platform-ui/bridge/agentToolHelpers'
import type { AgentToolHandlerResult } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { revisionLabel } from '@purescience/platform-ui/editing/revisionHistory'
import {
  AgentSiteToolError,
  type AgentBase,
  type AgentLanded,
  type SiteAgentToolContext,
} from './catalog'
import { hasBlockingFinding } from '../lib/buildSite'
import { normalizePagePath } from '../lib/pages'
import { nameOf } from '../lib/assetNames'
import { linkGraph, linksForPage, promiseBrief } from '../lib/siteLinks'
import { urlPathFor } from '../lib/siteDocument'
import { SiteExportRefused } from '../lib/siteVerification'
import {
  checkCollections,
  dataProviderFor,
  defaultAccess,
  FIELD_TYPES,
  type AccessLevel,
  type Collection,
  type CollectionField,
  type FieldType,
} from '../lib/siteData'
import type { AssetRole } from '../lib/assetNotes'

type Args = Record<string, unknown>

function text(args: Args, key: string, what: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new AgentSiteToolError(`${what} is required`)
  }
  return value
}

function optionalText(args: Args, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function number(args: Args, key: string): number {
  const value = args[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AgentSiteToolError(`${key} must be a number`)
  }
  return value
}

/**
 * Resolve the page a tool means.
 *
 * Defaults to the page on screen: an agent asked to "make the heading bigger"
 * means the page the person is looking at, and making it name that page
 * explicitly every time is friction that produces wrong guesses.
 */
function pageOf(context: SiteAgentToolContext, args: Args): string {
  const asked = optionalText(args, 'page')
  if (!asked) return context.selectedPage
  const normalized = normalizePagePath(asked)
  const known = Object.keys(context.document.pages)
  if (known.includes(asked)) return asked
  if (known.includes(normalized)) return normalized
  throw new AgentSiteToolError(
    `no page "${asked}" — the site has ${known.join(', ')}`,
  )
}

/**
 * The base a page tool names: `baseHash` is that page's hash (from readPage
 * or getSiteContext's pages[].hash), checked against that page only, so an
 * edit to one page is not refused because another page moved.
 */
function pageBase(args: Args, page: string, required = false): AgentBase {
  const baseHash = required
    ? text(args, 'baseHash', 'baseHash — the page hash readPage (or getSiteContext) returned')
    : optionalText(args, 'baseHash')
  return baseHash ? { baseHash, page } : {}
}

/** The base a site-wide tool names: the composite hash from getSiteContext. */
function siteBase(args: Args, required = false): AgentBase {
  const baseHash = required
    ? text(args, 'baseHash', 'baseHash — the site hash getSiteContext returned')
    : optionalText(args, 'baseHash')
  return baseHash ? { baseHash } : {}
}

/** What every write reports, beside its own fields. */
function landed(
  result: AgentLanded,
  page?: string,
): Record<string, unknown> {
  return {
    hash: result.hash,
    ...(page ? { pageHash: result.pageHashes[page] } : {}),
    changed: result.changed,
    ...(result.snapshot ? { snapshot: result.snapshot.file } : {}),
    ...(result.warning
      ? {
          textRemoved: `${result.warning} If the user did not ask for that much to go, call restoreRevision with file "${result.snapshot?.file ?? ''}" and redo the edit carrying the content forward.`,
        }
      : {}),
    note: 'Pass this hash as baseHash on the next write to the same scope (pageHash for that page, hash for the site).',
  }
}

export function getSiteContextHandler(context: SiteAgentToolContext): AgentToolHandlerResult {
  return {
    content: formatAgentToolJson({
      title: context.document.title,
      path: context.documentPath,
      hash: context.hash,
      target: context.document.manifest.target,
      brief: context.document.manifest.brief,
      selectedPage: context.selectedPage,
      // What "this" means right now. With pages ticked, a request about "these
      // pages" is about exactly these and not the one on screen.
      aim: context.pageSelection.length
        ? { scope: 'pages' as const, pages: context.pageSelection }
        : { scope: 'page' as const, page: context.selectedPage },
      pages: context.pages.map((page, index) => ({
        index,
        page: page.path,
        url: urlPathFor(page.path),
        title: page.title,
        hash: context.pageHashes[page.path],
        bytes: (context.document.pages[page.path] ?? '').length,
      })),
      navOrder: context.document.manifest.pages,
      stylesheetBytes: context.document.styles.length,
      files: context.material.map(item => ({
        // What to call it in a sentence, and what to write in the markup.
        // Say the name; copy the reference exactly rather than retyping it.
        called: nameOf(item),
        name: item.name,
        reference: item.reference,
        role: item.role ?? 'content',
        kind: item.kind,
        description: item.description,
      })),
      // Present only when someone has clicked an element in the preview. When
      // it is here, "this heading" means this and nothing else.
      selection: context.selection,
      // Whether the preview is the site that ships: verified, being checked
      // (the app hidden, fonts loading, a page not yet measured, an asset the
      // preview cannot show), or failed with what to fix.
      verification: {
        state: context.verification.state,
        reasons: context.verification.reasons,
      },
      revisions: context.revisions.length,
      published: context.document.manifest.published
        ? {
            service: context.document.manifest.published.service,
            url: context.document.manifest.published.url ?? null,
            note: 'Publishing is done by the person from the Publish dialog — there is no publish tool.',
          }
        : null,
      note: 'Every write takes baseHash: a page hash for page tools (with page), the site hash for writeStyles, movePage and the collection tools. A stale baseHash is refused — read again and redo the edit.',
    }),
  }
}

export function readPageHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const page = pageOf(context, args)
  return {
    content: formatAgentToolJson({
      page,
      url: urlPathFor(page),
      hash: context.pageHashes[page],
      siteHash: context.hash,
      html: context.document.pages[page],
      note: 'Pass hash as baseHash (with page) to writePage or an element tool on this page.',
    }),
  }
}

export function writePageHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const page = pageOf(context, args)
  const html = text(args, 'html', 'html')
  const result = context.writePage(page, html, pageBase(args, page, true))
  return { content: formatAgentToolJson({ page, bytes: html.length, ...landed(result, page) }) }
}

export function addPageHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const requested = text(args, 'path', 'path')
  const path = normalizePagePath(requested)
  if (!path) throw new AgentSiteToolError(`"${requested}" is not a usable page name`)
  if (context.document.pages[path]) {
    throw new AgentSiteToolError(`${path} already exists`)
  }
  const result = context.addPage(
    {
      path,
      title: optionalText(args, 'title'),
      html: optionalText(args, 'html'),
    },
    siteBase(args),
  )
  return {
    content: formatAgentToolJson({
      page: result.page,
      url: urlPathFor(result.page),
      ...landed(result, result.page),
    }),
  }
}

export function deletePageHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const page = pageOf(context, args)
  if (Object.keys(context.document.pages).length <= 1) {
    throw new AgentSiteToolError(
      'that is the only page — a site with none cannot be previewed or published',
    )
  }
  const result = context.deletePage(page, pageBase(args, page))
  return { content: formatAgentToolJson({ deleted: page, ...landed(result) }) }
}

export function movePageHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const from = number(args, 'from')
  const to = number(args, 'to')
  const result = context.movePage(from, to, siteBase(args))
  return { content: formatAgentToolJson({ moved: true, from, to, ...landed(result) }) }
}

export function setPageTitleHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const page = pageOf(context, args)
  const title = text(args, 'title', 'title')
  const result = context.setPageTitle(page, title, pageBase(args, page))
  return { content: formatAgentToolJson({ page, title, ...landed(result, page) }) }
}

export function setElementTextHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const page = pageOf(context, args)
  const path = text(args, 'path', 'path')
  const value = typeof args.text === 'string' ? args.text : ''
  const result = context.setElementText(page, path, value, pageBase(args, page))
  return { content: formatAgentToolJson({ page, path, text: value, ...landed(result, page) }) }
}

export function setElementSrcHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const page = pageOf(context, args)
  const path = text(args, 'path', 'path')
  const src = text(args, 'src', 'src')
  const name = src.replace(/^.*assets\//, '')
  if (!context.material.some(item => item.name === name)) {
    throw new AgentSiteToolError(
      `no file called ${name} — the site has ${
        context.material.map(item => item.name).join(', ') || 'none'
      }`,
    )
  }
  const result = context.setElementSrc(page, path, `assets/${name}`, pageBase(args, page))
  return {
    content: formatAgentToolJson({ page, path, src: `assets/${name}`, ...landed(result, page) }),
  }
}

export function insertElementHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const page = pageOf(context, args)
  const markup = text(args, 'markup', 'markup')
  const result = context.insertElement(
    {
      page,
      markup,
      beforePath: optionalText(args, 'beforePath'),
      afterPath: optionalText(args, 'afterPath'),
    },
    pageBase(args, page),
  )
  return { content: formatAgentToolJson({ page, inserted: true, ...landed(result, page) }) }
}

export function deleteElementHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const page = pageOf(context, args)
  const path = text(args, 'path', 'path')
  const result = context.deleteElement(page, path, pageBase(args, page))
  return { content: formatAgentToolJson({ page, deleted: path, ...landed(result, page) }) }
}

export function readStylesHandler(context: SiteAgentToolContext): AgentToolHandlerResult {
  return {
    content: formatAgentToolJson({
      css: context.document.styles,
      hash: context.hash,
      note: 'Pass hash as baseHash to writeStyles.',
    }),
  }
}

export function writeStylesHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const css = text(args, 'css', 'css')
  const result = context.writeStyles(css, siteBase(args, true))
  return {
    content: formatAgentToolJson({
      bytes: css.length,
      pagesAffected: context.pages.length,
      ...landed(result),
    }),
  }
}

export function setAssetRoleHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const name = text(args, 'name', 'name')
  const role = text(args, 'role', 'role') as AssetRole
  if (!['content', 'reference', 'logo'].includes(role)) {
    throw new AgentSiteToolError('role must be content, reference or logo')
  }
  if (!context.material.some(item => item.name === name)) {
    throw new AgentSiteToolError(`no file called ${name}`)
  }
  context.setAssetRole(name, role)
  return { content: formatAgentToolJson({ name, role }) }
}

export function checkSiteHandler(context: SiteAgentToolContext): AgentToolHandlerResult {
  const findings = context.checkSite()
  return {
    content: formatAgentToolJson({
      ok: !hasBlockingFinding(findings),
      findings,
      verification: {
        state: context.verification.state,
        reasons: context.verification.reasons,
      },
    }),
  }
}

export async function saveSiteHandler(
  context: SiteAgentToolContext,
): Promise<AgentToolHandlerResult> {
  const path = await context.saveSite()
  return { content: formatAgentToolJson({ artifactPaths: [path] }) }
}

export async function buildSiteHandler(
  context: SiteAgentToolContext,
): Promise<AgentToolHandlerResult> {
  if (!context.documentPath) {
    throw new AgentSiteToolError('save the site first, so there is a package to build into')
  }
  let result
  try {
    result = await context.buildSite()
  } catch (error) {
    if (error instanceof SiteExportRefused) {
      throw new AgentSiteToolError(
        `${error.message} Call checkSite for the findings, fix them, and build again. Publishing itself is done by the person from the Publish dialog.`,
      )
    }
    throw error
  }
  return {
    content: formatAgentToolJson({
      pages: result.pages,
      assets: result.assets,
      unusedAssets: result.unusedAssets,
      totalBytes: result.totalBytes,
      files: result.files,
      buildPath: result.buildPath,
      artifactPaths: [result.buildPath],
      note: 'build/ is written. Publishing is the person\'s step, from the Publish dialog — there is no publish tool.',
    }),
  }
}

export function listCollectionsHandler(
  context: SiteAgentToolContext,
): AgentToolHandlerResult {
  const provider = dataProviderFor(context.serviceId)
  return {
    content: formatAgentToolJson({
      collections: context.document.collections,
      hash: context.hash,
      // Said here rather than discovered at publish time: on here.now an
      // anonymous site answers 403 until it is claimed.
      storage: provider
        ? { host: provider.id, requiresAccount: provider.requiresAccount, note: provider.accountNote }
        : { host: null, note: 'The chosen host does not store records.' },
    }),
  }
}

export function setCollectionHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const name = text(args, 'name', 'name')
  const rawFields = Array.isArray(args.fields) ? args.fields : []
  if (!rawFields.length) {
    throw new AgentSiteToolError('a collection needs at least one field')
  }

  const fields: CollectionField[] = rawFields.map(raw => {
    const field = raw as Record<string, unknown>
    const type = String(field.type ?? 'string')
    if (!(FIELD_TYPES as readonly string[]).includes(type)) {
      throw new AgentSiteToolError(
        `"${type}" is not a field type — use one of ${FIELD_TYPES.join(', ')}`,
      )
    }
    return {
      name: String(field.name ?? ''),
      type: type as FieldType,
      ...(field.required ? { required: true } : {}),
      ...(typeof field.maxLength === 'number' ? { maxLength: field.maxLength } : {}),
      ...(typeof field.minimum === 'number' ? { minimum: field.minimum } : {}),
      ...(typeof field.maximum === 'number' ? { maximum: field.maximum } : {}),
      ...(field.trim ? { trim: true } : {}),
    }
  })

  const asked = (args.access ?? {}) as Partial<Record<string, AccessLevel>>
  const collection: Collection = {
    name,
    fields,
    access: { ...defaultAccess(), ...asked } as Collection['access'],
    ...(typeof args.rateLimit === 'string' ? { rateLimit: args.rateLimit } : {}),
  }

  // Refused here rather than by the host at the end of an upload.
  const problems = checkCollections([collection]).filter(
    finding => finding.severity === 'error',
  )
  if (problems.length) {
    throw new AgentSiteToolError(
      problems.map(problem => `${problem.message} — ${problem.fix}`).join('; '),
    )
  }

  const result = context.setCollection(collection, siteBase(args))
  return {
    content: formatAgentToolJson({
      collection: collection.name,
      fields: collection.fields.map(field => field.name),
      access: collection.access,
      ...landed(result),
    }),
  }
}

export function deleteCollectionHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const name = text(args, 'name', 'name')
  if (!context.document.collections.some(collection => collection.name === name)) {
    throw new AgentSiteToolError(`no collection called ${name}`)
  }
  const result = context.deleteCollection(name, siteBase(args))
  return {
    content: formatAgentToolJson({
      deleted: name,
      note: 'Records already held by the host are not removed by this.',
      ...landed(result),
    }),
  }
}

export function addFormForCollectionHandler(
  context: SiteAgentToolContext,
  args: Args,
): AgentToolHandlerResult {
  const page = pageOf(context, args)
  const name = text(args, 'collection', 'collection')
  const collection = context.document.collections.find(item => item.name === name)
  if (!collection) {
    throw new AgentSiteToolError(
      `no collection called ${name} — create it first with setCollection`,
    )
  }
  if (collection.access.insert !== 'public') {
    throw new AgentSiteToolError(
      `${name} does not accept public inserts, so a form on the page could not submit to it`,
    )
  }
  const result = context.addFormForCollection(
    {
      collection: name,
      page,
      beforePath: optionalText(args, 'beforePath'),
      afterPath: optionalText(args, 'afterPath'),
    },
    pageBase(args, page),
  )
  return {
    content: formatAgentToolJson({ page, collection: name, added: true, ...landed(result, page) }),
  }
}

export function listRevisionsHandler(context: SiteAgentToolContext): AgentToolHandlerResult {
  const now = Date.now()
  return {
    content: formatAgentToolJson({
      revisions: context.revisions.map(entry => ({
        file: entry.file,
        at: entry.at,
        reason: entry.reason,
        ...(entry.scope ? { scope: entry.scope } : {}),
        label: revisionLabel(entry, now),
        textChars: entry.textChars,
        byteSize: entry.byteSize,
      })),
      note: context.revisions.length
        ? 'Each entry is the WHOLE site as it was before the change its reason names, newest first. restoreRevision puts one back (the current site is snapshotted first, so a restore is itself undoable). Where the site is published is never part of a snapshot.'
        : 'No snapshots yet — one is taken before every ask, agent write, import and restore.',
    }),
  }
}

export async function restoreRevisionHandler(
  context: SiteAgentToolContext,
  args: Args,
): Promise<AgentToolHandlerResult> {
  const file = optionalText(args, 'file')
  if (!file) {
    throw new AgentSiteToolError(
      'file is required — call listRevisions and pass one of the file names it reports',
    )
  }
  const result = await context.restoreRevision(file)
  if ('error' in result) throw new AgentSiteToolError(result.error)
  return {
    content: formatAgentToolJson({
      restored: result.restored.file,
      label: revisionLabel(result.restored, Date.now()),
      note: 'The site is now that snapshot; the version it replaced was snapshotted first. Call getSiteContext for the new hashes before writing.',
    }),
  }
}

/**
 * The site as its links draw it: what exists, what the writing promises and
 * nobody has built, and what nothing points at.
 *
 * This is the same graph the map and the board read, so a request about "the
 * pages that are still promised" means exactly what the person sees.
 */
export function getSiteMapHandler(context: SiteAgentToolContext): AgentToolHandlerResult {
  const graph = linkGraph(context.document)
  const home = context.document.manifest.pages[0] ?? 'index.html'
  return {
    content: formatAgentToolJson({
      home,
      pages: graph.pages.map(page => {
        const around = linksForPage(graph, page)
        return {
          page,
          url: urlPathFor(page),
          linksTo: around.out.map(link => link.target),
          linkedFrom: [...new Set(around.in.map(link => link.fromPage))],
          promises: around.promises.map(link => link.target),
        }
      }),
      // A link pointing at a page nobody built. It is not an error: the build
      // keeps the words and drops the anchor, so a reader never lands on
      // nothing. Build it from `brief`, which is only what the site says.
      promised: graph.promised.map(promise => ({
        page: promise.path,
        url: urlPathFor(promise.path),
        suggestedTitle: promise.title,
        inSiteHeader: promise.inNav,
        promisedBy: promise.promises.map(link => ({
          page: link.fromPage,
          text: link.text,
          href: link.href,
        })),
        brief: promiseBrief(context.document, promise),
      })),
      // Pages that exist and nothing links to. Sometimes deliberate (a page
      // shared by address alone), so it is reported, never fixed silently.
      orphans: graph.orphans.map(page => ({ page, url: urlPathFor(page) })),
    }),
  }
}

/** Export drafts for review without invoking publish/build verification. */
export async function exportPageHandler(context: SiteAgentToolContext, args: Args): Promise<AgentToolHandlerResult> {
  if (args.format !== 'pdf' && args.format !== 'png') throw new AgentSiteToolError('format must be pdf or png')
  const page = optionalText(args, 'page') ?? context.selectedPage
  if (!Object.hasOwn(context.document.pages, page)) throw new AgentSiteToolError('Unknown page. Call getSiteContext first.')
  const width = args.width
  if (width !== undefined && (typeof width !== 'number' || !Number.isInteger(width) || width < 320 || width > 3840)) {
    throw new AgentSiteToolError('width must be an integer from 320 to 3840 CSS pixels')
  }
  const result = await context.exportPage({ format: args.format, page, ...(typeof width === 'number' ? { width } : {}) })
  return { content: formatAgentToolJson(result) }
}
