# Bridge Type Reference

<!-- GENERATED FILE — do not edit. Regenerate with:
     node packages/create-app/scripts/generate-bridge-types-doc.mjs -->

Every request and result type the platform bridge exposes, verbatim from the
bridge package source. The package ships TypeScript sources, not compiled
declarations: there are no `.d.ts` files to find, and the runtime copy of
this file lives at
`node_modules/@puredesktop/puredesktop-ui-bridge/src/bridge/types.ts`.

```ts
export type PlatformBridgeEventName =
  import('./events.mjs').PlatformBridgeEventName

import type { PlatformThemeMode } from '../theme/tokens.js'
import type { PlatformAppContextManifest } from '../context/contextConfig.js'

/** Shell prefs exposed via `settings.prefs.get` / `settings.prefs.set`. */
export type PlatformThemePreference = PlatformThemeMode

export interface PlatformShellPreferences {
  workingDirectory: string
  theme: PlatformThemePreference
  appSettings?: Record<string, Record<string, unknown>>
  /** Required local user profile collected before first app use. */
  userProfile?: {
    name: string
    email: string
    completedAt: string
    updatedAt: string
    serverSyncedAt?: string
  }
  /** Local agent models enabled in the shell model menu. */
  enabledLocalLlmModelIds?: string[]
  /** Low / high agent model tiers from shell settings. */
  agentModelTiers?: {
    lowLevelModelId: string
    highLevelModelId: string
  }
  /** Defaults for new agent sessions per scope. */
  /** Explicit opt-in switches for unfinished capabilities. */
  betaFeatures?: {
    /** Enables model-backed Pure Render reference-image extraction in app panels. */
    pureRenderVisionExtraction?: boolean
    /** Enables unfinished claim/fact-check review entry points. */
    factCheck?: boolean
    /** Enables the unfinished Manuscript More launcher menu. */
    manuscriptMoreMenu?: boolean
  }
  /**
   * Host-only workspace tab session (phase 4). Plugin apps should ignore this field.
   */
  platformWorkspace?: Record<string, unknown>
}

export interface PlatformAppSettingsUpdateRequest {
  appSlug: string
  patch: Record<string, unknown>
}

export interface PlatformThemeBridgePayload {
  mode: PlatformThemeMode
  /** Active surface palette id, omitted when platform default. */
  surfacePaletteId?: string | null
  css: string
}

export type PlatformFileKind =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'code'
  | 'html'
  | 'markdown'
  | 'spreadsheet'
  | 'data'
  | 'text'
  | 'other'

/** Mirrors `PlatformAppManifest` from the shell contracts. */
export interface PlatformAppManifest {
  id: string
  slug: string
  name: string
  navigationLabel?: string
  productName: string
  kind: string
  description: string
  /** Declarative context-file config for this app's package objects. */
  context?: PlatformAppContextManifest
  peopleProviders?: Array<{
    id: string
    label: string
    storage: {
      fileName: string
      contactPaths: Array<{
        path: string
        nameField?: string
        emailField?: string
      }>
    }
  }>
  icon?: string
  source?: 'builtin' | 'plugin'
  pluginId?: string
  pluginRoot?: string
}

export interface PlatformPeopleSuggestRequest {
  query: string
  limit?: number
}

export interface PlatformPeopleSuggestion {
  name: string
  email?: string
  sourceAppSlug: string
  sourceLabel: string
  providerId: string
}

/** Mirrors `PlatformShellManifest` from the shell contracts. */
export interface PlatformShellManifest {
  apps: PlatformAppManifest[]
}

/**
 * Binds one plugin iframe to a shell workspace tab (phase 4+).
 * `resource` is the document/file this tab owns; `null` for app-only tabs.
 */
export interface PlatformBridgeViewportBinding {
  tabId: string
  resource: ResourceOpenEvent | null
}

export interface PlatformBridgeReadyMeta {
  version: number
  pluginId: string
  appSlug: string
  methods: string[]
  theme?: PlatformThemeBridgePayload
  /** Per-tab open intent — apps should prefer this over global consume queues. */
  viewport?: PlatformBridgeViewportBinding
}

export interface ResourceOpenEvent {
  path: string
  name?: string
  kind?: PlatformFileKind
  sourceAppSlug?: string
}

export type RenderProgressPhase =
  | 'loading'
  | 'paginating'
  | 'printing'
  | 'done'
  | 'error'

export interface RenderProgress {
  phase: RenderProgressPhase
  pct?: number
  message?: string
  outputPath?: string
  hint?: string
  sourcePath?: string
}

export interface RenderPrintHtmlRequest {
  htmlPath: string
  outputPath: string
  basePath?: string
  pageSize?: string
  margins?: string
  loadingMessage?: string
}

export interface RenderPagedPreviewRequest {
  htmlPath: string
  basePath?: string
  loadingMessage?: string
}

export interface RenderPagedSnapshotRequest {
  htmlPath: string
  outputPath: string
  basePath?: string
  page?: number
  loadingMessage?: string
}

export interface RenderPagedSnapshotResult {
  imagePath: string
  page: number
  pageCount: number
  metrics?: RenderPagedSnapshotMetrics
}

export interface RenderPagedSnapshotMetrics {
  topGapRatio: number
  bottomGapRatio: number
  usedHeightRatio: number
  pageCount?: number
  problemPage?: number
  figurePage?: number
  imagePage?: number
  captionPage?: number
  headingPage?: number
  blankBeforeFigurePx?: number
  blankBeforeFigureRatio?: number
  blankPageCount?: number
  imageVisible?: boolean
  captionVisible?: boolean
  captionOrphaned?: boolean
  strandedHeading?: boolean | null
  /** Blocks on the target page that collide with each other. */
  overlappingBlocks?: number
  /** Blocks escaping the page content box. */
  overflowingBlocks?: number
}

export interface RenderPagedPreviewResult {
  htmlPath: string
  html: string
  pageCount: number
}

/** Built-in trade-book page sizes (`render.getPrintStylesheet`). */
export type PrintPageSize = 'A4' | 'A5' | '6x9'

export type FileWatchChangeType = 'add' | 'change' | 'unlink'

export interface FileWatchChange {
  path: string
  relativePath: string
  type: FileWatchChangeType
}

/** Plugin bridge `watch.change` payload. */
export interface WatchChangeEvent extends FileWatchChange {
  rootPath: string
}

/**
 * Result of `catalog.consumePendingOpen` — open intent for **this viewport tab only**.
 * Prefer `PlatformBridgeReadyMeta.viewport.resource` on boot when available.
 */
export interface PlatformCatalogConsumePendingOpenResult {
  resource: ResourceOpenEvent | null
}

export interface PlatformPluginInstallRequest {
  path: string
}

export interface PlatformPluginInstallSummary {
  id: string
  name: string
  rootDir: string
}

export interface PlatformPluginInstallResult {
  installed: boolean
  sourcePath: string
  targetPath: string
  plugin: PlatformPluginInstallSummary
}

/** Minimal manifest fields for install / create gating in plugin apps. */
export interface PlatformAppInstallState {
  pluginRoot?: string
}

export interface PlatformFileReadPreviewResult {
  path: string
  content: string | null
  truncated: boolean
  encoding: 'utf-8'
}

export interface PlatformFileEntry {
  path: string
  name: string
  extension: string
  kind: PlatformFileKind
  mimeType: string
  byteLength: number
  modifiedAt: string
  isDirectory: boolean
}

export interface PlatformFileListResult {
  rootPath: string
  parentPath: string | null
  entries: PlatformFileEntry[]
}

export interface PlatformFileReadBinaryResult {
  path: string
  mimeType: string
  base64: string
  truncated: boolean
  byteLength: number
}

export interface PlatformFilePreviewUrlResult {
  path: string
  url: string
  mimeType: string
  byteLength: number
}

export interface PlatformFileCreateFolderResult {
  path: string
}

export interface PlatformFileRenameResult {
  path: string
}

export interface PlatformFileWriteResult {
  ok: true
}

export interface PlatformFileDeleteResult {
  ok: true
}

/** Minimal file entry fields required for inline preview in plugin iframes. */
export interface PlatformFilePreviewEntry {
  path: string
  name: string
  extension: string
  kind: PlatformFileKind
  isDirectory: boolean
}

/** Collection asset index — shell `assets.*`; apps pass `collectionPath`. */
export type PlatformAssetKind =
  | 'image'
  | 'vector'
  | 'mermaid'
  | 'table'
  | 'math'
  | 'other'

export type PlatformAssetOrigin =
  | 'uploaded'
  | 'imported'
  | 'generated'
  | 'derived'

export type PlatformAssetSourceType =
  | 'file'
  | 'inline-mermaid'
  | 'inline-table'
  | 'inline-math'

export interface PlatformAssetUsage {
  documentPath: string
  title: string
}

export interface PlatformAssetSummary {
  id: string
  collectionPath: string
  relativePath: string
  absolutePath: string
  fileName: string
  label: string
  caption?: string
  description?: string
  kind: PlatformAssetKind
  mimeType: string
  byteLength: number
  modifiedAt: string
  usedIn: PlatformAssetUsage[]
  lineageId: string
  versionNumber: number
  parentRelativePath?: string
  origin?: PlatformAssetOrigin
  transformationPrompt?: string
  createdBy?: string
  sourceType?: PlatformAssetSourceType
  sourceCode?: string
  sourceDocumentPath?: string
  sourceAppSlug?: string
  sourceNodeId?: string
}

export interface PlatformAssetContext {
  asset: PlatformAssetSummary
  versions: PlatformAssetSummary[]
  isLatestVersion: boolean
  latestVersionRelativePath: string
  totalVersions: number
}

export interface PlatformAssetListScopedRequest {
  collectionPath: string
  /** Relative paths under `collectionPath` — supplied by the active app. */
  documentFiles: string[]
}

export interface PlatformAssetDeleteRequest {
  collectionPath: string
  relativePath: string
}

export interface PlatformAssetUpdateRequest {
  collectionPath: string
  relativePath: string
  label?: string
  caption?: string
  description?: string
  sourceDocumentPath?: string
  sourceAppSlug?: string
}

export interface PlatformAssetSourceUpdateRequest
  extends PlatformAssetUpdateRequest {
  assetId: string
  kind: 'mermaid' | 'table' | 'math'
  sourceCode: string
}

export interface PlatformAssetSourceUpdateScopedRequest
  extends PlatformAssetSourceUpdateRequest {
  /** Relative paths under `collectionPath` — supplied by the active app. */
  documentFiles: string[]
}

export interface PlatformAssetSelection {
  collectionPath: string
  relativePath: string
}

export interface PlatformAssetVersionCreateRequest {
  collectionPath: string
  sourceRelativePath: string
  sourcePath: string
  label?: string
  caption?: string
  description?: string
  transformationPrompt?: string
  createdBy?: string
}

export interface PlatformAssetReferenceSwapRequest {
  collectionPath: string
  fromRelativePath: string
  toRelativePath: string
  scope: 'document' | 'collection'
  documentFile?: string
}

export interface PlatformAssetReferenceSwapScopedRequest
  extends PlatformAssetReferenceSwapRequest {
  /** Relative paths under `collectionPath` — supplied by the active app. */
  documentFiles: string[]
}

export interface PlatformAssetReferenceSwapResult {
  updatedDocuments: number
  updatedReferences: number
}

export interface PlatformAssetTransformRequest {
  collectionPath?: string
  sourceRelativePath?: string
  prompt: string
  label?: string
  createdBy?: string
}

export interface PlatformAssetGetContextRequest {
  collectionPath: string
  relativePath: string
}

export type PlatformBridgeEventHandler = (payload: unknown) => void

export interface PlatformBridgeClient {
  waitForReady(): Promise<PlatformBridgeReadyMeta>
  call<T = unknown>(method: string, args?: unknown[]): Promise<T>
  onEvent(
    name: PlatformBridgeEventName | string,
    handler: PlatformBridgeEventHandler,
  ): () => void
  offEvent(
    name: PlatformBridgeEventName | string,
    handler: PlatformBridgeEventHandler,
  ): void
  getMethods(): string[]
  ping(): Promise<unknown>
}
```
