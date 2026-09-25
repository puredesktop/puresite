/**
 * What the drawer agent can do, and the app state it does it to.
 *
 * Every tool here has a control beside it in the app: the agent and the person
 * are changing one thing, not two views of it. Nothing in this file knows how
 * to reach a model — these are the app's own callbacks, handed over so a tool
 * cannot bypass the document lifecycle and leave the package and the screen
 * disagreeing.
 *
 * Every mutator lands through the site's one door. It takes the hash the
 * agent read (the site's, or — for a page tool — that page's) and returns
 * what landed: the new hashes, and the snapshot that was taken first.
 */
import type { RevisionEntry } from '@purescience/platform-ui/editing/revisionHistory'
import type { AssetRole } from '../lib/assetNotes'
import type { BuildResult, CheckFinding } from '../lib/buildSite'
import type { MaterialItem } from '../lib/material'
import type { SiteDocument, SitePage } from '../lib/siteDocument'
import type { Collection } from '../lib/siteData'
import type { SiteVerification } from '../lib/siteVerification'

export const PURESITE_AGENT_TOOLS = [
  'getSiteContext',
  'getSiteMap',
  'prepareSite',
  'getDrawerRequest',
  'cancelDrawerRequest',
  'commitDrawerRequest',
  'readPage',
  'writePage',
  'addPage',
  'deletePage',
  'movePage',
  'setPageTitle',
  'setElementText',
  'setElementSrc',
  'insertElement',
  'deleteElement',
  'readStyles',
  'writeStyles',
  'setAssetRole',
  'checkSite',
  'saveSite',
  'buildSite',
  'exportPage',
  'listCollections',
  'setCollection',
  'deleteCollection',
  'addFormForCollection',
  'listRevisions',
  'restoreRevision',
] as const

export const PURESITE_AGENT_LOG_LABEL = '[puresite:agent]'

/** A tool asked for something the site cannot do — said plainly, not thrown raw. */
export class AgentSiteToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentSiteToolError'
  }
}

export interface SiteSelection {
  page: string
  path: string
  label: string
}

/** What the agent read, so the door can check it: the site's hash, or a page's. */
export interface AgentBase {
  baseHash?: string
  /** Set when `baseHash` is the hash of this page rather than the site's. */
  page?: string
}

/** What a landed edit reports back. */
export interface AgentLanded {
  hash: string
  pageHashes: Record<string, string>
  changed: boolean
  /** The text-loss warning, when the edit dropped a large share of the visible text. */
  warning: string | null
  /** The snapshot taken before this edit landed — what restoreRevision would put back. */
  snapshot: RevisionEntry | null
}

export interface SiteAgentToolContext {
  exportPage: (input: { format: 'pdf' | 'png'; page?: string; width?: number }) => Promise<unknown>

  prepareSite: (args: Record<string, unknown>) => Promise<unknown>
  cancelDrawerRequest: (args: Record<string, unknown>) => Promise<unknown>
  getDrawerRequest: () => Promise<unknown>
  commitDrawerRequest: (args: Record<string, unknown>) => Promise<unknown>
  document: SiteDocument
  /** The composite site hash — pass it as baseHash to site-wide writes. */
  hash: string
  /** Each page's own hash — pass one as baseHash (with page) to a page write. */
  pageHashes: Record<string, string>
  verification: SiteVerification
  revisions: RevisionEntry[]
  documentPath: string | null
  pages: SitePage[]
  material: MaterialItem[]
  selection: SiteSelection | null
  selectedPage: string
  /** Pages the person has ticked. Empty means just `selectedPage`. */
  pageSelection: string[]

  writePage: (page: string, html: string, base: AgentBase) => AgentLanded
  addPage: (
    input: { path: string; title?: string; html?: string },
    base: AgentBase,
  ) => AgentLanded & { page: string }
  deletePage: (page: string, base: AgentBase) => AgentLanded
  movePage: (from: number, to: number, base: AgentBase) => AgentLanded
  setPageTitle: (page: string, title: string, base: AgentBase) => AgentLanded
  setElementText: (
    page: string,
    path: string,
    text: string,
    base: AgentBase,
  ) => AgentLanded
  setElementSrc: (
    page: string,
    path: string,
    src: string,
    base: AgentBase,
  ) => AgentLanded
  insertElement: (
    input: {
      page: string
      markup: string
      beforePath?: string
      afterPath?: string
    },
    base: AgentBase,
  ) => AgentLanded
  deleteElement: (page: string, path: string, base: AgentBase) => AgentLanded
  writeStyles: (css: string, base: AgentBase) => AgentLanded
  setAssetRole: (name: string, role: AssetRole) => void
  setCollection: (collection: Collection, base: AgentBase) => AgentLanded
  deleteCollection: (name: string, base: AgentBase) => AgentLanded
  addFormForCollection: (
    input: {
      collection: string
      page: string
      beforePath?: string
      afterPath?: string
    },
    base: AgentBase,
  ) => AgentLanded
  restoreRevision: (
    file: string,
  ) => Promise<{ restored: RevisionEntry } | { error: string }>
  /** The host this site publishes to, for provider-specific detail. */
  serviceId: string
  checkSite: () => CheckFinding[]
  saveSite: () => Promise<string>
  buildSite: () => Promise<BuildResult & { buildPath: string }>
}
