import { useVideoDrop, useImageDrop } from '@purescience/platform-ui/bridge/react/useVideoDrop'
import { imageTransferMarkup } from '@purescience/platform-ui/bridge/imageTransfer'
import { videoEmbedMarkup } from '@purescience/platform-ui/bridge/videoTransfer'
import { reviewHtml, reviewFilename } from './lib/reviewExport'
import { chooseReviewExportPath, renderReviewPage, chooseSiteFolder, registerSiteFolder } from './bridge/platformBridge'
import type { PreviewViewport } from './lib/previewViewport'
/**
 * PureSite: build a static website as real files, preview it as it will ship,
 * and publish it.
 *
 * The whole site lives in memory as a page map and one stylesheet; the
 * lifecycle writes that back out as a `.site` package. Nothing here knows how
 * to reach a host — the build is handed to the drawer agent, which uses
 * whichever deploy tool is configured.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveJson } from '@purescience/platform-ui/editing/live/useLiveJson'
import {
  compositionFor,
  recoverableSite,
  digest,
  requestSession,
  descriptionState,
  assertDescriptionScope,
  type DrawerRequest,
} from './lib/drawerRequest'
import { messages, sessions, vision } from '@purescience/platform-ui/bridge/assistants'
import {
  updateCurrentWorkspaceTab,
  toggleAgentDrawer,
} from '@purescience/platform-ui/bridge/workspace'
import { manifestWithoutPublished } from './lib/siteHash'
import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { EmptyState } from '@purescience/platform-ui/components/common/feedback/EmptyState'
import { InlineBanner } from '@purescience/platform-ui/components/common/feedback/InlineBanner'
import { usePlatformBridge } from '@purescience/platform-ui/bridge/react/usePlatformBridge'
import { usePlatformViewportResource } from '@purescience/platform-ui/bridge/react/usePlatformViewportResource'
import { useDocumentLifecycle } from '@purescience/platform-ui/bridge/react/useDocumentLifecycle'
import {
  DocumentHeaderActions,
  DocumentSwitcher,
} from '@purescience/platform-ui/components/common/documents'
import { SiteBoardView } from './components/SiteBoardView'
import { NewSiteWizard } from './components/NewSiteWizard'
import { PublishDialog, type PublishState } from './components/PublishDialog'
import { usePureSiteAgentTools } from './hooks/usePureSiteAgentTools'
import { useCompactInRoom } from './hooks/useCompactInRoom'
import { Button } from '@purescience/platform-ui/components/common/buttons/Button'
import {
  AUTOSAVE_DELAY_MS,
  DEFAULT_HOME_PAGE,
  DEFAULT_SITE_TITLE,
  DEFAULT_VIEWPORT,
  SITE_ASSETS_DIR,
  SITE_BUILD_DIR,
  SITE_MANIFEST_FILE,
  SITE_PACKAGE_SUFFIX,
  SITE_PAGES_DIR,
  SITE_STYLESHEET,
  SITE_APP_SLUG,
  VIEWPORTS,
  type ViewportId,
} from './constants'
import {
  createDefaultSiteDocument,
  isDefaultSiteTitle,
  isUntouchedStarter,
  orderedPages,
  parseSiteManifest,
  serializeSiteManifest,
  type PublishedRecord,
  setPageTitle as applyPageTitle,
  titleFromPage,
  type SiteDocument,
  type TargetProfile,
  urlPathFor,
} from './lib/siteDocument'
import {
  add404Page as add404PageTo,
  addPage as addPageTo,
  deleteElement as deleteElementIn,
  deletePage as deletePageFrom,
  duplicateElement as duplicateElementIn,
  duplicatePage as duplicatePageIn,
  insertElement as insertElementIn,
  isSafePagePath,
  moveElement as moveElementIn,
  movePage as movePageIn,
  normalizePagePath,
  renamePagePath as renamePagePathIn,
  sanitizeEditedOuterHtml,
  setElementAlt as setElementAltIn,
  setElementLayout as setElementLayoutIn,
  setElementLink as setElementLinkIn,
  setElementSrc as setElementSrcIn,
  replaceElement as replaceElementIn,
  setElementText as setElementTextIn,
  updatePageHead as updatePageHeadIn,
  validateSafeSvgBase64,
  writePage as writePageIn,
  linkElement,
  type PageHeadMeta,
} from './lib/pages'
import { insertSectionIntoPage, sectionById } from './lib/sectionLibrary'
import { withDesignTokens, type DesignTokens } from './lib/designTokens'
import { createSiteFromTemplate, SITE_TEMPLATES } from './lib/siteTemplates'
import {
  deinlineMarkup,
  internalLinks,
  oversizeAssets,
  previewDocument,
  referencedAssets,
} from './lib/preview'
import { checkSite, type BuildResult } from './lib/buildSite'
import { repointAsset, repointAssetInStyles } from './lib/assetNames'
import { usePublicationAssets } from './hooks/usePublicationAssets'
import { linkGraph, repointPromise, unlinkPromise } from './lib/siteLinks'
import { effectiveSiteAddress, prepareCheckedSite, runSiteBuild, sendSiteOutput, type SiteOutputInput } from './lib/siteOutput'
import {
  checkCollections,
  dataProviderFor,
  formSnippetFor,
  type Collection,
} from './lib/siteData'
import { siteDesignGuide, type ReferenceImage } from './lib/draftSite'
import { listAssetFiles, mapConcurrent, readSitePackage, serializeSitePackage, validateCollectionsList } from './lib/packageIO'
import { siteFontFiles } from './lib/siteFoundation'
import { withBrandBlock } from './lib/brandStyles'
import {
  brandChipLabel,
  brandLine,
  effectiveLook,
  isBrandAsset,
  keepBrandBlock,
  wantsHouseStyle,
  withoutBrandBlock,
  type SiteBrand,
} from './lib/siteBrand'
import { applyBrand, proposeSiteBrand, proposeSiteSamples } from './agents/brandTools'
import { BrandSheet } from './components/BrandSheet'
import { collectLayout, type LayoutRead } from './lib/responsiveCheck'
import { measurePage, readPageOutline } from './lib/hiddenMeasure'
import { SITE_FONT_URLS } from './fonts/siteFonts'
import {
  DEFAULT_SERVICE_ID,
  loadPublishServices,
  type PublishService,
} from './lib/publishServices'
import { PublishCancelled } from './lib/publish'
import { mergeMaterial, notesFrom, type MaterialItem } from './lib/material'
import type { AssetNote, AssetRole } from './lib/assetNotes'
import {
  AgentSiteToolError,
  type AgentBase,
  type AgentLanded,
  type SiteAgentToolContext,
  type SiteSelection,
} from './agents/catalog'
import {
  bridge,
  createFolder,
  deleteFileQuietly,
  openExternalUrl,
  openPath,
  listFiles,
  readBinaryBase64,
  readBinaryDataUrl,
  readTextFile,
  recordOperation,
  revealPath,
  writeBinaryFile,
  writeTextFile,
  brandsOffered,
  defaultBrand,
  onBrandsChanged,
  type BrandDetail,
} from './bridge/platformBridge'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import {
  EMPTY_REVISION_INDEX,
  createRevisionHistory,
  ensureExportable,
  preservationWarning,
  renderFingerprint,
  revisionLabel,
  revisionsNewestFirst,
  snapshotPolicy,
  type EditOrigin,
  type HistoryFs,
  type RevisionEntry,
  type RevisionIndex,
} from '@purescience/platform-ui/editing'
import {
  admitSiteEdit,
  documentFromSnapshot,
  documentOfSnapshot,
  serializeSiteSnapshot,
  siteTextChars,
  snapshotTextChars,
  type SiteEditOutcome,
  type SiteEditRequest,
} from './lib/siteDoor'
import { pageHash, siteHash } from './lib/siteHash'
import {
  exportRefusalMessage,
  pageRenderHash,
  SiteExportRefused,
  verifySite,
  type PageEvidence,
  type SiteVerification,
} from './lib/siteVerification'

// The revision store's view of the bridge: the four verbs the kit needs.
const historyFs: HistoryFs = {
  read: readTextFile,
  write: writeTextFile,
  remove: deleteFileQuietly,
  list: async dir => {
    const listing = (await listFiles(dir)) as {
      entries?: { name?: string; isDirectory?: boolean }[]
    }
    return (listing?.entries ?? [])
      .filter(entry => typeof entry?.name === 'string' && !entry.isDirectory)
      .map(entry => entry.name as string)
  },
  mkdir: async dir => {
    const at = dir.lastIndexOf('/')
    try {
      await createFolder(dir.slice(0, at), dir.slice(at + 1))
    } catch {
      // Already there.
    }
  },
}

/** Bump when the preview's rendering changes shape; every measurement re-derives. */
const PREVIEW_ENGINE = 'puresite-preview-2'

function viewportFor(id: ViewportId): (typeof VIEWPORTS)[number] {
  return VIEWPORTS.find(item => item.id === id) ?? VIEWPORTS[2]
}

/**
 * The conditions a page was measured under: the stage's viewport. Fonts are
 * each page's own — a frame's font set says nothing about another page's —
 * so the fonts half is left empty and `fontsStatus` carries the loading rule.
 */
function fingerprintFor(box: { width: number; height: number }): string {
  return renderFingerprint({
    surface: { kind: 'viewport', width: box.width, height: box.height },
    fonts: '',
    engine: PREVIEW_ENGINE,
  })
}

/** What goes through the door, beside the kit's own request. */
type SiteLanding = SiteEditRequest & {
  /** What the snapshot records as having replaced the previous state. */
  reason?: string
  scope?: string
  /** The words asked for, so the text-loss warning knows whether deletion was wanted. */
  request?: string
}

type SiteLanded =
  | (Extract<SiteEditOutcome, { ok: true }> & {
      snapshot: RevisionEntry | null
      warning: string | null
    })
  | Extract<SiteEditOutcome, { ok: false }>

export function App(): React.ReactElement {
  const standaloneDev =
    import.meta.env.DEV &&
    import.meta.env.MODE !== 'test' &&
    typeof window !== 'undefined' &&
    window.parent === window
  const { error: bridgeError, ready, meta } = usePlatformBridge()
  const effectiveReady = standaloneDev || ready
  const effectiveBridgeError = standaloneDev ? null : bridgeError
  const drawerRequestRef = useRef<DrawerRequest | null>(null)
  const drawerCommitBusy = useRef(false)
  const { resource, clearResource } = usePlatformViewportResource(ready, meta)

  const compact = useCompactInRoom()
  const compactFrame = compact ? { 'data-compact-room': '' } : undefined

  const [document, setDocument] = useState<SiteDocument>(
    standaloneDev ? () => createSiteFromTemplate('studio-agency') : createDefaultSiteDocument,
  )
  const documentRef = useRef(document)
  const [documentPath, setDocumentPath] = useState<string | null>(null)
  const [documentStarted, setDocumentStarted] = useState(standaloneDev)
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)
  const openGeneration = useRef(0)
  const materialGeneration = useRef(0)
  const [selectedPage, setSelectedPage] = useState(DEFAULT_HOME_PAGE)
  const [selection, setSelection] = useState<SiteSelection | null>(null)
  // Pages the next request applies to. Empty means the one on screen.
  const [pageSelection, setPageSelection] = useState<string[]>([])
  const [viewport, setViewport] = useState<ViewportId>(DEFAULT_VIEWPORT)
  const [previewSize, setPreviewSize] = useState<PreviewViewport>(
    viewportFor(DEFAULT_VIEWPORT),
  )
  const previewBox =
    previewSize.id === viewport ? previewSize : viewportFor(viewport)
  const previewBoxRef = useRef(previewBox)
  previewBoxRef.current = previewBox
  const onPreviewViewport = useCallback((next: PreviewViewport) => {
    setPreviewSize(current =>
      current.id === next.id &&
      current.width === next.width &&
      current.height === next.height
        ? current
        : next,
    )
  }, [])

  const [material, setMaterial] = useState<MaterialItem[]>([])
  const [publicationAssetRevision, setPublicationAssetRevision] = useState(0)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [revisions, setRevisions] =
    useState<RevisionIndex>(EMPTY_REVISION_INDEX)
  const [undoOffer, setUndoOffer] = useState<RevisionEntry | null>(null)
  // What each page was measured to be, by the measuring frame.
  const [evidence, setEvidence] = useState<Record<string, PageEvidence>>({})
  const evidenceRef = useRef(evidence)
  evidenceRef.current = evidence
  // The site hash of documentRef.current — kept beside it by the door.
  const hashRef = useRef('')
  if (!hashRef.current) hashRef.current = siteHash(document)
  const previewsRef = useRef(previews)
  previewsRef.current = previews
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  // A build writes hundreds of files into the open package; while it runs,
  // and for a moment after, the watcher's echoes are our own footsteps.
  const buildingRef = useRef(false)
  // Internal package writes (review snapshots, drawer-request.json, site fonts,
  // asset deletes) must not trigger a full-site reload via onExternalChange.
  // A trailing quiet window absorbs delayed filesystem watcher echoes.
  const internalWriteCountRef = useRef(0)
  const internalWriteUntilRef = useRef(0)
  const withInternalWrite = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    internalWriteCountRef.current += 1
    try {
      return await fn()
    } finally {
      internalWriteCountRef.current = Math.max(0, internalWriteCountRef.current - 1)
      internalWriteUntilRef.current = Math.max(internalWriteUntilRef.current, Date.now() + 1000)
    }
  }, [])

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardBusy, setWizardBusy] = useState<string | null>(null)
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [describing, setDescribing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportBusy = useRef(false)
  const exportStaticBusyRef = useRef(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [cloudShareOpen, setCloudShareOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  /** The organisation's house style for this person; null with no organisation (or an older shell). */
  const [houseStyle, setHouseStyle] = useState<BrandDetail | null>(null)
  const [brandOpen, setBrandOpen] = useState(false)
  // In-memory manual undo/redo stack (kept per open site, never touches manifest.published).
  const undoStackRef = useRef<SiteDocument[]>([])
  const redoStackRef = useRef<SiteDocument[]>([])
  const undoRedoPlayingRef = useRef(false)
  const [undoCounts, setUndoCounts] = useState({ undo: 0, redo: 0 })
  const syncUndoCounts = useCallback(() => {
    setUndoCounts({ undo: undoStackRef.current.length, redo: redoStackRef.current.length })
  }, [])
  const clearManualUndo = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    setUndoCounts({ undo: 0, redo: 0 })
  }, [])
  /** The agent tools' context, for the app's own brand actions — one code path with the tools. */
  const agentContextRef = useRef<SiteAgentToolContext | null>(null)
  const [publish, setPublish] = useState<PublishState>({
    phase: 'idle',
    message: '',
  })
  const [services, setServices] = useState<PublishService[]>([])
  const servicesRef = useRef(services)
  servicesRef.current = services
  const [allTools, setAllTools] = useState<PublishService[]>([])
  const [serviceId, setServiceId] = useState(DEFAULT_SERVICE_ID)
  const serviceIdRef = useRef(serviceId)
  serviceIdRef.current = serviceId
  /**
   * Tools the person has told us publish.
   *
   * Kept in the site's manifest rather than app settings, because which host
   * a site goes to belongs to the site.
   */
  const chosenTools = document.manifest.publishTools ?? []
  // A site remembers where it was published, so the second publish is an
  // update of the same URL rather than a new site every time — across
  // sessions too: the record is written into the manifest after a publish and
  // read back into this ref when the package is opened.
  const publishedRef = useRef<{
    service: string
    slug: string
    claimToken?: string
  } | null>(null)
  // Flipping this stops the upload at the next between-files check.
  const publishCancelRef = useRef(false)

  useEffect(() => {
    if (!ready) return
    void loadPublishServices(chosenTools).then(({ services: found, all }) => {
      setServices(found)
      setAllTools(all)
      if (!found.some(service => service.id === serviceId) && found[0]) {
        setServiceId(found[0].id)
      }
    })
  }, [ready, serviceId, chosenTools.join('|')])

  const materialRef = useRef(material)
  materialRef.current = material
  const boundPathRef = useRef<string | null>(null)
  /**
   * The document that BELONGS to the bound path.
   *
   * Not the same thing as the document on screen. Opening site B while the
   * lifecycle is still bound to site A means a flush would write B's content
   * into A's folder — which is exactly how a real site's home page was
   * replaced by a starter page. Serialize reads this, and it only changes
   * when the binding does.
   */
  const boundDocumentRef = useRef<SiteDocument>(document)
  const draftRunRef = useRef(0)
  const openSitePathRef = useRef<((path: string) => Promise<void>) | null>(null)
  const refreshAssetEvidenceRef = useRef<((path: string) => void) | null>(null)
  const assetChangeDuringBuildRef = useRef<string | null>(null)

  const lifecycle = useDocumentLifecycle({
    appSlug: SITE_APP_SLUG,
    suffix: SITE_PACKAGE_SUFFIX,
    kind: 'package',
    suggestedTitle: document.title,
    debounceMs: AUTOSAVE_DELAY_MS,
    onExternalChange: ({ path, dirty }: { path: string; dirty: boolean }) => {
      // runBuild answers this once, when its own writes are done.
      if (buildingRef.current) {
        assetChangeDuringBuildRef.current = path
        return
      }
      if (internalWriteCountRef.current > 0 || Date.now() < internalWriteUntilRef.current) return
      // Asset bytes can change without a filename/size change, even while text
      // edits are dirty. Refresh comparison without replacing those edits.
      setPublicationAssetRevision(revision => revision + 1)
      if (openingRef.current) return
      if (dirty) {
        refreshAssetEvidenceRef.current?.(path)
        return
      }
      void openSitePathRef.current?.(path)
    },
    /**
     * The package on disk.
     *
     * Every page is its own file under `pages/`, the stylesheet is its own
     * file, and `site.json` carries the order and the roles. This is the
     * whole reason the app holds a page map rather than one document: what
     * gets written is a normal static site, and a person can open the folder
     * and read it.
     */
    serialize: () => {
      const current = boundDocumentRef.current
      return serializeSitePackage(current, materialRef.current)
    },
  })
  const lifecycleRef = useRef(lifecycle)
  lifecycleRef.current = lifecycle

  /** Collaborative live payload: strips manifest.published (including one-time claimToken) so secrets never leak to peers. */
  const livePayload = useCallback(
    (doc: SiteDocument, items: MaterialItem[] = materialRef.current): Record<string, unknown> =>
      JSON.parse(
        JSON.stringify({
          ...doc,
          manifest: {
            ...manifestWithoutPublished(doc.manifest),
            assets: notesFrom(items),
          },
        }),
      ) as Record<string, unknown>,
    [],
  )

  // A site the organisation shares, edited live (useLiveJson): everyone's pages merged page by page; the live copy
  // writes the site's files, so this tab stops saving them itself while live.
  const liveSitePath = lifecycle.doc.path ? `${lifecycle.doc.path}/site.json` : null
  const liveSite = useLiveJson(liveSitePath, {
    loadSaved: async () => livePayload(documentRef.current, materialRef.current),
    onRemote: next => {
      if (!next || typeof next !== 'object' || Array.isArray(next)) return
      const candidate = next as Partial<SiteDocument>
      if (
        !candidate.pages ||
        typeof candidate.pages !== 'object' ||
        Array.isArray(candidate.pages) ||
        typeof candidate.styles !== 'string'
      ) {
        return
      }
      const safePages = Object.fromEntries(
        Object.entries(candidate.pages).filter(
          (entry): entry is [string, string] =>
            isSafePagePath(entry[0]) && typeof entry[1] === 'string',
        ),
      )
      if (!Object.keys(safePages).length) return
      const localPublished = documentRef.current.manifest.published
      const remoteManifest = parseSiteManifest(JSON.stringify(candidate.manifest ?? {}))
      const validatedCollections =
        candidate.collections === undefined
          ? documentRef.current.collections
          : validateCollectionsList(candidate.collections) ?? documentRef.current.collections
      const doc: SiteDocument = {
        title: typeof candidate.title === 'string' ? candidate.title : remoteManifest.title,
        pages: safePages,
        styles: candidate.styles,
        manifest: {
          ...manifestWithoutPublished(remoteManifest),
          ...(localPublished ? { published: localPublished } : {}),
        },
        collections: validatedCollections,
      }
      clearManualUndo()
      setDocument(doc)
      documentRef.current = doc
      boundDocumentRef.current = doc
      hashRef.current = siteHash(doc)
      if (Array.isArray(doc.manifest.assets)) {
        const synced = mergeMaterial(
          materialRef.current.map(item => ({ name: item.name, bytes: item.bytes })),
          doc.manifest.assets,
        )
        materialRef.current = synced
        setMaterial(synced)
      }
    },
    serialize: () => {
      const root = lifecycle.doc.path
      return root ? { resourcePath: root, files: serializeSitePackage(boundDocumentRef.current, materialRef.current).filter(file => !file.name.endsWith('/.keep')).map(file => ({ name: file.name, content: String(file.content) })) } : null
    },
    // Let go by the live copy: the site on screen is saved as it always was, so a page edited just before is kept.
    onEnded: () => lifecycleRef.current.markDirty(),
  })
  const liveSiteRef = useRef(liveSite)
  liveSiteRef.current = liveSite

  /**
   * Revision history: the whole site as one JSON per snapshot, in the
   * package's history/. The kit's store owns the index, the in-flight
   * copies and the queued writes; the app supplies the package (created on
   * first need) and a quiet window so its own history writes never read as
   * external changes. Where the site is published is never in a snapshot.
   */
  const [history] = useState(() =>
    createRevisionHistory<SiteDocument>({
      fs: historyFs,
      packagePath: async () =>
        boundPathRef.current ??
        (await lifecycleRef.current.ensureDraft().catch(() => null)),
      serialize: serializeSiteSnapshot,
      parse: documentOfSnapshot,
      extension: '.json',
      textChars: snapshotTextChars,
    }),
  )
  useEffect(() => history.subscribe(setRevisions), [history])

  /**
   * THE door. Every change to the site lands here and nowhere else: the
   * board's own edits, the agent's tools, the ask box, the wizard's draft, a
   * restore. The kit admits or refuses the edit against the current hash
   * (page-scoped when the request names a page), the snapshot policy says
   * whether the state being replaced goes into history first, and only
   * then does the document change hands.
   */
  const landEdit = useCallback(
    (request: SiteLanding): SiteLanded => {
      const previous = documentRef.current
      if (openingRef.current) return { ok: false, reason: 'stale', currentHash: hashRef.current,
        message: 'The site is opening. Wait for it to finish before editing.' }
      if (
        request.origin === 'agent' &&
        drawerRequestRef.current?.status === 'prepared' &&
        drawerRequestRef.current.path === boundPathRef.current
      )
        return {
          ok: false,
          reason: 'stale',
          currentHash: hashRef.current,
          message: 'Use commitDrawerRequest for the saved request.',
        }
      const outcome = admitSiteEdit(request, {
        content: previous,
        hash: hashRef.current,
      })
      if (!outcome.ok) return outcome
      let snapshot: RevisionEntry | null = null
      let warning: string | null = null
      if (outcome.changed) {
        if (
          request.origin === 'manual' &&
          !undoRedoPlayingRef.current &&
          outcome.content.manifest.published === previous.manifest.published
        ) {
          undoStackRef.current = [...undoStackRef.current.slice(-49), previous]
          redoStackRef.current = []
          syncUndoCounts()
        } else if (request.origin !== 'manual') {
          clearManualUndo()
        }
        const policy = snapshotPolicy(request.origin, history.armed, true)
        history.armed = policy.armed
        if (policy.snapshot === 'before-revision') {
          snapshot = history.record(
            previous,
            request.reason ?? request.origin,
            request.scope,
          )
          if (request.request !== undefined) {
            warning = preservationWarning(
              siteTextChars(previous),
              siteTextChars(outcome.content),
              request.request,
            )
          }
        } else if (policy.snapshot === 'first-manual-after-revision') {
          history.record(previous, 'manual-edit')
        }
      }
      setDocument(outcome.content)
      documentRef.current = outcome.content
      // An edit is to the bound document by definition: this is the site
      // that is open, and it is the one being saved.
      boundDocumentRef.current = outcome.content
      hashRef.current = outcome.hash
      // Live: the change goes to everyone, and the live copy writes the site when it is time.
      if (liveSiteRef.current.status === 'on') liveSiteRef.current.write(livePayload(outcome.content))
      else lifecycleRef.current.markDirty()
      return { ...outcome, snapshot, warning }
    },
    [clearManualUndo, history, livePayload, syncUndoCounts],
  )

  /** A hand edit: a transform of the live document, through the door. */
  const applyDocument = useCallback(
    (
      transform: (current: SiteDocument) => SiteDocument,
      origin: EditOrigin = 'manual',
    ): SiteLanded => landEdit({ next: transform, origin }),
    [landEdit],
  )

  const undoManual = useCallback((): void => {
    const previous = undoStackRef.current[undoStackRef.current.length - 1]
    if (!previous) return
    const current = documentRef.current
    undoRedoPlayingRef.current = true
    try {
      const restored: SiteDocument = {
        ...previous,
        manifest: {
          ...manifestWithoutPublished(previous.manifest),
          ...(current.manifest.published ? { published: current.manifest.published } : {}),
        },
      }
      const landed = landEdit({ next: restored, origin: 'manual' })
      if (!landed.ok) {
        setStatus(landed.message)
        return
      }
      undoStackRef.current.pop()
      redoStackRef.current = [...redoStackRef.current.slice(-49), current]
      setStatus('Undid last change.')
    } finally {
      undoRedoPlayingRef.current = false
      syncUndoCounts()
    }
  }, [landEdit, syncUndoCounts])

  const redoManual = useCallback((): void => {
    const nextDoc = redoStackRef.current[redoStackRef.current.length - 1]
    if (!nextDoc) return
    const current = documentRef.current
    undoRedoPlayingRef.current = true
    try {
      const restored: SiteDocument = {
        ...nextDoc,
        manifest: {
          ...manifestWithoutPublished(nextDoc.manifest),
          ...(current.manifest.published ? { published: current.manifest.published } : {}),
        },
      }
      const landed = landEdit({ next: restored, origin: 'manual' })
      if (!landed.ok) {
        setStatus(landed.message)
        return
      }
      redoStackRef.current.pop()
      undoStackRef.current = [...undoStackRef.current.slice(-49), current]
      setStatus('Redid change.')
    } finally {
      undoRedoPlayingRef.current = false
      syncUndoCounts()
    }
  }, [landEdit, syncUndoCounts])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (publishOpen || wizardOpen || brandOpen || switcherOpen) return
      if (window.document.querySelector('[role="dialog"], [data-site-overlay]')) return
      const target = event.target as HTMLElement | null
      if (
        typeof target?.closest === 'function' &&
        target.closest('input, textarea, select, [contenteditable]')
      ) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        if (!undoStackRef.current.length) return
        event.preventDefault()
        undoManual()
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.metaKey)) {
        if (!redoStackRef.current.length) return
        event.preventDefault()
        redoManual()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [publishOpen, wizardOpen, brandOpen, switcherOpen, undoManual, redoManual])

  const restoreRevision = useCallback(
    async (
      file: string,
    ): Promise<{ restored: RevisionEntry } | { error: string }> => {
      // The kit reads the target first; the door then snapshots the current
      // site (reason `restore`) before the target lands — so a restore is
      // itself undoable, and the cap cannot evict what is being restored.
      let read: Awaited<ReturnType<typeof history.restore>>
      try {
        read = await history.restore(file)
      } catch (readError) {
        return {
          error:
            readError instanceof Error ? readError.message : String(readError),
        }
      }
      if ('error' in read) return read
      const next = documentFromSnapshot(read.content, documentRef.current)
      const landed = landEdit({
        next,
        origin: 'restore',
        reason: 'restore',
        label: `Restored the version from ${revisionLabel(
          read.target,
          Date.now(),
        )}.`,
      })
      if (!landed.ok) return { error: landed.message }
      setUndoOffer(null)
      setStatus(
        `Restored the version from ${revisionLabel(read.target, Date.now())}.`,
      )
      return { restored: read.target }
    },
    [history, landEdit],
  )

  const undoRevision = useCallback((): void => {
    const offer = undoOffer
    if (!offer) return
    setUndoOffer(null)
    void restoreRevision(offer.file).then(result => {
      if ('error' in result) setStatus(result.error)
    })
  }, [restoreRevision, undoOffer])

  const pages = useMemo(() => orderedPages(document), [document])

  const linksByPage = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const [path, html] of Object.entries(document.pages)) {
      map[path] = internalLinks(html, path)
    }
    return map
  }, [document.pages])

  const publicationAssets = usePublicationAssets(document, boundPathRef.current, material, publicationAssetRevision)
  const assetNames = useMemo(() => material.map(item => item.name), [material])

  const findings = useMemo(
    () => [
      ...checkSite({ ...document, manifest: { ...document.manifest, assets: notesFrom(material) } }, assetNames, linksByPage),
      // A manifest the host refuses fails the whole publish, so its rules are
      // checked beside every other thing that will be wrong once it is live.
      ...checkCollections(document.collections).map(finding => ({
        ...finding,
        code: `data:${finding.code}`,
      })),
    ],
    [document, material, assetNames, linksByPage],
  )

  // A page that stops existing must not stay selected, or the stage renders
  // nothing and every rail control acts on a page that is gone.
  useEffect(() => {
    if (!document.pages[selectedPage]) {
      setSelectedPage(pages[0]?.path ?? DEFAULT_HOME_PAGE)
      setSelection(null)
    }
    setPageSelection(current =>
      current.every(page => document.pages[page])
        ? current
        : current.filter(page => document.pages[page]),
    )
  }, [document.pages, pages, selectedPage])

  const loadMaterial = useCallback(
    async (path: string, notes: AssetNote[] = notesFrom(materialRef.current)) => {
      const generation = ++materialGeneration.current
      const current = () => generation === materialGeneration.current && boundPathRef.current === path
      try {
        const files = await listAssetFiles(path, listFiles)
        if (!current()) return
        const merged = mergeMaterial(files, notes)
        materialRef.current = merged
        setMaterial(merged)
        previewsRef.current = {}
        setPreviews({})
        const loaded = await mapConcurrent(merged.filter(item => item.kind === 'image' || item.kind === 'font'), async item => {
          if (!current()) return null
          const dataUrl = await readBinaryDataUrl(`${path}/${SITE_ASSETS_DIR}/${item.name}`, 12 * 1024 * 1024).catch(() => null)
          return dataUrl ? [item.name, dataUrl] as const : null
        })
        if (!current()) return
        const assets = Object.fromEntries(loaded.filter((entry): entry is readonly [string, string] => entry !== null))
        previewsRef.current = assets
        setPreviews(assets)
      } catch {
        if (!current()) return
        setStatus('The asset folder could not be read. Saved asset notes have been kept.')
      }
    },
    [],
  )

  /**
   * Read a whole package back off disk.
   *
   * The folder is the truth: pages are discovered by walking `pages/`, so a
   * page added by hand or by another tool appears, and one deleted by hand
   * stops being listed. `site.json` supplies only the order and the roles.
   */
  const openSitePath = useCallback(
    async (root: string): Promise<void> => {
      const generation = ++openGeneration.current
      materialGeneration.current++
      openingRef.current = true
      setOpening(true)
      setError(null)
      setStatus('Opening…')
      try {
        const switching = boundPathRef.current !== root
        if (switching) {
          // Save the old document and its asset notes before replacing any refs.
          await lifecycleRef.current.flush({ throwOnError: true })
          await history.flush()
        }
        if (generation !== openGeneration.current) return
        const base = documentRef.current
        const next = await readSitePackage(root, { read: readTextFile, list: listFiles })
        if (generation !== openGeneration.current) return
        // A tool/edit that landed during an external refresh wins over that read.
        if (!switching && documentRef.current !== base) return
        let savedRequest: DrawerRequest | null = null
        try {
          const saved = JSON.parse(await readTextFile(`${root}/drawer-request.json`)) as DrawerRequest
          if (saved.path === root || saved.outputHash === siteHash(next)) {
            saved.path = root
            savedRequest = saved
          }
        } catch { /* Older packages have no saved drawer request. */ }
        if (generation !== openGeneration.current) return
        await history.load(root)
        if (generation !== openGeneration.current) return
        // Clear cached font-write records for this root so externally deleted fonts are restored on next save/build.
        for (const key of Array.from(fontsWritten.current)) {
          if (key.startsWith(`${root}/`)) fontsWritten.current.delete(key)
        }
        clearManualUndo()
        setWizardError(null)
        const manifest = next.manifest
        boundPathRef.current = root
        lifecycleRef.current.adopt(root, { title: next.title })
        namedOnceRef.current = false
        drawerRequestRef.current = savedRequest
        materialRef.current = mergeMaterial(manifest.assets.map(note => ({ name: note.name })), manifest.assets)
        previewsRef.current = {}
        setMaterial(materialRef.current)
        setPreviews({})
        setPageSelection([])
        setWizardOpen(false)
        setDocument(next)
        documentRef.current = next
        boundDocumentRef.current = next
        hashRef.current = siteHash(next)
        evidenceRef.current = {}
        setEvidence({})
        setUndoOffer(null)
        setDocumentPath(root)
        setDocumentStarted(true)
        // Where this site already lives, restored from the manifest — the
        // claim token in particular exists nowhere else once the publish
        // dialog has closed.
        publishedRef.current = manifest.published
          ? {
              service: manifest.published.service,
              slug: manifest.published.slug,
              ...(manifest.published.claimToken
                ? { claimToken: manifest.published.claimToken }
                : {}),
            }
          : null
        if (manifest.published) setServiceId(manifest.published.service)
        setSelectedPage(orderedPages(next)[0]?.path ?? DEFAULT_HOME_PAGE)
        setSelection(null)
        void loadMaterial(root, manifest.assets)

        // An untouched starter that already carries a brief or files is a
        // wizard that never finished — a hung draft, a crash, a reload. Put
        // it back up with everything filled in rather than stranding someone
        // at a starter page with no way back to Create.
        if (
          isUntouchedStarter(next) &&
          (manifest.brief.trim() || manifest.assets.length)
        ) {
          setWizardOpen(true)
        }
        setStatus(`Opened ${manifest.title}`)
      } catch (openError) {
        if (generation !== openGeneration.current) return
        setError(
          `Could not open the site: ${openError instanceof Error ? openError.message : String(openError)}`,
        )
        setStatus('The site was not opened.')
      } finally {
        if (generation === openGeneration.current) { openingRef.current = false; setOpening(false) }
      }
    },
    [clearManualUndo, history, loadMaterial],
  )
  openSitePathRef.current = openSitePath

  const chooseSiteFromSystem = useCallback(async (): Promise<void> => {
    try {
      const selected = await chooseSiteFolder()
      if (!selected) return
      const path = selected.replace(/\/+$/, '')
      if (!path.toLowerCase().endsWith(SITE_PACKAGE_SUFFIX)) {
        throw new Error('Choose a .site folder to open a site.')
      }
      await registerSiteFolder(path)
      setSwitcherOpen(false)
      await openSitePath(path)
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : String(pickError))
    }
  }, [openSitePath])

  useEffect(() => {
    if (!resource?.path) return
    void openSitePath(resource.path)
    clearResource()
  }, [resource, openSitePath, clearResource])

  /**
   * A card in the switcher, which is the site's own home page.
   *
   * Rendered through the same preview path the board uses, so a thumbnail
   * cannot show something the site does not. Assets are inlined because the
   * switcher's frame is sandboxed exactly as the board's is.
   */
  const loadSitePreview = useCallback(
    async (item: {
      path: string
      kind: 'package' | 'file'
    }): Promise<{ kind: 'html'; html: string; title?: string } | null> => {
      if (item.kind !== 'package') return null
      try {
        const html = await readTextFile(
          `${item.path}/${SITE_PAGES_DIR}/${DEFAULT_HOME_PAGE}`,
        )
        const styles = await readTextFile(
          `${item.path}/${SITE_STYLESHEET}`,
        ).catch(() => '')

        // Only the images the home page actually uses, so a site with a
        // folder of photographs does not turn its card into megabytes.
        const names = [...new Set([...referencedAssets(html), ...referencedAssets(styles, SITE_STYLESHEET)])]
        const loaded = await mapConcurrent(names, async name => {
          const dataUrl = await readBinaryDataUrl(
            `${item.path}/${SITE_ASSETS_DIR}/${name}`,
            4 * 1024 * 1024,
          ).catch(() => null)
          return dataUrl ? [name, dataUrl] as const : null
        })
        const assets = Object.fromEntries(loaded.filter((entry): entry is readonly [string, string] => entry !== null))

        return {
          kind: 'html',
          html: previewDocument({ html, styles, assets }),
          title: titleFromPage(html) || undefined,
        }
      } catch {
        return null
      }
    },
    [],
  )

  /**
   * The drafted title names the folder ONCE.
   *
   * An untitled site adopts its own title the first time a real one exists —
   * with a numeric suffix when that name is taken — and the folder name is
   * then fixed. Later title edits do not move the file, because a site that
   * renamed itself on every keystroke would scatter folders behind you.
   */
  const namedOnceRef = useRef(false)
  useEffect(() => {
    if (namedOnceRef.current || opening) return
    const path = lifecycleRef.current.doc.path
    if (!path) return
    const fileName = path.split('/').pop() ?? ''
    if (!/^untitled/i.test(fileName)) {
      namedOnceRef.current = true
      return
    }
    const title = document.title?.trim()
    if (!title || isDefaultSiteTitle(title)) return
    namedOnceRef.current = true
    void (async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = attempt === 0 ? title : `${title} ${attempt + 1}`
        try {
          await lifecycleRef.current.rename(candidate)
          return
        } catch {
          // Name taken on disk — try the next suffix.
        }
      }
    })()
  }, [document.title, lifecycle.doc.path, opening])

  // A path the lifecycle changed under us (promote, rename) is the real one.
  useEffect(() => {
    const path = lifecycle.doc.path
    if (!openingRef.current && path && path !== boundPathRef.current) {
      boundPathRef.current = path
      setDocumentPath(path)
    }
  }, [lifecycle.doc.path])

  /**
   * A new site starts in the organisation's house style when nothing else was
   * given: the same path as useBrand, marked `house-style` so picking another
   * look in the wizard takes it off again. One defaultBrand() call, null with
   * no organisation; never over a brand, a brand block or a look already there.
   */
  const startInHouseStyle = useCallback(async (generation: number): Promise<void> => {
    let house: BrandDetail | null = null
    try {
      house = await defaultBrand()
    } catch {
      return
    }
    if (generation !== openGeneration.current) return
    setHouseStyle(house)
    const context = agentContextRef.current
    if (!house || !context || !boundPathRef.current) return
    if (!wantsHouseStyle(documentRef.current)) return
    try {
      await applyBrand(context, { system: house.system, path: house.path, detail: house }, 'house-style', {}, 'manual')
      setStatus(`New site, ${brandLine(documentRef.current.manifest.brand).replace(/^In/, 'in')}.`)
    } catch (error) {
      setStatus(`The house style could not be put on this site: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  const createNewSite = useCallback(async (): Promise<void> => {
    const generation = ++openGeneration.current
    materialGeneration.current++
    openingRef.current = true
    setOpening(true)
    try {
      await lifecycleRef.current.flush({ throwOnError: true })
      await history.flush()
      if (generation !== openGeneration.current) return
    } catch (saveError) {
      if (generation === openGeneration.current) {
        setError(String(saveError)); openingRef.current = false; setOpening(false)
      }
      return
    }
    namedOnceRef.current = false
    setSwitcherOpen(false)
    const next = createDefaultSiteDocument()
    setDocument(next)
    documentRef.current = next
    boundDocumentRef.current = next
    hashRef.current = siteHash(next)
    history.reset()
    clearManualUndo()
    setWizardError(null)
    setUndoOffer(null)
    evidenceRef.current = {}
    setEvidence({})
    setDocumentPath(null)
    boundPathRef.current = null
    lifecycleRef.current.reset()
    publishedRef.current = null
    setError(null)
    setDocumentStarted(true)
    materialRef.current = []
    previewsRef.current = {}
    setMaterial([])
    setPreviews({})
    setPageSelection([])
    setSelectedPage(DEFAULT_HOME_PAGE)
    setSelection(null)
    setWizardOpen(true)
    setStatus('New site.')
    try {
      const path = await lifecycleRef.current.ensureDraft()
      if (path && generation === openGeneration.current) {
        boundPathRef.current = path
        setDocumentPath(path)
      }
    } catch {
      // Standalone dev: keep the in-memory site.
    } finally {
      if (generation === openGeneration.current) { openingRef.current = false; setOpening(false) }
    }
    if (generation === openGeneration.current) await startInHouseStyle(generation)
  }, [clearManualUndo, history, startInHouseStyle])

  const cancelNewSite = useCallback((): void => {
    // Abandon the run: a draft that comes home to a different number throws
    // its result away rather than landing in whatever is open by then.
    draftRunRef.current += 1
    setWizardBusy(null)
    setWizardError(null)
    setWizardOpen(false)
  }, [])

  /**
   * Copy a file into the package's assets/ folder.
   *
   * The file is read as bytes and written into the package rather than
   * referenced where it sits: a site has to keep working when the original
   * moves, and what gets published is the package.
   */
  const addPackageAsset = useCallback(
    async (sourcePath: string): Promise<string> => {
      const root = boundPathRef.current
      if (!root) throw new Error('there is no site open')
      const fileName = sourcePath.split(/[\\/]/).pop()?.trim()
      if (
        !fileName ||
        fileName === '.' ||
        fileName === '..' ||
        /^\.+$/.test(fileName) ||
        fileName.includes('/') ||
        fileName.includes('\\') ||
        fileName.includes('\0')
      ) {
        throw new Error('the file needs a safe file name')
      }
      const binary = await readBinaryBase64(sourcePath)
      if (/\.svg$/i.test(fileName)) {
        validateSafeSvgBase64(binary.base64)
      }
      await withInternalWrite(async () => {
        try {
          await createFolder(root, SITE_ASSETS_DIR)
        } catch {
          /* already there */
        }
        await writeBinaryFile(
          `${root}/${SITE_ASSETS_DIR}/${fileName}`,
          binary.base64,
        )
      })
      return fileName
    },
    [withInternalWrite],
  )

  const addFilesFromDialog = useCallback(async (): Promise<void> => {
    const root = boundPathRef.current
    if (!root) {
      setStatus('Save the site first, so there is a package to add to.')
      return
    }
    try {
      // The default dialog offers text and documents, which is why no
      // screenshot ever appears in it. Site material is images and fonts.
      const result = (await bridge.call(
        PLATFORM_BRIDGE_METHODS.DIALOG_OPEN_FILE,
        [
          {
            title: 'Add to this site',
            filters: [
              {
                name: 'Images and fonts',
                extensions: [
                  'png',
                  'jpg',
                  'jpeg',
                  'gif',
                  'webp',
                  'avif',
                  'svg',
                  'ico',
                  'woff',
                  'woff2',
                  'ttf',
                  'otf',
                ],
              },
              { name: 'All files', extensions: ['*'] },
            ],
          },
        ],
      )) as { path?: string | null } | null
      const picked = result?.path
      if (!picked) return
      const fileName = await addPackageAsset(picked)
      await loadMaterial(root, notesFrom(materialRef.current))
      setStatus(`Added ${fileName}. Reference it as assets/${fileName}.`)
    } catch (addError) {
      setStatus(addError instanceof Error ? addError.message : String(addError))
    }
  }, [addPackageAsset, loadMaterial])

  const updateMaterial = useCallback(
    (updater: (items: MaterialItem[]) => MaterialItem[]) => {
      const next = updater(materialRef.current)
      materialRef.current = next
      setMaterial(next)
      if (liveSiteRef.current.status === 'on') {
        liveSiteRef.current.write(livePayload(documentRef.current, next))
      } else {
        lifecycleRef.current.markDirty()
      }
    },
    [livePayload],
  )

  const setAssetRole = useCallback(
    (name: string, role: AssetRole) => {
      updateMaterial(items =>
        items.map(item => (item.name === name ? { ...item, role } : item)),
      )
    },
    [updateMaterial],
  )

  /** A description typed by hand is the author's, not the model's. */
  const describeAsset = useCallback(
    (name: string, description: string) => {
      updateMaterial(items =>
        items.map(item =>
          item.name === name ? { ...item, description, described: false } : item,
        ),
      )
    },
    [updateMaterial],
  )

  /**
   * Give a file the short name it answers to.
   *
   * Only the note changes: pages keep the real path, so nothing that ships
   * moves and a name can be changed as often as it takes to get it right.
   */
  const renameAsset = useCallback(
    (file: string, called: string) => {
      const alias = called.trim()
      updateMaterial(items =>
        items.map(item => (item.name === file ? { ...item, alias } : item)),
      )
    },
    [updateMaterial],
  )

  const deleteAssets = useCallback(
    async (names: string[]): Promise<void> => {
      const root = boundPathRef.current
      if (!root || !names.length) return
      const safeNames = names.filter(
        name =>
          name &&
          !name.startsWith('/') &&
          !name.includes('..') &&
          !name.includes('\\') &&
          !name.includes('\0'),
      )
      if (!safeNames.length) return
      await withInternalWrite(async () => {
        for (const name of safeNames) {
          await deleteFileQuietly(`${root}/${SITE_ASSETS_DIR}/${name}`)
        }
      })
      const removeSet = new Set(safeNames)
      const remainingNotes = notesFrom(materialRef.current).filter(
        note => !removeSet.has(note.name),
      )
      await loadMaterial(root, remainingNotes)
      setPublicationAssetRevision(revision => revision + 1)
      if (liveSiteRef.current.status === 'on') {
        liveSiteRef.current.write(livePayload(documentRef.current, materialRef.current))
      } else {
        lifecycleRef.current.markDirty()
      }
      setStatus(
        safeNames.length === 1
          ? `Deleted assets/${safeNames[0]}.`
          : `Deleted ${safeNames.length} unused assets.`,
      )
    },
    [livePayload, loadMaterial, withInternalWrite],
  )

  /** Look at every undescribed image and write what it shows. */
  const describeAll = useCallback(async (): Promise<void> => {
    const path = boundPathRef.current
    if (!path) {
      setStatus('Save the site first, so there are files to look at.')
      return
    }
    const pending = materialRef.current.filter(
      item => item.kind === 'image' && !item.description.trim(),
    )
    if (!pending.length) return
    setDescribing(true)
    try {
      await prepareDrawerRequest(
        'describe',
        'Describe the supplied actual image pixels factually. If pixels cannot be viewed, report that limitation.',
        [],
        undefined,
        true,
      )
    } catch (describeError) {
      setStatus(
        describeError instanceof Error ? describeError.message : String(describeError),
      )
    } finally {
      setDescribing(false)
    }
  }, [])

  const readReferences = useCallback(async (): Promise<ReferenceImage[]> => {
    const path = boundPathRef.current
    if (!path) return []
    const references: ReferenceImage[] = []
    for (const item of materialRef.current) {
      if (item.kind !== 'image') continue
      try {
        const dataUrl = await readBinaryDataUrl(
          `${path}/${SITE_ASSETS_DIR}/${item.name}`,
          8 * 1024 * 1024,
        )
        const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
        if (match) {
          references.push({
            name: item.name,
            mimeType: match[1],
            data: match[2],
            role: item.role ?? 'content',
          })
        }
      } catch (error) {
        throw Error(`Cannot read image ${item.name}: ${String(error)}`)
      }
    }
    return references
  }, [])

  const draftFromBrief = useCallback(async (briefOverride?: string): Promise<number> => {
    await prepareDrawerRequest(
      'draft',
      briefOverride !== undefined ? briefOverride : documentRef.current.manifest.brief,
      [],
      undefined,
      true,
    )
    return 0
  }, [])

  async function prepareDrawerRequest(
    kind: DrawerRequest['kind'],
    prompt: string,
    pages: string[] = [],
    elementPath?: string,
    send = false,
  ) {
    if (drawerCommitBusy.current)
      throw Error('A drawer request is already being prepared or saved.')
    drawerCommitBusy.current = true
    let ownsLock = true
    try {
      const path =
        boundPathRef.current ?? (await lifecycleRef.current.ensureDraft())
      if (!path) throw Error('Save the site before asking the drawer.')
      if (!boundPathRef.current) {
        boundPathRef.current = path
        setDocumentPath(path)
      }
      await lifecycleRef.current.flush({ throwOnError: true })
      const refs = await readReferences()
      if (boundPathRef.current !== path)
        throw Error('Document switched before request preparation.')
      const current = documentRef.current
      const request: DrawerRequest = {
        id: crypto.randomUUID(),
        path,
        baseHash: hashRef.current,
        document: {
          ...current,
          manifest: manifestWithoutPublished(current.manifest),
        },
        kind,
        prompt,
        pages,
        elementPath,
        images: await Promise.all(
          refs.map(async r => ({ name: r.name, sha256: await digest(r.data) })),
        ),
        status: 'prepared',
        ...(kind === 'describe'
          ? { descriptionBase: descriptionState(materialRef.current) }
          : {}),
      }
      let previous: DrawerRequest | null = null
      try {
        previous = JSON.parse(await readTextFile(`${path}/drawer-request.json`))
      } catch {}
      await withInternalWrite(() =>
        writeTextFile(
          `${path}/drawer-request.json`,
          JSON.stringify(request),
        ),
      )
      drawerRequestRef.current = request
      if (send) {
        let sessionId = requestSession(previous, path, hashRef.current)
        if (sessionId && !(await sessions.get(sessionId))) sessionId = null
        if (!sessionId) {
          sessionId = (await sessions.create({ appId: SITE_APP_SLUG })).id
        }
        await updateCurrentWorkspaceTab({ sessionId })
        request.sessionId = sessionId
        await withInternalWrite(() =>
          writeTextFile(
            `${path}/drawer-request.json`,
            JSON.stringify(request),
          ),
        )
        await toggleAgentDrawer({ open: true })
        drawerCommitBusy.current = false
        ownsLock = false
        await messages.send(sessionId, {
          content: `Read getDrawerRequest for ${request.id} in ${path}. Complete this saved ${kind} request in this drawer using commitDrawerRequest. Then checkSite/buildSite as requested. Do not publish unless explicitly requested.`,
          attachments: refs.map(r => ({
            type: 'image' as const,
            mimeType: r.mimeType,
            name: r.name,
            source: {
              type: 'data' as const,
              encoding: 'base64' as const,
              data: r.data,
            },
          })),
        })
        setStatus('Request saved · continue in the drawer')
      }
      return {
        ...request,
        guide: siteDesignGuide(effectiveLook(current.manifest)),
        material: materialRef.current,
      }
    } finally {
      if (ownsLock) drawerCommitBusy.current = false
    }
  }
  async function getDrawerRequest() {
    const path = boundPathRef.current
    if (!path) throw Error('No site open.')
    const request = JSON.parse(
      await readTextFile(`${path}/drawer-request.json`),
    ) as DrawerRequest
    if (request.path !== path) {
      if (request.outputHash !== hashRef.current)
        throw Error('Request belongs to another site.')
      request.path = path
    }
    drawerRequestRef.current = request
    return {
      ...request,
      guide: siteDesignGuide(effectiveLook(documentRef.current.manifest)),
      material: materialRef.current,
    }
  }
  async function cancelDrawerRequest(args: Record<string, unknown>) {
    if (drawerCommitBusy.current)
      throw Error(
        'A save is in progress; wait for its result before cancelling.',
      )
    drawerCommitBusy.current = true
    try {
      const request = await getDrawerRequest()
      if (request.id !== args.requestId)
        throw Error('Request identity mismatch.')
      if (request.status === 'committed')
        return { persisted: true, alreadyCommitted: true }
      request.status = 'cancelled'
      await withInternalWrite(() =>
        writeTextFile(
          `${request.path}/drawer-request.json`,
          JSON.stringify(request),
        ),
      )
      drawerRequestRef.current = request
      return { cancelled: true, requestId: request.id }
    } finally {
      drawerCommitBusy.current = false
    }
  }
  async function commitDrawerRequest(args: Record<string, unknown>) {
    if (drawerCommitBusy.current) throw Error('A commit is being saved.')
    drawerCommitBusy.current = true
    try {
      const request = await getDrawerRequest()
      if (args.requestId !== request.id || args.baseHash !== request.baseHash)
        throw Error('Request or baseHash mismatch.')
      if (request.status === 'cancelled')
        throw Error('This request was cancelled. Prepare a new request.')
      if (request.status === 'committed')
        return { persisted: true, duplicate: true, hash: request.outputHash }
      const recovered =
        request.kind !== 'describe' && request.outputHash === hashRef.current
      const partial =
        !!request.proposal &&
        recoverableSite(request.document, request.proposal, documentRef.current)
      const commitBase = hashRef.current
      const check = () => {
        if (
          request.path !== boundPathRef.current ||
          (!recovered && !partial && request.baseHash !== hashRef.current)
        )
          throw Error('Site changed. Reconcile and prepare a new request.')
      }
      check()
      for (const image of request.images) {
        const data = await readBinaryDataUrl(
          `${request.path}/assets/${image.name}`,
          8 * 1024 * 1024,
        )
        if ((await digest(data.split(',')[1])) !== image.sha256)
          throw Error('Image changed. Prepare a new request.')
      }
      check()
      const expected = request.proposal ?? request.document
      for (const page of new Set([
        ...Object.keys(request.document.pages),
        ...Object.keys(expected.pages),
      ])) {
        let disk: string | undefined
        try {
          disk = await readTextFile(`${request.path}/${SITE_PAGES_DIR}/${page}`)
        } catch (error) {
          if (request.document.pages[page] !== undefined) throw error
        }
        if (
          disk !== request.document.pages[page] &&
          disk !== expected.pages[page]
        )
          throw Error(
            'Saved page changed outside this transaction. Reopen and reconcile.',
          )
      }
      const diskStyles = await readTextFile(
        `${request.path}/${SITE_STYLESHEET}`,
      )
      if (
        diskStyles !== request.document.styles &&
        diskStyles !== expected.styles
      )
        throw Error('Saved stylesheet changed outside this transaction.')
      check()
      if (request.kind === 'describe') {
        if (!Array.isArray(args.descriptions) || !args.descriptions.length)
          throw Error('Supply descriptions from actual image pixels.')
        for (const e of args.descriptions)
          if (
            !e ||
            typeof e.description !== 'string' ||
            !e.description.trim() ||
            !request.images.some(i => i.name === e.name)
          )
            throw Error('Invalid description.')
        const byName = new Map(
          args.descriptions.map(e => [e.name, e.description.trim()]),
        )
        const updated = materialRef.current.map(i =>
          byName.has(i.name)
            ? { ...i, description: byName.get(i.name)!, described: true }
            : i,
        )
        assertDescriptionScope(request, materialRef.current, updated)
        materialRef.current = updated
        setMaterial(updated)
        lifecycleRef.current.markDirty()
      } else if (!recovered) {
        const next = request.proposal
          ? {
              ...request.proposal,
              manifest: {
                ...request.proposal.manifest,
                published: documentRef.current.manifest.published,
              },
            }
          : compositionFor(request, args, documentRef.current)
        request.proposal = {
          ...next,
          manifest: manifestWithoutPublished(next.manifest),
        }
        request.outputHash = siteHash(next)
        await withInternalWrite(() =>
          writeTextFile(
            `${request.path}/drawer-request.json`,
            JSON.stringify(request),
          ),
        )
        check()
        const landed = landEdit({
          next,
          origin: 'ask',
          baseHash: commitBase,
          reason: 'drawer-request',
          request: request.prompt,
        })
        if (!landed.ok) throw Error(landed.message)
      }
      await lifecycleRef.current.flush({ throwOnError: true })
      if (boundPathRef.current !== request.path) {
        const moved = boundPathRef.current
        if (!moved || request.outputHash !== hashRef.current)
          throw Error('Document switched before save confirmation.')
        const receipt = JSON.parse(
          await readTextFile(`${moved}/drawer-request.json`),
        )
        if (receipt.id !== request.id)
          throw Error('The renamed package does not own this request.')
        request.path = moved
      }
      const current = documentRef.current
      for (const [page, html] of Object.entries(current.pages))
        if (
          (await readTextFile(`${request.path}/${SITE_PAGES_DIR}/${page}`)) !==
          html
        )
          throw Error('Page save not confirmed.')
      if (
        (await readTextFile(`${request.path}/${SITE_STYLESHEET}`)) !==
        current.styles
      )
        throw Error('Stylesheet save not confirmed.')
      request.status = 'committed'
      request.outputHash = hashRef.current
      await withInternalWrite(() =>
        writeTextFile(
          `${request.path}/drawer-request.json`,
          JSON.stringify(request),
        ),
      )
      drawerRequestRef.current = request
      return {
        persisted: true,
        hash: request.outputHash,
        complete: false,
        nextAction:
          'checkSite, then checkResponsive (390 and 768) and fix every finding, then exportPage png at 390 and look at it with view_image beside the reference; buildSite only after that. A saved draft is not a verified build or a published site.',
      }
    } finally {
      drawerCommitBusy.current = false
    }
  }

  // ---- verification ------------------------------------------------------
  // Is the preview the site that ships? File facts (a broken link, a
  // stylesheet linked from the wrong depth) fail it outright; render facts
  // come from the measuring frame, page by page, and are never trusted from
  // a hidden frame or before fonts arrive.
  const findingsFor = useCallback(
    (current: SiteDocument, assets: string[]) => [
      ...checkSite(
        { ...current, manifest: { ...current.manifest, assets: notesFrom(materialRef.current) } },
        assets,
        Object.fromEntries(
          Object.entries(current.pages).map(([path, html]) => [
            path,
            internalLinks(html, path),
          ]),
        ),
      ),
      ...checkCollections(current.collections).map(finding => ({
        ...finding,
        code: `data:${finding.code}`,
      })),
    ],
    [],
  )
  const verification = useMemo(
    () =>
      verifySite({
        document,
        findings,
        evidence,
        currentFingerprint: fingerprintFor(previewBox),
        viewportWidth: previewBox.width,
        oversize: Object.fromEntries(
          Object.entries(document.pages).map(([path, html]) => [
            path,
            oversizeAssets(html, previews, document.styles, path),
          ]),
        ),
      }),
    [document, evidence, findings, previews, previewBox],
  )
  const verificationRef = useRef(verification)
  verificationRef.current = verification
  /** The verdict right now, from the refs — for a guard that cannot wait for a render. */
  const verifyNow = useCallback((): SiteVerification => {
    const current = documentRef.current
    const assets = previewsRef.current
    return verifySite({
      document: current,
      findings: findingsFor(
        current,
        materialRef.current.map(item => item.name),
      ),
      evidence: evidenceRef.current,
      currentFingerprint: fingerprintFor(previewBoxRef.current),
      viewportWidth: previewBoxRef.current.width,
      oversize: Object.fromEntries(
        Object.entries(current.pages).map(([path, html]) => [
          path,
          oversizeAssets(html, assets, current.styles, path),
        ]),
      ),
    })
  }, [findingsFor])

  /**
   * Measure every page whose evidence is stale, in the kit's measuring
   * frame — on-screen but invisible, waited on for fonts — or, while
   * PureSite is hidden and its frames lay nothing out, in the shell's
   * measuring window at the same viewport. One run at a time; a change
   * during a run queues another.
   */
  const measureRunRef = useRef<Promise<void> | null>(null)
  const measureAgainRef = useRef(false)
  const assetRefreshRef = useRef<Promise<void> | null>(null)
  const measureSite = useCallback((): Promise<void> => {
    if (measureRunRef.current) {
      measureAgainRef.current = true
      return measureRunRef.current
    }
    const run = (async () => {
      do {
        measureAgainRef.current = false
        const current = documentRef.current
        const box = previewBoxRef.current
        const fingerprint = fingerprintFor(box)
        for (const page of Object.keys(current.pages)) {
          if (documentRef.current !== current) {
            measureAgainRef.current = true
            break
          }
          const renderHash = pageRenderHash(current, page)
          const have = evidenceRef.current[page]
          if (
            have &&
            have.measured &&
            have.fontsStatus !== 'loading' &&
            have.renderHash === renderHash &&
            have.fingerprint === fingerprint
          ) {
            continue
          }
          const srcdoc = previewDocument({
            html: current.pages[page] ?? '',
            styles: current.styles,
            assets: previewsRef.current,
            page,
          })
          const measured = await measurePage(
            srcdoc,
            { width: box.width, height: box.height, timeoutMs: 4000 },
            readPageOutline,
            null,
          )
          let next: PageEvidence = {
            page,
            measured: false,
            fontsStatus: 'loading',
            fingerprint,
            renderHash,
            overflowX: false,
            height: 0,
            at: Date.now(),
          }
          if (measured.ok) {
            next = {
              ...next,
              measured: true,
              ...measured.value,
              fontsStatus: measured.fontsLoaded
                ? measured.value.fontsStatus
                : 'loading',
            }
          }
          evidenceRef.current = { ...evidenceRef.current, [page]: next }
          setEvidence(evidenceRef.current)
        }
      } while (measureAgainRef.current)
    })()
    measureRunRef.current = run.finally(() => {
      measureRunRef.current = null
    })
    return measureRunRef.current
  }, [])

  /**
   * A page's evidence does not cover the bytes behind an asset path, so a
   * replacement on disk means measuring again from fresh previews. Checks wait
   * for this, and a measure already running saw the old picture.
   */
  refreshAssetEvidenceRef.current = (path: string): void => {
    if (boundPathRef.current !== path) return
    assetRefreshRef.current = (async () => {
      await loadMaterial(path)
      await measureRunRef.current?.catch(() => {})
      if (boundPathRef.current !== path) return
      evidenceRef.current = {}
      setEvidence({})
      void measureSite()
    })()
  }

  // Re-measure a moment after anything the render depends on changes, when
  // the app becomes visible again, and when a web font finishes loading.
  useEffect(() => {
    const timer = window.setTimeout(() => void measureSite(), 600)
    return () => window.clearTimeout(timer)
  }, [document, previews, previewBox, measureSite])
  useEffect(() => {
    const again = (): void => {
      if (window.document.visibilityState === 'visible') void measureSite()
    }
    window.document.addEventListener('visibilitychange', again)
    const fonts = (window.document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.addEventListener('loadingdone', again)
    return () => {
      window.document.removeEventListener('visibilitychange', again)
      fonts?.removeEventListener('loadingdone', again)
    }
  }, [measureSite])

  /**
   * The open faces the stylesheet names, written into the package's
   * assets/fonts/ (once per package and file), so the build, the review
   * exports and anyone opening the folder get the same type as the preview.
   */
  const fontsWritten = useRef(new Set<string>())
  const writeSiteFonts = useCallback(async (root: string): Promise<void> => {
    const wanted = siteFontFiles(documentRef.current.styles).filter(file => !fontsWritten.current.has(`${root}/${file}`))
    if (!wanted.length) return
    await withInternalWrite(async () => {
      for (const [parent, name] of [[root, SITE_ASSETS_DIR], [`${root}/${SITE_ASSETS_DIR}`, 'fonts']] as const) {
        try {
          await createFolder(parent, name)
        } catch {
          /* already there */
        }
      }
      for (const file of wanted) {
        const url = SITE_FONT_URLS[file]
        if (!url) continue
        await writeBinaryFile(`${root}/${SITE_ASSETS_DIR}/${file}`, url.replace(/^data:[^,]*,/, ''))
        fontsWritten.current.add(`${root}/${file}`)
      }
    })
  }, [withInternalWrite])

  const saveSite = useCallback(async (): Promise<string> => {
    const lifecycle = lifecycleRef.current
    const path = (await lifecycle.ensureDraft()) ?? boundPathRef.current
    if (!path) throw new Error('the site has no folder to save into')
    await lifecycle.flush({ throwOnError: true })
    await writeSiteFonts(path)
    boundPathRef.current = path
    setDocumentPath(path)
    return path
  }, [writeSiteFonts])

  const outputInput = useCallback((): SiteOutputInput => ({
    save: async () => {
      const root = boundPathRef.current
      if (!root) throw new Error('Save the site first, so there is a package to build into.')
      await lifecycleRef.current.flush({ throwOnError: true })
      if (boundPathRef.current !== root) throw new Error('The site changed while it was being saved. Check it again before building or publishing.')
      await writeSiteFonts(root)
    },
    readSnapshot: () => {
      const current = documentRef.current
      return {
        root: boundPathRef.current ?? '',
        document: { ...current, manifest: { ...current.manifest, assets: notesFrom(materialRef.current) } },
        availableAssets: materialRef.current.map(item => item.name),
        serviceId: serviceIdRef.current,
        address: effectiveSiteAddress(current, serviceIdRef.current, servicesRef.current.find(service => service.id === serviceIdRef.current)),
      }
    },
    verify: async () => {
      await assetRefreshRef.current
      const guard = await ensureExportable(() => verifyNow().state, measureSite)
      if (!guard.ok) throw new SiteExportRefused(exportRefusalMessage(guard, verifyNow()), verifyNow())
    },
  }), [measureSite, verifyNow, writeSiteFonts])

  const runBuild = useCallback(async (): Promise<BuildResult & { buildPath: string }> => {
    buildingRef.current = true
    try {
      return await runSiteBuild(outputInput())
    } finally {
      buildingRef.current = false
      setPublicationAssetRevision(revision => revision + 1)
      // Any of those changes may be a replaced picture, which the check made
      // before the build never saw. The next check waits for this.
      const changed = assetChangeDuringBuildRef.current
      assetChangeDuringBuildRef.current = null
      if (changed) refreshAssetEvidenceRef.current?.(changed)
    }
  }, [outputInput])

  const exportStaticSite = useCallback(async (): Promise<void> => {
    if (exportStaticBusyRef.current) {
      setStatus('A static export is already running.')
      return
    }
    const root = boundPathRef.current
    if (!root) {
      setStatus('Save the site first before exporting.')
      return
    }
    exportStaticBusyRef.current = true
    try {
      const destination = await chooseSiteFolder()
      if (!destination) return
      if (boundPathRef.current !== root) {
        setStatus('The site changed while choosing a folder — export cancelled.')
        return
      }
      const cleanDest = destination.replace(/\/+$/, '')
      const cleanRoot = root.replace(/\/+$/, '')
      if (cleanDest === cleanRoot || cleanDest.startsWith(`${cleanRoot}/`)) {
        setStatus('Choose a folder outside the open .site package.')
        return
      }
      setStatus('Building static site for export…')
      const prepared = await prepareCheckedSite(outputInput())
      if (boundPathRef.current !== root) {
        setStatus('The site changed while building — export cancelled.')
        return
      }
      for (const file of prepared.files) {
        const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
        if (folder) await createFolder(cleanDest, folder)
        if (file.encoding === 'base64') await writeBinaryFile(`${cleanDest}/${file.path}`, file.content)
        else await writeTextFile(`${cleanDest}/${file.path}`, file.content)
      }
      setStatus(`Exported ${prepared.files.length} static site files to ${cleanDest}.`)
    } catch (exportError) {
      setStatus(`Static export failed: ${exportError instanceof Error ? exportError.message : String(exportError)}`)
    } finally {
      exportStaticBusyRef.current = false
    }
  }, [outputInput])

  const exportReview = useCallback(async (input: { format: 'pdf' | 'png'; page?: string; width?: number; choosePath?: boolean }) => {
    if (exportBusy.current) throw new Error('An export is already running. Wait for it to finish.')
    exportBusy.current = true
    setExporting(true)
    let temporary: string | undefined
    try {
      const root = boundPathRef.current
      if (!root) throw new Error('Save the site before exporting a review copy.')
      const page = input.page ?? selectedPage
      if (!documentRef.current.pages[page]) throw new Error('Page not found. Call getSiteContext for available pages.')
      const width = input.width ?? previewBoxRef.current.width
      const filename = reviewFilename(documentRef.current.title, page, input.format)
      const output = input.choosePath
        ? await chooseReviewExportPath(filename, input.format)
        : `${root}/reviews/${crypto.randomUUID()}-${filename}`
      if (!output) return null
      if (boundPathRef.current !== root) {
        throw new Error('The site changed while choosing the export path.')
      }
      await lifecycleRef.current.flush({ throwOnError: true })
      await writeSiteFonts(root)
      const html = documentRef.current.pages[page]
      if (!html) throw new Error('This page has no content to export yet.')
      return await withInternalWrite(async () => {
        if (!input.choosePath) await createFolder(root, 'reviews')
        temporary = `${root}/.review-${crypto.randomUUID()}.html`
        await writeTextFile(temporary, reviewHtml(html, root, page))
        setStatus(`Exporting ${page} to ${input.format.toUpperCase()}…`)
        await renderReviewPage(temporary, output, input.format, width)
        setStatus(`Exported ${input.format.toUpperCase()} to ${output}`)
        return { page, format: input.format, outputPath: output, artifactPaths: [output] }
      })
    } finally {
      if (temporary) await withInternalWrite(() => deleteFileQuietly(temporary!))
      exportBusy.current = false
      setExporting(false)
    }
  }, [selectedPage, withInternalWrite, writeSiteFonts])

  const agentContext = useMemo(() => {
    /** An agent write through the door; a refusal is the tool's error, verbatim. */
    const land = (request: Omit<SiteLanding, 'origin'>): AgentLanded => {
      const out = landEdit({ ...request, origin: 'agent' })
      if (!out.ok) throw new AgentSiteToolError(out.message)
      if (out.snapshot) setUndoOffer(out.snapshot)
      return {
        hash: out.hash,
        pageHashes: out.pageHashes,
        changed: out.changed,
        warning: out.warning,
        snapshot: out.snapshot,
      }
    }
    /** One page rewritten by a pure transform of its html, against the live document. */
    const pageEdit = (
      page: string,
      base: AgentBase,
      reason: string,
      edit: (html: string) => string,
      request?: string,
    ): AgentLanded =>
      land({
        next: current => {
          const html = current.pages[page]
          if (html === undefined) {
            throw new AgentSiteToolError(
              `no page ${page} — the site has ${Object.keys(current.pages).join(
                ', ',
              )}`,
            )
          }
          return writePageIn(current, page, edit(html))
        },
        ...base,
        reason,
        scope: page,
        ...(request !== undefined ? { request } : {}),
      })

    return {
      getDrawerRequest,
      commitDrawerRequest,
      cancelDrawerRequest,
      prepareSite: (args: Record<string, unknown>) =>
        prepareDrawerRequest(
          'draft',
          typeof args.brief === 'string' && args.brief.trim()
            ? args.brief.trim()
            : documentRef.current.manifest.brief,
        ),
      document,
      hash: hashRef.current,
      pageHashes: Object.fromEntries(
        Object.entries(document.pages).map(([path, html]) => [
          path,
          pageHash(html),
        ]),
      ),
      verification,
      revisions: revisionsNewestFirst(revisions),
      documentPath,
      pages,
      material,
      selection,
      selectedPage,
      pageSelection,
      writePage: (page: string, html: string, base: AgentBase) =>
        pageEdit(page, base, 'agent-writePage', () => html, ''),
      addPage: (
        input: { path: string; title?: string; html?: string },
        base: AgentBase,
      ) => {
        const path = normalizePagePath(input.path)
        const landed = land({
          next: current => addPageTo(current, { ...input, path }),
          ...base,
          reason: 'agent-addPage',
          scope: path,
        })
        return { ...landed, page: path }
      },
      deletePage: (page: string, base: AgentBase) =>
        land({
          next: current => deletePageFrom(current, page),
          ...base,
          reason: 'agent-deletePage',
          scope: page,
        }),
      movePage: (from: number, to: number, base: AgentBase) =>
        land({
          next: current => movePageIn(current, from, to),
          ...base,
          reason: 'agent-movePage',
        }),
      setPageTitle: (page: string, title: string, base: AgentBase) =>
        pageEdit(page, base, 'agent-setPageTitle', html =>
          applyPageTitle(html, title),
        ),
      setElementText: (
        page: string,
        path: string,
        text: string,
        base: AgentBase,
      ) =>
        pageEdit(page, base, 'agent-setElementText', html =>
          setElementTextIn(html, path, text),
        ),
      setElementSrc: (
        page: string,
        path: string,
        src: string,
        base: AgentBase,
      ) =>
        pageEdit(page, base, 'agent-setElementSrc', html =>
          setElementSrcIn(html, path, src, page),
        ),
      insertElement: (
        input: {
          page: string
          markup: string
          beforePath?: string
          afterPath?: string
        },
        base: AgentBase,
      ) =>
        pageEdit(input.page, base, 'agent-insertElement', html =>
          insertElementIn(html, input),
        ),
      deleteElement: (page: string, path: string, base: AgentBase) =>
        pageEdit(page, base, 'agent-deleteElement', html =>
          deleteElementIn(html, path),
        ),
      writeStyles: (css: string, base: AgentBase) =>
        land({
          // A whole stylesheet keeps the brand the site is in (siteBrand.ts).
          next: current => ({ ...current, styles: keepBrandBlock(current.styles, css) }),
          ...base,
          reason: 'agent-writeStyles',
        }),
      writeBrand: (block: string, brand: SiteBrand, base: AgentBase, origin: 'agent' | 'manual' = 'agent') => {
        const next = (current: SiteDocument): SiteDocument => ({
          ...current,
          styles: withBrandBlock(current.styles, block),
          manifest: { ...current.manifest, brand },
        })
        if (origin === 'agent') return land({ next, ...base, reason: 'agent-useBrand', scope: brand.name })
        const out = landEdit({ next, origin: 'manual', reason: 'house-style', scope: brand.name })
        if (!out.ok) throw new AgentSiteToolError(out.message)
        return { hash: out.hash, pageHashes: out.pageHashes, changed: out.changed, warning: out.warning, snapshot: out.snapshot }
      },
      serviceId,
      setCollection: (collection: Collection, base: AgentBase) =>
        land({
          next: current => ({
            ...current,
            collections: [
              ...current.collections.filter(
                item => item.name !== collection.name,
              ),
              collection,
            ],
          }),
          ...base,
          reason: 'agent-setCollection',
          scope: collection.name,
        }),
      deleteCollection: (name: string, base: AgentBase) =>
        land({
          next: current => ({
            ...current,
            collections: current.collections.filter(item => item.name !== name),
          }),
          ...base,
          reason: 'agent-deleteCollection',
          scope: name,
        }),
      addFormForCollection: (
        input: {
          collection: string
          page: string
          beforePath?: string
          afterPath?: string
        },
        base: AgentBase,
      ) =>
        pageEdit(input.page, base, 'agent-addForm', html => {
          const collection = documentRef.current.collections.find(
            item => item.name === input.collection,
          )
          const provider = dataProviderFor(serviceIdRef.current)
          if (!collection) {
            throw new AgentSiteToolError(
              `no collection called ${input.collection}`,
            )
          }
          if (!provider) {
            throw new AgentSiteToolError(
              'the chosen host does not store records',
            )
          }
          return insertElementIn(html, {
            markup: formSnippetFor(collection, provider),
            ...(input.beforePath ? { beforePath: input.beforePath } : {}),
            ...(input.afterPath ? { afterPath: input.afterPath } : {}),
          })
        }),
      setAssetRole,
      brandFiles: {
        readText: readTextFile,
        readBase64: async (path: string) => {
          const read = await readBinaryBase64(path)
          return { base64: read.base64, mimeType: read.mimeType ?? '' }
        },
        copyIn: async (from: string, name: string) => {
          const root = boundPathRef.current
          if (!root) throw new Error('there is no site open')
          if (!name || name.startsWith('/') || name.includes('..') || name.includes('\\') || name.includes('\0')) {
            throw new Error('Asset name must be a safe relative path.')
          }
          const read = await readBinaryBase64(from)
          if (/\.svg$/i.test(name) || /\.svg$/i.test(from)) {
            validateSafeSvgBase64(read.base64)
          }
          await withInternalWrite(async () => {
            try {
              await createFolder(root, SITE_ASSETS_DIR)
            } catch {
              /* already there */
            }
            await writeBinaryFile(`${root}/${SITE_ASSETS_DIR}/${name}`, read.base64)
          })
        },
        writeAsset: async (name: string, base64: string) => {
          const root = boundPathRef.current
          if (!root) throw new Error('there is no site open')
          if (!name || name.startsWith('/') || name.includes('..') || name.includes('\\') || name.includes('\0')) {
            throw new Error('Asset name must be a safe relative path.')
          }
          if (/\.svg$/i.test(name)) {
            validateSafeSvgBase64(base64)
          }
          await withInternalWrite(async () => {
            try {
              await createFolder(root, SITE_ASSETS_DIR)
            } catch {
              /* already there */
            }
            await writeBinaryFile(`${root}/${SITE_ASSETS_DIR}/${name}`, base64)
          })
        },
        refresh: async () => {
          const root = boundPathRef.current
          if (root) await loadMaterial(root, notesFrom(materialRef.current))
        },
      },
      generateImage: bridge.getMethods?.().includes(PLATFORM_BRIDGE_METHODS.ASSISTANTS_VISION_GENERATE)
        ? async (request: Parameters<NonNullable<SiteAgentToolContext['generateImage']>>[0]) => {
            const made = await vision.generate(request)
            return { base64: made.base64, mimeType: made.mimeType, modelId: made.modelId }
          }
        : null,
      restoreRevision,
      checkSite: () =>
        findingsFor(
          documentRef.current,
          materialRef.current.map(item => item.name),
        ),
      saveSite,
      buildSite: runBuild,
      exportPage: exportReview,
      checkResponsive: async (page: string, widths: number[]) => {
        const current = documentRef.current
        const out: { width: number; read: LayoutRead | null; why?: string }[] = []
        for (const width of widths) {
          const srcdoc = previewDocument({ html: current.pages[page] ?? '', styles: current.styles, assets: previewsRef.current, page })
          // On screen in the measuring frame; hidden, in the shell's own window at the same width.
          const measured = await measurePage(srcdoc, { width, height: Math.round(width * 1.9), timeoutMs: 6000 }, collectLayout, width)
          out.push(measured.ok ? { width, read: measured.value } : { width, read: null, why: measured.why })
        }
        return out
      },
    }
  }, [
    document,
    documentPath,
    saveSite,
    findingsFor,
    landEdit,
    material,
    pages,
    restoreRevision,
    revisions,
    runBuild,
    exportReview,
    selectedPage,
    pageSelection,
    selection,
    serviceId,
    setAssetRole,
    loadMaterial,
    verification,
    withInternalWrite,
  ])

  usePureSiteAgentTools(ready, agentContext)
  agentContextRef.current = agentContext

  // The house style can arrive or change while the app is open (the
  // organisation pushed a new one); the wizard and the brand sheet follow it.
  const offersBrands = ready && brandsOffered()
  useEffect(() => {
    if (!offersBrands) return
    let live = true
    const read = (): void => {
      void defaultBrand()
        .then(house => { if (live) setHouseStyle(house) })
        .catch(() => {})
    }
    read()
    const stop = onBrandsChanged(read)
    return () => {
      live = false
      stop()
    }
  }, [offersBrands])

  /** Put the house style on the open site: the useBrand path, by the app. */
  const putOnHouseStyle = useCallback(async (): Promise<void> => {
    const context = agentContextRef.current
    if (!houseStyle || !context) throw new Error('There is no house style to use.')
    if (!boundPathRef.current) throw new Error('Save the site first, so there is somewhere to bring the brand into.')
    await applyBrand(context, { system: houseStyle.system, path: houseStyle.path, detail: houseStyle }, 'house-style', {}, 'manual')
    setStatus(`${brandLine(documentRef.current.manifest.brand)}.`)
  }, [houseStyle])

  /**
   * The wizard's look. House style puts the organisation's brand on; any other
   * look is the person choosing something else, so a house style the app put
   * on is taken off — its block, and the files it brought. A brand someone
   * chose (useBrand) is left alone.
   */
  const chooseLook = useCallback((value: string): void => {
    const current = documentRef.current
    if (value === 'house') {
      applyDocument(doc => ({ ...doc, manifest: { ...doc.manifest, look: 'house' } }))
      if (!current.manifest.brand) void putOnHouseStyle().catch(error => setStatus(error instanceof Error ? error.message : String(error)))
      return
    }
    const wasHouse = current.manifest.brand?.how === 'house-style'
    applyDocument(doc => {
      if (!wasHouse || doc.manifest.brand?.how !== 'house-style') return { ...doc, manifest: { ...doc.manifest, look: value } }
      const { brand: _brand, ...manifest } = doc.manifest
      return { ...doc, styles: withoutBrandBlock(doc.styles), manifest: { ...manifest, look: value } }
    })
    const root = boundPathRef.current
    if (!wasHouse || !root) return
    void (async () => {
      await withInternalWrite(async () => {
        for (const item of materialRef.current.filter(entry => isBrandAsset(entry.name)))
          await deleteFileQuietly(`${root}/${SITE_ASSETS_DIR}/${item.name}`)
      })
      await loadMaterial(root, notesFrom(materialRef.current).filter(note => !isBrandAsset(note.name)))
    })()
  }, [applyDocument, loadMaterial, putOnHouseStyle, withInternalWrite])

  const siteBrand: SiteBrand | undefined = document.manifest.brand
  const brandPagesLabel = pageSelection.length > 1 ? `${pageSelection.length} ticked pages` : pageSelection.length === 1 ? 'the ticked page' : 'the page on screen'

  const onPublishBuild = useCallback(async () => {
    setPublish({ phase: 'building', message: 'Writing build/…' })
    try {
      const result = await runBuild()
      setPublish({
        phase: 'built',
        message: `Wrote ${result.files.length} files.`,
        result,
      })
    } catch (buildError) {
      setPublish({
        phase: 'error',
        message:
          buildError instanceof Error ? buildError.message : String(buildError),
      })
    }
  }, [runBuild])

  /** The explicit human action sends the same checked preparation as build/. */
  const onPublishSend = useCallback(async () => {
    const root = boundPathRef.current
    const service = services.find(option => option.id === serviceId)
    if (!root || !service) return
    publishCancelRef.current = false
    setPublish(state => ({
      ...state,
      phase: 'sending',
      message: 'Checking the site…',
    }))
    try {
      // Update the same URL only where that means something: the same
      // service, and one that says how to update. Anything else publishes
      // fresh rather than failing or updating the wrong host.
      const previous = publishedRef.current
      const existing =
        previous && previous.service === service.id && service.endpoints.update
          ? {
              slug: previous.slug,
              ...(previous.claimToken
                ? { claimToken: previous.claimToken }
                : {}),
            }
          : undefined

      const { live, comparison, document: current } = await sendSiteOutput(outputInput(), {
        service,
        ...(existing ? { existing } : {}),
        onProgress: progress =>
          setPublish(state => ({ ...state, message: progress.message })),
        shouldCancel: () => publishCancelRef.current,
      })
      // A republish returns no new claim token — the first one is the only
      // one there will ever be, so it is carried forward, not dropped.
      const claimToken = live.claimToken ?? existing?.claimToken
      const published: PublishedRecord = {
        service: service.id,
        slug: live.slug,
        ...(claimToken ? { claimToken } : {}),
        ...(live.siteUrl ? { url: live.siteUrl } : {}),
        at: new Date().toISOString(),
        ...comparison,
      }
      // The door is shut while a site opens, and only the finished opening says
      // where this record belongs. Nothing but "Opening site" is on screen until then.
      while (openingRef.current) await new Promise(resolve => setTimeout(resolve, 50))
      // Keep the live record with the package that was actually sent, even
      // when the person opened another site while uploads were in flight.
      let recordError: string | undefined
      try {
        if (boundPathRef.current !== root) {
          const saved = parseSiteManifest(await readTextFile(`${root}/${SITE_MANIFEST_FILE}`))
          await writeTextFile(`${root}/${SITE_MANIFEST_FILE}`, serializeSiteManifest({ ...saved, published }))
        }
        if (boundPathRef.current === root) {
          // Publishing metadata is outside history and follows the existing lifecycle.
          const landed = applyDocument(latest => ({ ...latest, manifest: { ...latest.manifest, published } }))
          if (!landed.ok) throw new Error(landed.message)
          publishedRef.current = published
        }
      } catch (error) {
        recordError = error instanceof Error ? error.message : String(error)
      }
      // A local save error must not hide a successful publication or its one-time claim link.
      const message = recordError
        ? `Live at ${live.siteUrl}, but its publishing record could not be saved: ${recordError}`
        : `Live at ${live.siteUrl}`
      setPublish(state => ({
        ...state,
        phase: 'live',
        message,
        live,
      }))
      setStatus(recordError ? message : `Published to ${live.siteUrl}`)
      // A publish leaves a site behind on a host, so it goes in the ledger.
      void recordOperation({
        lane: 'user',
        kind: 'site.publish',
        appSlug: SITE_APP_SLUG,
        summary: `Published ${current.title} to ${live.siteUrl}.`,
        refs: { path: root },
      })
    } catch (sendError) {
      if (sendError instanceof PublishCancelled) {
        setPublish(state => ({
          ...state,
          phase: state.result ? 'built' : 'idle',
          message: 'Publishing stopped.',
        }))
        return
      }
      setPublish(state => ({
        ...state,
        phase: 'error',
        message:
          sendError instanceof Error ? sendError.message : String(sendError),
      }))
    }
  }, [applyDocument, outputInput, serviceId, services])

  /**
   * Open the page in the real browser.
   *
   * The build is written first and the browser is pointed at THAT, not at the
   * package's pages/ — build/ is the folder as a host will serve it, so the
   * relative paths a browser resolves here are the ones a visitor will.
   * The in-app preview inlines assets to work inside a sandboxed frame, which
   * means it cannot prove a path is right; this can.
   */
  const openInBrowser = useCallback(async () => {
    const root = boundPathRef.current
    if (!root) {
      setStatus('Save the site first, so there is something to open.')
      return
    }
    try {
      setStatus('Building, then opening…')
      await runBuild()
      await openPath(`${root}/${SITE_BUILD_DIR}/${selectedPage}`)
      setStatus(`Opened ${selectedPage} in your browser.`)
    } catch (openError) {
      setStatus(
        openError instanceof Error ? openError.message : String(openError),
      )
    }
  }, [runBuild, selectedPage])

  useVideoDrop('page', video => {
    const landed = applyDocument(current => {
      const html = current.pages[selectedPage]
      return html === undefined ? current : writePageIn(current, selectedPage, insertElementIn(html, { markup: videoEmbedMarkup(video) }))
    })
    setStatus(landed.ok ? 'Video embedded at end of page.' : landed.message)
  }, setStatus)

  useImageDrop('page', image => {
    const landed = applyDocument(current => {
      const html = current.pages[selectedPage]
      return html === undefined ? current : writePageIn(current, selectedPage, insertElementIn(html, { markup: imageTransferMarkup(image) }))
    })
    setStatus(landed.ok ? 'Image inserted at end of page.' : landed.message)
  }, setStatus, '[data-video-drop-surface]')

  if (effectiveBridgeError) {
    return (
      <AppFrame {...compactFrame}>
        <EmptyState
          tone="error"
          title="Bridge unavailable"
          message={effectiveBridgeError.message}
        />
      </AppFrame>
    )
  }

  if (!effectiveReady) {
    return (
      <AppFrame {...compactFrame}>
        <EmptyState
          tone="neutral"
          title="PureSite"
          message="Waiting for shell bridge…"
        />
      </AppFrame>
    )
  }

  if (opening) return <AppFrame {...compactFrame}><EmptyState tone="neutral" title="Opening site" message="Reading the site’s files…" /></AppFrame>

  const hasOpenSite = documentStarted || documentPath !== null



  return (
    <AppFrame
      {...compactFrame}
      data-app={SITE_APP_SLUG}
      identityAppSlug={SITE_APP_SLUG}
      headerDocumentName={
        document.title?.trim() || (documentPath ? documentPath.split('/').pop() : undefined)
      }
      headerActions={
        <DocumentHeaderActions
          lifecycle={lifecycle}
          title={document.title || DEFAULT_SITE_TITLE}
          onOpenSwitcher={() => setSwitcherOpen(true)}
        />
      }
    >
      {error && <InlineBanner variant="danger" onDismiss={() => setError(null)}>{error}</InlineBanner>}
      {!hasOpenSite ? (
        <>
        {compact ? (
          <div className="site-compact-empty">
            <p>No site is open here.</p>
            <Button onClick={() => void createNewSite()}>New site</Button>
          </div>
        ) : null}
        <DocumentSwitcher
          appSlug={SITE_APP_SLUG}
          suffixes={[SITE_PACKAGE_SUFFIX]}
          variant="landing"
          open={!compact}
          previewStyle="grid"
          loadPreview={loadSitePreview}
          onChooseFromSystem={chooseSiteFromSystem}
          onOpenDocument={(path: string) => void openSitePath(path)}
          onCreateNew={() => void createNewSite()}
          newLabel="New site"
          title="Open a site"
          itemNoun="site"
          itemNounPlural="sites"
        />
        </>
      ) : (
        <>
          <SiteBoardView
            document={document}
            pages={pages}
            publicationAssets={publicationAssets}
            material={material}
            previews={previews}
            collections={document.collections}
            dataProvider={dataProviderFor(serviceId)}
            onAddFormForCollection={name => {
              const collection = documentRef.current.collections.find(item => item.name === name)
              const provider = dataProviderFor(serviceIdRef.current)
              if (!collection) {
                setStatus(`No collection called ${name}.`)
                return
              }
              if (!provider) {
                setStatus('The chosen host does not store records.')
                return
              }
              const landed = applyDocument(current => {
                const html = current.pages[selectedPage]
                if (html === undefined) return current
                return writePageIn(
                  current,
                  selectedPage,
                  insertElementIn(html, { markup: formSnippetFor(collection, provider) }),
                )
              })
              setStatus(
                landed.ok
                  ? `Added ${name} form to ${selectedPage}.`
                  : landed.message,
              )
            }}
            onDeleteCollection={name => {
              const landed = applyDocument(current => ({
                ...current,
                collections: current.collections.filter(item => item.name !== name),
              }))
              setStatus(
                landed.ok ? `Removed collection ${name}.` : landed.message,
              )
            }}
            selectedPage={selectedPage}
            pageSelection={pageSelection}
            onPageSelection={setPageSelection}
            selection={selection}
            findings={findings}
            verification={verification}
            onRecheck={() => void measureSite()}
            revisions={revisionsNewestFirst(revisions)}
            onRestoreRevision={file =>
              void restoreRevision(file).then(result => {
                if ('error' in result) setStatus(result.error)
              })
            }
            statusAction={
              undoOffer
                ? {
                    label: 'Undo',
                    title: `Put back the version from ${revisionLabel(
                      undoOffer,
                      Date.now(),
                    )}`,
                    onClick: undoRevision,
                  }
                : null
            }
            status={status}
            asking={asking}
            viewport={viewport}
            onPreviewViewport={onPreviewViewport}
            onViewport={setViewport}
            onSelectPage={page => {
              setSelectedPage(page)
              setSelection(null)
            }}
            onSelectElement={setSelection}
            compact={compact}
            onEditElement={(page, path, outerHtml) => {
              if (documentRef.current.pages[page] === undefined) return false
              // The element was serialized from the INLINED preview: its images
              // carry the data URLs the preview put there. Back to assets/ paths
              // first, or megabytes of base64 land in pages/*.html and ship.
              const markup = sanitizeEditedOuterHtml(
                deinlineMarkup(
                  outerHtml,
                  previewsRef.current,
                  page,
                ),
              )
              if (!markup) {
                setStatus('The edited element contained disallowed markup and was not applied.')
                return false
              }
              // Emptying an element inline MEANS deleting it — a committed
              // empty block keeps its space and reads as "not deleted".
              const probe = new DOMParser().parseFromString(markup, 'text/html')
                .body.firstElementChild
              const emptied =
                probe &&
                probe.tagName !== 'IMG' &&
                probe.children.length === 0 &&
                !(probe.textContent ?? '').trim()
              const landed = applyDocument(current => {
                const live = current.pages[page]
                if (live === undefined) return current
                const next = emptied
                  ? deleteElementIn(live, path)
                  : replaceElementIn(live, path, markup)
                return next === live
                  ? current
                  : writePageIn(current, page, next)
              })
              if (!landed.ok) {
                setStatus(landed.message)
                return false
              }
              if (!landed.changed) {
                setStatus(
                  'The edited element could not be found — the page may have changed underneath it.',
                )
                return false
              }
              setStatus(emptied ? 'Element deleted.' : 'Edited.')
              // The frame shows what was typed; a deleted element it still holds, so that one reloads.
              return !emptied
            }}
            onBuildPromise={(path, title, brief) => {
              // The page is made here so the link stops being a promise at
              // once; what it should SAY comes from the sentences that
              // promised it, handed to the drawer as the request.
              applyDocument(current => addPageTo(current, { path, title }))
              setSelectedPage(path)
              void (async () => {
                setAsking(true)
                try {
                  await prepareDrawerRequest('edit', brief, [path], undefined, true)
                } catch (buildError) {
                  setStatus(
                    buildError instanceof Error ? buildError.message : String(buildError),
                  )
                } finally {
                  setAsking(false)
                }
              })()
            }}
            onSetGoal={page => {
              applyDocument(current => ({
                ...current,
                manifest: {
                  ...current.manifest,
                  ...(page ? { goal: page } : { goal: undefined }),
                },
              }))
              setStatus(page ? `This site is for ${urlPathFor(page)}.` : 'No single goal.')
            }}
            onLinkSelection={(page, path, href) => {
              applyDocument(current => {
                const html = current.pages[page]
                return html ? writePageIn(current, page, linkElement(html, path, href)) : current
              })
              setStatus(`Linked to ${href}.`)
            }}
            onBuildAllPromises={promises => {
              // Every page at once, but one request: the drawer gets each
              // brief in the order the links made them, and each page exists
              // before it is asked for, so nothing is written into thin air.
              if (!promises.length) return
              applyDocument(current =>
                promises.reduce(
                  (document, promise) =>
                    addPageTo(document, { path: promise.path, title: promise.title }),
                  current,
                ),
              )
              setSelectedPage(promises[0]!.path)
              void (async () => {
                setAsking(true)
                try {
                  await prepareDrawerRequest(
                    'edit',
                    promises.map(promise => promise.brief).join('\n\n'),
                    promises.map(promise => promise.path),
                    undefined,
                    true,
                  )
                } catch (buildError) {
                  setStatus(
                    buildError instanceof Error ? buildError.message : String(buildError),
                  )
                } finally {
                  setAsking(false)
                }
              })()
            }}
            onRepointPromise={(from, to) => {
              applyDocument(current => ({
                ...current,
                pages: repointPromise(current.pages, from, to),
              }))
              setStatus(`Those links now go to ${urlPathFor(to)}.`)
            }}
            onUnlinkPromise={path => {
              applyDocument(current => ({
                ...current,
                pages: unlinkPromise(current.pages, path),
              }))
              setStatus('Kept the words, dropped the link.')
            }}
            onAddPage={() => {
              let n = Object.keys(documentRef.current.pages).length + 1
              let path = normalizePagePath(`page-${n}`)
              while (!path || documentRef.current.pages[path]) {
                n += 1
                path = normalizePagePath(`page-${n}`)
              }
              applyDocument(current => addPageTo(current, { path }))
              setSelectedPage(path)
            }}
            onAdd404Page={() => {
              applyDocument(current => add404PageTo(current))
              setSelectedPage('404.html')
              setStatus('Added 404.html starter page.')
            }}
            onDuplicatePage={page => {
              let created = page
              const landed = applyDocument(current => {
                const res = duplicatePageIn(current, page)
                created = res.path
                return res.document
              })
              if (landed.ok && created !== page) {
                setSelectedPage(created)
                setStatus(`Duplicated ${page} to ${created}.`)
              }
            }}
            onRenamePage={(oldPath, newPath) => {
              let renamed = oldPath
              const landed = applyDocument(current => {
                const res = renamePagePathIn(current, oldPath, newPath)
                renamed = res.path
                return res.document
              })
              if (landed.ok && renamed !== oldPath) {
                setSelectedPage(renamed)
                setStatus(`Renamed ${oldPath} to ${renamed} and updated links.`)
              } else {
                setStatus(`Could not rename ${oldPath} to ${newPath}.`)
              }
            }}
            onUpdatePageHead={(page: string, patch: Partial<PageHeadMeta>) => {
              const landed = applyDocument(current => {
                const html = current.pages[page]
                return html ? writePageIn(current, page, updatePageHeadIn(html, patch)) : current
              })
              if (landed.ok && landed.changed) setStatus(`Updated head metadata for ${page}.`)
            }}
            onWritePageSource={(page: string, html: string) => {
              const landed = applyDocument(current => writePageIn(current, page, html))
              setStatus(landed.ok ? `Applied HTML to ${page}.` : landed.message)
            }}
            onWriteStylesSource={(css: string) => {
              const landed = applyDocument(current => ({
                ...current,
                styles: keepBrandBlock(current.styles, css),
              }))
              setStatus(landed.ok ? 'Applied styles/site.css.' : landed.message)
            }}
            onDeleteAsset={name => void deleteAssets([name])}
            onCleanUnusedAssets={names => void deleteAssets(names)}
            canUndo={undoCounts.undo > 0}
            canRedo={undoCounts.redo > 0}
            onUndo={undoManual}
            onRedo={redoManual}
            modalOpen={publishOpen || wizardOpen || brandOpen || switcherOpen || cloudShareOpen}
            cloudShareOpen={cloudShareOpen}
            onCloudShareOpenChange={setCloudShareOpen}
            onInsertSection={(page, sectionId) => {
              const section = sectionById(sectionId)
              const landed = applyDocument(current =>
                insertSectionIntoPage(current, page, sectionId),
              )
              setStatus(
                landed.ok
                  ? `Inserted ${section?.name ?? sectionId} into ${page}.`
                  : landed.message,
              )
            }}
            onApplyDesignTokens={(tokens: DesignTokens) => {
              const landed = applyDocument(current => ({
                ...current,
                styles: withDesignTokens(current.styles, tokens),
              }))
              if (landed.ok && landed.changed) {
                setStatus('Updated design tokens in styles/site.css.')
              }
            }}
            onMoveElement={(page, path, direction) => {
              let nextPath = path
              const landed = applyDocument(current => {
                const html = current.pages[page]
                if (!html) return current
                const res = moveElementIn(html, path, direction)
                nextPath = res.nextPath
                return res.html === html ? current : writePageIn(current, page, res.html)
              })
              if (landed.ok && landed.changed) {
                setSelection(cur => (cur && cur.page === page ? { ...cur, path: nextPath } : cur))
                setStatus(`Moved element ${direction}.`)
              }
            }}
            onDuplicateElement={(page, path) => {
              let nextPath = path
              const landed = applyDocument(current => {
                const html = current.pages[page]
                if (!html) return current
                const res = duplicateElementIn(html, path)
                nextPath = res.nextPath
                return res.html === html ? current : writePageIn(current, page, res.html)
              })
              if (landed.ok && landed.changed) {
                setSelection(cur => (cur && cur.page === page ? { ...cur, path: nextPath } : cur))
                setStatus('Duplicated element.')
              }
            }}
            onDeleteElement={(page, path) => {
              const landed = applyDocument(current => {
                const html = current.pages[page]
                return html ? writePageIn(current, page, deleteElementIn(html, path)) : current
              })
              if (landed.ok && landed.changed) {
                setSelection(null)
                setStatus('Deleted element.')
              }
            }}
            onSetElementLink={(page, path, input) => {
              const landed = applyDocument(current => {
                const html = current.pages[page]
                return html ? writePageIn(current, page, setElementLinkIn(html, path, input)) : current
              })
              if (landed.ok && landed.changed) {
                setStatus(input.href.trim() ? `Linked to ${input.href.trim()}.` : 'Removed link.')
              }
            }}
            onSetElementAlt={(page, path, alt) => {
              const landed = applyDocument(current => {
                const html = current.pages[page]
                return html ? writePageIn(current, page, setElementAltIn(html, path, alt)) : current
              })
              if (landed.ok && landed.changed) setStatus('Updated image alt text.')
            }}
            onSetElementLayout={(page, path, patch) => {
              const landed = applyDocument(current => {
                const html = current.pages[page]
                return html ? writePageIn(current, page, setElementLayoutIn(html, path, patch)) : current
              })
              if (landed.ok && landed.changed) setStatus('Updated element layout.')
            }}
            onCheckResponsive={async page => {
              const current = documentRef.current
              const out: Record<string, LayoutRead | null> = {}
              for (const width of [390, 768]) {
                const srcdoc = previewDocument({
                  html: current.pages[page] ?? '',
                  styles: current.styles,
                  assets: previewsRef.current,
                  page,
                })
                const measured = await measurePage(
                  srcdoc,
                  { width, height: Math.round(width * 1.9), timeoutMs: 4000 },
                  collectLayout,
                  width,
                )
                out[`${page}@${width}`] = measured.ok ? measured.value : null
              }
              return out
            }}
            onOpenExternalUrl={url => {
              if (standaloneDev) {
                window.open(url, '_blank', 'noopener,noreferrer')
                return
              }
              void openExternalUrl(url).catch(() =>
                setStatus('The browser could not be opened.'),
              )
            }}
            onStatusMessage={setStatus}
            onDeletePage={page =>
              applyDocument(current => deletePageFrom(current, page))
            }
            onMovePage={(from, to) =>
              applyDocument(current => movePageIn(current, from, to))
            }
            onSetPageTitle={(page, title) =>
              applyDocument(current => {
                const html = current.pages[page]
                return html
                  ? writePageIn(current, page, applyPageTitle(html, title))
                  : current
              })
            }
            onSetElementText={(page, path, text) =>
              applyDocument(current => {
                const html = current.pages[page]
                return html
                  ? writePageIn(
                      current,
                      page,
                      setElementTextIn(html, path, text),
                    )
                  : current
              })
            }
            onSetElementSrc={(page, path, src) =>
              applyDocument(current => {
                const html = current.pages[page]
                return html
                  ? writePageIn(
                      current,
                      page,
                      setElementSrcIn(html, path, src, page),
                    )
                  : current
              })
            }
            onAddFiles={() => void addFilesFromDialog()}
            onSetRole={setAssetRole}
            onDescribe={describeAsset}
            onRenameFile={renameAsset}
            onUseFileInstead={(missing, file) => {
              applyDocument(current => ({
                ...current,
                pages: repointAsset(current.pages, missing, file),
                styles: repointAssetInStyles(current.styles, missing, file),
              }))
              setStatus(`Those pages now use ${file}.`)
            }}
            onDescribeAll={() => void describeAll()}
            describing={describing}
            onAsk={request => {
              // The scope is not a setting to find: a picked element beats
              // ticked pages, which beat the page on screen — and only what is
              // in scope is sent. Each revision is doored with the hash of the
              // page it was asked about: a page that changed while the model
              // was working is skipped and said so, never clobbered.
              void (async () => {
                const current = documentRef.current
                const picked =
                  selection && selection.page === selectedPage
                    ? selection
                    : null
                const targets = picked
                  ? [selectedPage]
                  : pageSelection.length
                  ? pageSelection.filter(
                      page => current.pages[page] !== undefined,
                    )
                  : [selectedPage]
                setAsking(true)
                try {
                  await prepareDrawerRequest(
                    'edit',
                    request,
                    targets,
                    picked?.path,
                    true,
                  )
                } catch (askError) {
                  setStatus(
                    askError instanceof Error
                      ? askError.message
                      : String(askError),
                  )
                } finally {
                  setAsking(false)
                }
              })()
            }}
            onOpenHtml={() => {
              if (!documentPath) {
                setStatus('Save the site first.')
                return
              }
              // Show the actual file, so it can be opened in any editor — a path
              // printed in the footer was a dead end.
              const path = `${documentPath}/${SITE_PAGES_DIR}/${selectedPage}`
              setStatus(`Showing ${selectedPage} in your file manager.`)
              void revealPath(path).catch(() => setStatus(`Page file: ${path}`))
            }}
            onOpenInBrowser={() => void openInBrowser()}
            exporting={exporting}
            onExport={format => void exportReview({ format, choosePath: true }).catch(error => setStatus(`Export failed: ${error instanceof Error ? error.message : String(error)}`))}
            onPublish={() => {
              setPublish({ phase: 'idle', message: '' })
              setPublishOpen(true)
            }}
            brandChip={
              siteBrand || offersBrands
                ? { label: brandChipLabel(siteBrand), title: siteBrand ? `${brandLine(siteBrand)}. Propose it, or these pages, to your organisation.` : 'This site is not in a saved brand yet.' }
                : null
            }
            onOpenBrand={() => setBrandOpen(true)}
          />

          {brandOpen && !compact ? (
            <BrandSheet
              brand={siteBrand}
              offered={offersBrands}
              houseStyle={houseStyle?.name ?? null}
              pagesLabel={brandPagesLabel}
              onProposeBrand={async note => {
                const context = agentContextRef.current
                if (!context) throw new Error('The site is still opening.')
                return (await proposeSiteBrand(context, { note })).message
              }}
              onProposeSamples={async note => {
                const context = agentContextRef.current
                if (!context) throw new Error('The site is still opening.')
                const answer = await proposeSiteSamples(context, { note })
                return answer.message
              }}
              onUseHouseStyle={putOnHouseStyle}
              onClose={() => setBrandOpen(false)}
            />
          ) : null}

          <NewSiteWizard
            open={wizardOpen && !compact}
            brief={document.manifest.brief}
            onBrief={brief =>
              applyDocument(current => ({
                ...current,
                manifest: { ...current.manifest, brief },
              }))
            }
            target={document.manifest.target}
            onTarget={(target: TargetProfile) =>
              applyDocument(current => ({
                ...current,
                manifest: { ...current.manifest, target },
              }))
            }
            look={effectiveLook(document.manifest)}
            onLook={chooseLook}
            houseStyle={
              houseStyle
                ? {
                    name: houseStyle.name,
                    line:
                      siteBrand?.how === 'house-style'
                        ? brandLine(siteBrand)
                        : `In ${houseStyle.name}, your organisation’s house style`,
                  }
                : null
            }
            material={material}
            previews={previews}
            onAddFiles={() => void addFilesFromDialog()}
            onSetRole={setAssetRole}
            onRenameFile={renameAsset}
            busy={wizardBusy !== null}
            busyLabel={wizardBusy ?? ''}
            error={wizardError}
            onUseTemplate={templateId => {
              const template = SITE_TEMPLATES.find(item => item.id === templateId)
              const nextDoc = createSiteFromTemplate(templateId)
              const landed = landEdit({
                next: current => ({
                  ...nextDoc,
                  manifest: {
                    ...nextDoc.manifest,
                    ...(current.manifest.published ? { published: current.manifest.published } : {}),
                  },
                }),
                origin: 'manual',
                reason: 'template',
              })
              if (landed.ok) {
                setSelectedPage(DEFAULT_HOME_PAGE)
                setSelection(null)
                setWizardError(null)
                setWizardOpen(false)
                setStatus(`Started from ${template?.name ?? templateId} template (${Object.keys(nextDoc.pages).length} pages).`)
              }
            }}
            onCreate={briefText => {
              void (async () => {
                setWizardError(null)
                try {
                  setWizardBusy('Drafting the first page…')
                  await draftFromBrief(briefText)
                  setWizardOpen(false)
                } catch (draftError) {
                  const msg =
                    draftError instanceof Error ? draftError.message : String(draftError)
                  setWizardError(msg)
                  setStatus(msg)
                } finally {
                  setWizardBusy(null)
                }
              })()
            }}
            onSkip={() => {
              setWizardError(null)
              setWizardOpen(false)
            }}
            onCancel={cancelNewSite}
          />

          <PublishDialog
            open={publishOpen && !compact}
            state={publish}
            findings={findings}
            verification={verification}
            buildPath={
              documentPath ? `${documentPath}/${SITE_BUILD_DIR}` : null
            }
            services={services}
            allTools={allTools}
            chosenTools={chosenTools}
            onChooseTool={(id, on) =>
              applyDocument(current => {
                const existing = current.manifest.publishTools ?? []
                return {
                  ...current,
                  manifest: {
                    ...current.manifest,
                    publishTools: on
                      ? [...existing.filter(item => item !== id), id]
                      : existing.filter(item => item !== id),
                  },
                }
              })
            }
            serviceId={serviceId}
            onServiceId={setServiceId}
            cloud={{
              root: documentPath,
              prepare: async () => {
                const input = outputInput()
                await input.save()
                await input.verify()
              },
            }}
            onBuild={() => void onPublishBuild()}
            onSend={() => void onPublishSend()}
            onStop={() => {
              publishCancelRef.current = true
              setPublish(state => ({ ...state, message: 'Stopping…' }))
            }}
            onOpenUrl={url =>
              void openExternalUrl(url).catch(() =>
                setStatus('The browser could not be opened.'),
              )
            }
            onRevealBuild={() => {
              if (!documentPath) return
              const path = `${documentPath}/${SITE_BUILD_DIR}`
              void revealPath(path).catch(() => setStatus(`Build folder: ${path}`))
            }}
            onExportStaticSite={() => void exportStaticSite()}
            has404={Boolean(document.pages['404.html'])}
            onAdd404Page={() => {
              applyDocument(current => add404PageTo(current))
              setStatus('Added 404.html starter page.')
            }}
            onOpenCloudShare={() => setCloudShareOpen(true)}
            onClose={() => setPublishOpen(false)}
          />
        </>
      )}

      <DocumentSwitcher
        appSlug={SITE_APP_SLUG}
        suffixes={[SITE_PACKAGE_SUFFIX]}
        variant="modal"
        previewStyle="grid"
        loadPreview={loadSitePreview}
        onChooseFromSystem={chooseSiteFromSystem}
        open={switcherOpen && !compact}
        onClose={() => setSwitcherOpen(false)}
        onOpenDocument={(path: string) => {
          setSwitcherOpen(false)
          void openSitePath(path)
        }}
        onCreateNew={() => {
          setSwitcherOpen(false)
          void createNewSite()
        }}
        newLabel="New site"
        title="Open a site"
        itemNoun="site"
        itemNounPlural="sites"
      />
    </AppFrame>
  )
}
