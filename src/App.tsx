import { useVideoDrop, useImageDrop } from '@purescience/platform-ui/bridge/react/useVideoDrop'
import { imageTransferMarkup } from '@purescience/platform-ui/bridge/imageTransfer'
import { videoEmbedMarkup } from '@purescience/platform-ui/bridge/videoTransfer'
import { reviewHtml, reviewFilename } from './lib/reviewExport'
import { chooseReviewExportPath, renderReviewPage } from './bridge/platformBridge'
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
import {
  compositionFor,
  recoverableSite,
  digest,
  requestSession,
  descriptionState,
  assertDescriptionScope,
  type DrawerRequest,
} from './lib/drawerRequest'
import { messages, sessions } from '@purescience/platform-ui/bridge/assistants'
import {
  updateCurrentWorkspaceTab,
  toggleAgentDrawer,
} from '@purescience/platform-ui/bridge/workspace'
import { manifestWithoutPublished } from './lib/siteHash'
import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { EmptyState } from '@purescience/platform-ui/components/common/feedback/EmptyState'
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
  setPageTitle as applyPageTitle,
  titleFromPage,
  type SiteDocument,
  type TargetProfile,
  urlPathFor,
} from './lib/siteDocument'
import {
  addPage as addPageTo,
  deleteElement as deleteElementIn,
  deletePage as deletePageFrom,
  insertElement as insertElementIn,
  movePage as movePageIn,
  normalizePagePath,
  setElementSrc as setElementSrcIn,
  replaceElement as replaceElementIn,
  setElementText as setElementTextIn,
  writePage as writePageIn,
  linkElement,
} from './lib/pages'
import {
  deinlineMarkup,
  internalLinks,
  oversizeAssets,
  previewDocument,
  referencedAssets,
} from './lib/preview'
import { checkSite, planBuild, type BuildResult } from './lib/buildSite'
import { repointAsset } from './lib/assetNames'
import { draftState, fingerprintPages } from './lib/draftState'
import { linkGraph, repointPromise, shipPage, unlinkPromise } from './lib/siteLinks'
import { llmsText, robotsText, sitemapXml } from './lib/siteLenses'
import {
  checkCollections,
  dataProviderFor,
  formSnippetFor,
  parseCollections,
  type Collection,
} from './lib/siteData'
import { siteDesignGuide, type ReferenceImage } from './lib/draftSite'
import {
  DEFAULT_SERVICE_ID,
  loadPublishServices,
  type PublishService,
} from './lib/publishServices'
import { publishSite, PublishCancelled, type PublishFile } from './lib/publish'
import { mergeMaterial, notesFrom, type MaterialItem } from './lib/material'
import type { AssetNote, AssetRole } from './lib/assetNotes'
import {
  AgentSiteToolError,
  type AgentBase,
  type AgentLanded,
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
} from './bridge/platformBridge'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import {
  EMPTY_REVISION_INDEX,
  createRevisionHistory,
  ensureExportable,
  fontsStatusOf,
  mountMeasuringFrame,
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
  const { error: bridgeError, ready, meta } = usePlatformBridge()
  const drawerRequestRef = useRef<DrawerRequest | null>(null)
  const drawerCommitBusy = useRef(false)
  const { resource, clearResource } = usePlatformViewportResource(ready, meta)

  const [document, setDocument] = useState<SiteDocument>(
    createDefaultSiteDocument,
  )
  const documentRef = useRef(document)
  const [documentPath, setDocumentPath] = useState<string | null>(null)
  const [documentStarted, setDocumentStarted] = useState(false)
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

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardBusy, setWizardBusy] = useState<string | null>(null)
  const [describing, setDescribing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportBusy = useRef(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [publish, setPublish] = useState<PublishState>({
    phase: 'idle',
    message: '',
  })
  const [services, setServices] = useState<PublishService[]>([])
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

  const lifecycle = useDocumentLifecycle({
    appSlug: SITE_APP_SLUG,
    suffix: SITE_PACKAGE_SUFFIX,
    kind: 'package',
    suggestedTitle: document.title,
    debounceMs: AUTOSAVE_DELAY_MS,
    onExternalChange: ({ path, dirty }: { path: string; dirty: boolean }) => {
      if (dirty) return
      if (buildingRef.current) return
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
      return [
        {
          name: SITE_MANIFEST_FILE,
          content: serializeSiteManifest({
            ...current.manifest,
            title: current.title,
            pages: orderedPages(current).map(page => page.path),
            assets: notesFrom(materialRef.current),
          }),
        },
        ...Object.entries(current.pages).map(([path, html]) => ({
          name: `${SITE_PAGES_DIR}/${path}`,
          content: html,
        })),
        { name: SITE_STYLESHEET, content: current.styles },
        { name: `${SITE_ASSETS_DIR}/.keep`, content: '' },
      ]
    },
  })
  const lifecycleRef = useRef(lifecycle)
  lifecycleRef.current = lifecycle

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
      lifecycleRef.current.markDirty()
      return { ...outcome, snapshot, warning }
    },
    [history],
  )

  /** A hand edit: a transform of the live document, through the door. */
  const applyDocument = useCallback(
    (
      transform: (current: SiteDocument) => SiteDocument,
      origin: EditOrigin = 'manual',
    ): SiteLanded => landEdit({ next: transform, origin }),
    [landEdit],
  )

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

  const assetNames = useMemo(() => material.map(item => item.name), [material])

  const findings = useMemo(
    () => [
      ...checkSite(document, assetNames, linksByPage),
      // A manifest the host refuses fails the whole publish, so its rules are
      // checked beside every other thing that will be wrong once it is live.
      ...checkCollections(document.collections).map(finding => ({
        ...finding,
        code: `data:${finding.code}`,
      })),
    ],
    [document, assetNames, linksByPage],
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

  const loadPreviews = useCallback(
    async (path: string, items: MaterialItem[]): Promise<void> => {
      for (const item of items) {
        if (item.kind !== 'image') continue
        try {
          const dataUrl = await readBinaryDataUrl(
            `${path}/${SITE_ASSETS_DIR}/${item.name}`,
            12 * 1024 * 1024,
          )
          setPreviews(current =>
            current[item.name] === dataUrl
              ? current
              : { ...current, [item.name]: dataUrl },
          )
        } catch {
          // A file that will not read shows its name, as it did before.
        }
      }
    },
    [],
  )

  const loadMaterial = useCallback(
    async (
      path: string,
      notes: AssetNote[] = notesFrom(materialRef.current),
    ) => {
      try {
        const listing = (await listFiles(`${path}/${SITE_ASSETS_DIR}`)) as {
          entries?: { name?: string; isDirectory?: boolean; size?: number }[]
        }
        const files = (listing?.entries ?? [])
          .filter(
            (
              entry,
            ): entry is {
              name: string
              isDirectory?: boolean
              size?: number
            } => typeof entry?.name === 'string' && !entry.isDirectory,
          )
          .map(entry => ({ name: entry.name, bytes: entry.size }))
        const merged = mergeMaterial(files, notes)
        setMaterial(merged)
        void loadPreviews(path, merged)
      } catch {
        setMaterial([])
        setPreviews({})
      }
    },
    [loadPreviews],
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
      setError(null)
      setStatus('Opening…')
      try {
        const manifestText = await readTextFile(
          `${root}/${SITE_MANIFEST_FILE}`,
        ).catch(() => '{}')
        const manifest = parseSiteManifest(manifestText)

        const collected: Record<string, string> = {}
        const walk = async (relative: string): Promise<void> => {
          const listing = (await listFiles(
            `${root}/${SITE_PAGES_DIR}${relative ? `/${relative}` : ''}`,
          )) as { entries?: { name?: string; isDirectory?: boolean }[] }
          for (const entry of listing?.entries ?? []) {
            if (!entry?.name) continue
            const next = relative ? `${relative}/${entry.name}` : entry.name
            if (entry.isDirectory) {
              await walk(next)
            } else if (/\.html?$/i.test(entry.name)) {
              collected[next] = await readTextFile(
                `${root}/${SITE_PAGES_DIR}/${next}`,
              )
            }
          }
        }
        await walk('')

        const styles = await readTextFile(`${root}/${SITE_STYLESHEET}`).catch(
          () => createDefaultSiteDocument().styles,
        )

        // The host's manifest is the source when a package has one: it may
        // have been edited by hand or by the agent, and the app should show
        // what will actually ship.
        const dataManifest = await readTextFile(
          `${root}/${SITE_BUILD_DIR}/.herenow/data.json`,
        ).catch(() => '')

        const next: SiteDocument = {
          title: manifest.title,
          pages: Object.keys(collected).length
            ? collected
            : createDefaultSiteDocument().pages,
          styles,
          manifest,
          collections: dataManifest ? parseCollections(dataManifest) : [],
        }
        setDocument(next)
        documentRef.current = next
        boundDocumentRef.current = next
        hashRef.current = siteHash(next)
        drawerRequestRef.current = null
        try {
          const saved = JSON.parse(
            await readTextFile(`${root}/drawer-request.json`),
          ) as DrawerRequest
          if (saved.path === root || saved.outputHash === hashRef.current) {
            saved.path = root
            drawerRequestRef.current = saved
          }
        } catch {
          /* Packages created before drawer requests have no request file. */
        }
        evidenceRef.current = {}
        setEvidence({})
        setUndoOffer(null)
        await history.load(root)
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
        setError(
          openError instanceof Error ? openError.message : String(openError),
        )
      }
    },
    [history, loadMaterial],
  )
  openSitePathRef.current = openSitePath

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
        const assets: Record<string, string> = {}
        for (const name of referencedAssets(html)) {
          const dataUrl = await readBinaryDataUrl(
            `${item.path}/${SITE_ASSETS_DIR}/${name}`,
            4 * 1024 * 1024,
          ).catch(() => null)
          if (dataUrl) assets[name] = dataUrl
        }

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
    if (namedOnceRef.current) return
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
  }, [document.title, lifecycle.doc.path])

  /**
   * Bind the lifecycle to whatever site is open.
   *
   * Opening a package sets the app's own path, but the lifecycle has to be
   * told as well or it keeps saving to the last thing it knew about — and
   * without it `rename` has nothing to rename, which is how a site kept its
   * "Untitled" folder while its manifest carried a real title.
   */
  useEffect(() => {
    if (boundPathRef.current === documentPath) return
    const target = documentPath
    const current = lifecycleRef.current
    void current.flush().finally(() => {
      boundPathRef.current = target
      boundDocumentRef.current = documentRef.current
      if (target) current.adopt(target, { title: documentRef.current.title })
      else current.reset()
    })
  }, [documentPath])

  // A path the lifecycle changed under us (promote, rename) is the real one.
  useEffect(() => {
    const path = lifecycle.doc.path
    if (path && path !== boundPathRef.current) {
      boundPathRef.current = path
      setDocumentPath(path)
    }
  }, [lifecycle.doc.path])

  const createNewSite = useCallback(async (): Promise<void> => {
    namedOnceRef.current = false
    setSwitcherOpen(false)
    const next = createDefaultSiteDocument()
    setDocument(next)
    documentRef.current = next
    boundDocumentRef.current = next
    hashRef.current = siteHash(next)
    history.reset()
    setUndoOffer(null)
    evidenceRef.current = {}
    setEvidence({})
    setDocumentPath(null)
    boundPathRef.current = null
    lifecycleRef.current.reset()
    publishedRef.current = null
    setError(null)
    setDocumentStarted(true)
    setMaterial([])
    setPreviews({})
    setSelectedPage(DEFAULT_HOME_PAGE)
    setSelection(null)
    setWizardOpen(true)
    setStatus('New site.')
    try {
      const path = await lifecycleRef.current.ensureDraft()
      if (path) {
        boundPathRef.current = path
        setDocumentPath(path)
      }
    } catch {
      // Standalone dev: keep the in-memory site.
    }
  }, [history])

  const cancelNewSite = useCallback((): void => {
    // Abandon the run: a draft that comes home to a different number throws
    // its result away rather than landing in whatever is open by then.
    draftRunRef.current += 1
    setWizardBusy(null)
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
      if (!fileName) throw new Error('the file needs a name')
      const binary = await readBinaryBase64(sourcePath)
      try {
        await createFolder(root, SITE_ASSETS_DIR)
      } catch {
        /* already there */
      }
      await writeBinaryFile(
        `${root}/${SITE_ASSETS_DIR}/${fileName}`,
        binary.base64,
      )
      return fileName
    },
    [],
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

  const setAssetRole = useCallback((name: string, role: AssetRole) => {
    setMaterial(items =>
      items.map(item => (item.name === name ? { ...item, role } : item)),
    )
    lifecycleRef.current.markDirty()
  }, [])

  /** A description typed by hand is the author's, not the model's. */
  const describeAsset = useCallback((name: string, description: string) => {
    setMaterial(items =>
      items.map(item =>
        item.name === name ? { ...item, description, described: false } : item,
      ),
    )
    lifecycleRef.current.markDirty()
  }, [])

  /**
   * Give a file the short name it answers to.
   *
   * Only the note changes: pages keep the real path, so nothing that ships
   * moves and a name can be changed as often as it takes to get it right.
   */
  const renameAsset = useCallback((file: string, called: string) => {
    const alias = called.trim()
    setMaterial(items =>
      items.map(item => (item.name === file ? { ...item, alias } : item)),
    )
    lifecycleRef.current.markDirty()
  }, [])

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
    await prepareDrawerRequest(
      'describe',
      'Describe the supplied actual image pixels factually. If pixels cannot be viewed, report that limitation.',
      [],
      undefined,
      true,
    )
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

  const draftFromBrief = useCallback(async (): Promise<number> => {
    await prepareDrawerRequest(
      'draft',
      documentRef.current.manifest.brief,
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
      await writeTextFile(
        `${path}/drawer-request.json`,
        JSON.stringify(request),
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
        await writeTextFile(
          `${path}/drawer-request.json`,
          JSON.stringify(request),
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
        guide: siteDesignGuide(current.manifest.look),
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
      guide: siteDesignGuide(documentRef.current.manifest.look),
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
      await writeTextFile(
        `${request.path}/drawer-request.json`,
        JSON.stringify(request),
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
        await writeTextFile(
          `${request.path}/drawer-request.json`,
          JSON.stringify(request),
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
      await writeTextFile(
        `${request.path}/drawer-request.json`,
        JSON.stringify(request),
      )
      drawerRequestRef.current = request
      return {
        persisted: true,
        hash: request.outputHash,
        complete: false,
        nextAction:
          'checkSite and buildSite; a saved draft is not a verified build or a published site.',
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
        current,
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
            oversizeAssets(html, previews),
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
          oversizeAssets(html, assets),
        ]),
      ),
    })
  }, [findingsFor])

  /**
   * Measure every page whose evidence is stale, in the kit's measuring
   * frame — on-screen but invisible, waited on for fonts, and answering
   * `dead` instead of zeros when the host is hidden. One run at a time; a
   * change during a run queues another.
   */
  const measureRunRef = useRef<Promise<void> | null>(null)
  const measureAgainRef = useRef(false)
  const measureSite = useCallback((): Promise<void> => {
    if (measureRunRef.current) {
      measureAgainRef.current = true
      return measureRunRef.current
    }
    const run = (async () => {
      do {
        measureAgainRef.current = false
        // A hidden host lays nothing out; every page would measure dead.
        if (window.document.visibilityState === 'hidden') break
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
          const mounted = await mountMeasuringFrame(srcdoc, {
            width: box.width,
            height: box.height,
            timeoutMs: 4000,
          })
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
          if (mounted.ok) {
            const frame = mounted.frame
            const read = frame.measure(doc => {
              const root = doc.documentElement
              return {
                height: root.scrollHeight,
                // Wider than the viewport it was given: a sideways scroll
                // at this width, which no page here is allowed.
                overflowX: root.scrollWidth > root.clientWidth + 1,
                fontsStatus: fontsStatusOf(doc),
              }
            }, frame.document.documentElement)
            if (read.ok) {
              next = {
                ...next,
                measured: true,
                ...read.value,
                fontsStatus: frame.fontsLoaded
                  ? read.value.fontsStatus
                  : 'loading',
              }
            }
            frame.dispose()
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

  const saveSite = useCallback(async (): Promise<string> => {
    const lifecycle = lifecycleRef.current
    const path = (await lifecycle.ensureDraft()) ?? boundPathRef.current
    if (!path) throw new Error('the site has no folder to save into')
    await lifecycle.flush({ throwOnError: true })
    boundPathRef.current = path
    setDocumentPath(path)
    return path
  }, [])

  const runBuild = useCallback(async (): Promise<BuildResult & { buildPath: string }> => {
    const root = boundPathRef.current
    if (!root)
      throw new Error(
        'Save the site first, so there is a package to build into.',
      )
    // Nothing leaves the app from a preview that is not the site: the guard
    // re-checks in a visible frame first, then refuses out loud with the
    // reasons — a broken link, a page that scrolls sideways, an asset the
    // preview could not show.
    await lifecycleRef.current.flush({ throwOnError: true })
    const guard = await ensureExportable(() => verifyNow().state, measureSite)
    if (!guard.ok) {
      const verdict = verifyNow()
      throw new SiteExportRefused(exportRefusalMessage(guard, verdict), verdict)
    }
    const current = documentRef.current
    const plan = planBuild(
      current,
      materialRef.current.map(item => item.name),
    )

    buildingRef.current = true
    try {
      await createFolder(root, SITE_BUILD_DIR)
      for (const page of orderedPages(current)) {
        const folder = page.path.includes('/')
          ? page.path.slice(0, page.path.lastIndexOf('/'))
          : ''
        if (folder) {
          await createFolder(`${root}/${SITE_BUILD_DIR}`, folder)
        }
        // What the site promises itself is for the person writing it. A
        // reader gets the sentence with the words intact and no link into
        // nothing, so a page still to be built never ships as a dead end.
        await writeTextFile(
          `${root}/${SITE_BUILD_DIR}/${page.path}`,
          shipPage(current.pages[page.path] ?? '', page.path, Object.keys(current.pages)),
        )
      }
      // What a machine is handed, written from the same sentences as the
      // pages: a plain-text map for assistants, and — once the site has an
      // address — where every page lives, for anything that crawls.
      await writeTextFile(
        `${root}/${SITE_BUILD_DIR}/llms.txt`,
        llmsText(current, linkGraph(current)),
      )
      const base = current.manifest.published?.url
      if (base) {
        await writeTextFile(`${root}/${SITE_BUILD_DIR}/sitemap.xml`, sitemapXml(current, base))
        await writeTextFile(`${root}/${SITE_BUILD_DIR}/robots.txt`, robotsText(base))
      }

      await createFolder(`${root}/${SITE_BUILD_DIR}`, 'styles')
      await writeTextFile(
        `${root}/${SITE_BUILD_DIR}/${SITE_STYLESHEET}`,
        current.styles,
      )

      // The data manifest, when this site holds records and the host it is
      // going to can store them. Written at build time rather than kept in the
      // package by hand, so the app's model stays the single source.
      const provider = dataProviderFor(serviceIdRef.current)
      if (current.collections.length && provider) {
        const folder = provider.manifestPath.includes('/')
          ? provider.manifestPath.slice(
              0,
              provider.manifestPath.lastIndexOf('/'),
            )
          : ''
        if (folder) await createFolder(`${root}/${SITE_BUILD_DIR}`, folder)
        await writeTextFile(
          `${root}/${SITE_BUILD_DIR}/${provider.manifestPath}`,
          provider.render(current.collections),
        )
      }

      // The assets a page actually references, copied as bytes. Without this the
      // build is pages that point at images which are not there — which looks
      // fine in the preview, because the preview inlines them.
      if (plan.assets.length) {
        await createFolder(`${root}/${SITE_BUILD_DIR}`, SITE_ASSETS_DIR)
        for (const name of plan.assets) {
          try {
            const binary = await readBinaryBase64(
              `${root}/${SITE_ASSETS_DIR}/${name}`,
            )
            await writeBinaryFile(
              `${root}/${SITE_BUILD_DIR}/${SITE_ASSETS_DIR}/${name}`,
              binary.base64,
            )
          } catch {
            // Named by a page but unreadable: checkSite already reports it.
          }
        }
      }
      return { ...plan, buildPath: `${root}/${SITE_BUILD_DIR}` }
    } finally {
      buildingRef.current = false
    }
  }, [measureSite, verifyNow])

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
      await lifecycleRef.current.flush({ throwOnError: true })
      const html = documentRef.current.pages[page]
      if (!html) throw new Error('This page has no content to export yet.')
      if (!input.choosePath) await createFolder(root, 'reviews')
      temporary = `${root}/.review-${crypto.randomUUID()}.html`
      await writeTextFile(temporary, reviewHtml(html, root, page))
      setStatus(`Exporting ${page} to ${input.format.toUpperCase()}…`)
      await renderReviewPage(temporary, output, input.format, width)
      setStatus(`Exported ${input.format.toUpperCase()} to ${output}`)
      return { page, format: input.format, outputPath: output, artifactPaths: [output] }
    } finally {
      if (temporary) await deleteFileQuietly(temporary)
      exportBusy.current = false
      setExporting(false)
    }
  }, [selectedPage])

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
          next: current => ({ ...current, styles: css }),
          ...base,
          reason: 'agent-writeStyles',
        }),
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
      restoreRevision,
      checkSite: () =>
        findingsFor(
          documentRef.current,
          materialRef.current.map(item => item.name),
        ),
      saveSite,
      buildSite: runBuild,
      exportPage: exportReview,
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
    selection,
    serviceId,
    setAssetRole,
    verification,
  ])

  usePureSiteAgentTools(ready, agentContext)

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

  /**
   * Take the site to the chosen host.
   *
   * The pages, stylesheet and data manifest are sent from memory — the same
   * strings the build step writes — and asset bytes are read from the
   * package's `assets/` folder at send time. Not from the previews: those
   * exist only for images, and a font sent from memory it was never read
   * into is a font that never uploads.
   */
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
      // The same guard the build runs: nothing goes live from a preview that
      // is not the site. Re-check first, refuse out loud second.
      await lifecycleRef.current.flush()
      const guard = await ensureExportable(() => verifyNow().state, measureSite)
      if (!guard.ok) {
        setPublish(state => ({
          ...state,
          phase: 'error',
          message: exportRefusalMessage(guard, verifyNow()),
        }))
        return
      }
      setPublish(state => ({ ...state, message: 'Publishing…' }))
      const current = documentRef.current
      const files: PublishFile[] = []
      for (const page of orderedPages(current)) {
        files.push({
          path: page.path,
          content: current.pages[page.path] ?? '',
          encoding: 'text',
          contentType: 'text/html; charset=utf-8',
        })
      }
      files.push({
        path: SITE_STYLESHEET,
        content: current.styles,
        encoding: 'text',
        contentType: 'text/css; charset=utf-8',
      })
      // The data manifest ships with the site, or the collections do not
      // exist on the host and every form posts into a 404.
      const provider = dataProviderFor(service.id)
      if (current.collections.length && provider) {
        files.push({
          path: provider.manifestPath,
          content: provider.render(current.collections),
          encoding: 'text',
          contentType: 'application/json',
        })
      }
      for (const item of materialRef.current) {
        try {
          const binary = await readBinaryBase64(
            `${root}/${SITE_ASSETS_DIR}/${item.name}`,
          )
          files.push({
            path: `${SITE_ASSETS_DIR}/${item.name}`,
            content: binary.base64,
            encoding: 'base64',
            contentType: binary.mimeType || 'application/octet-stream',
          })
        } catch {
          // Unreadable: checkSite already reports anything a page references
          // that cannot ship.
        }
      }

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

      const live = await publishSite({
        service,
        files,
        displayName: current.title,
        ...(existing ? { existing } : {}),
        onProgress: progress =>
          setPublish(state => ({ ...state, message: progress.message })),
        shouldCancel: () => publishCancelRef.current,
      })
      // A republish returns no new claim token — the first one is the only
      // one there will ever be, so it is carried forward, not dropped.
      const claimToken = live.claimToken ?? existing?.claimToken
      publishedRef.current = {
        service: service.id,
        slug: live.slug,
        ...(claimToken ? { claimToken } : {}),
      }
      // Written into the manifest through the document lifecycle, so the next
      // session updates this URL instead of minting a new site.
      // Where the site went is not an edit: the door lands it, but it is
      // outside the hash, so it takes no snapshot and never restores.
      applyDocument(latest => ({
        ...latest,
        manifest: {
          ...latest.manifest,
          published: {
            service: service.id,
            slug: live.slug,
            ...(claimToken ? { claimToken } : {}),
            ...(live.siteUrl ? { url: live.siteUrl } : {}),
            at: new Date().toISOString(),
            // What was sent, so the app can say afterwards what has moved
            // since without asking the host.
            pages: fingerprintPages(latest.pages),
          },
        },
      }))
      setPublish(state => ({
        ...state,
        phase: 'live',
        message: `Live at ${live.siteUrl}`,
        live,
      }))
      setStatus(`Published to ${live.siteUrl}`)
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
  }, [applyDocument, measureSite, serviceId, services, verifyNow])

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

  if (bridgeError) {
    return (
      <AppFrame>
        <EmptyState
          tone="error"
          title="Bridge unavailable"
          message={bridgeError.message}
        />
      </AppFrame>
    )
  }

  if (!ready) {
    return (
      <AppFrame>
        <EmptyState
          tone="neutral"
          title="PureSite"
          message="Waiting for shell bridge…"
        />
      </AppFrame>
    )
  }

  const hasOpenSite = documentStarted || documentPath !== null



  return (
    <AppFrame
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
      {!hasOpenSite ? (
        <DocumentSwitcher
          appSlug={SITE_APP_SLUG}
          suffixes={[SITE_PACKAGE_SUFFIX]}
          variant="landing"
          previewStyle="grid"
          loadPreview={loadSitePreview}
          onOpenDocument={(path: string) => void openSitePath(path)}
          onCreateNew={() => void createNewSite()}
          newLabel="New site"
          title="Open a site"
          itemNoun="site"
          itemNounPlural="sites"
        />
      ) : (
        <>
          <SiteBoardView
            document={document}
            pages={pages}
            material={material}
            previews={previews}
            collections={document.collections}
            dataProvider={dataProviderFor(serviceId)}
            onAddFormForCollection={name =>
              agentContext.addFormForCollection(
                { collection: name, page: selectedPage },
                {},
              )
            }
            onDeleteCollection={name => agentContext.deleteCollection(name, {})}
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
            onEditElement={(page, path, outerHtml) => {
              if (documentRef.current.pages[page] === undefined) return
              // The element was serialized from the INLINED preview: its images
              // carry the data URLs the preview put there. Back to assets/ paths
              // first, or megabytes of base64 land in pages/*.html and ship.
              const markup = deinlineMarkup(
                outerHtml,
                previewsRef.current,
                page,
              )
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
                return
              }
              if (!landed.changed) {
                setStatus(
                  'The edited element could not be found — the page may have changed underneath it.',
                )
                return
              }
              setStatus(emptied ? 'Element deleted.' : 'Edited.')
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
              const path = normalizePagePath(`page-${pages.length + 1}`)
              applyDocument(current => addPageTo(current, { path }))
              setSelectedPage(path)
            }}
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
          />

          <NewSiteWizard
            open={wizardOpen}
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
            look={document.manifest.look ?? 'auto'}
            onLook={value =>
              applyDocument(current => ({
                ...current,
                manifest: { ...current.manifest, look: value },
              }))
            }
            material={material}
            previews={previews}
            onAddFiles={() => void addFilesFromDialog()}
            onSetRole={setAssetRole}
            onRenameFile={renameAsset}
            busy={wizardBusy !== null}
            busyLabel={wizardBusy ?? ''}
            onCreate={() => {
              void (async () => {
                try {
                  setWizardBusy('Drafting the first page…')
                  await draftFromBrief()
                } finally {
                  setWizardBusy(null)
                  setWizardOpen(false)
                }
              })()
            }}
            onSkip={() => setWizardOpen(false)}
            onCancel={cancelNewSite}
          />

          <PublishDialog
            open={publishOpen}
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
              applyDocument(current => ({
                ...current,
                manifest: {
                  ...current.manifest,
                  publishTools: on
                    ? [...chosenTools.filter(item => item !== id), id]
                    : chosenTools.filter(item => item !== id),
                },
              }))
            }
            serviceId={serviceId}
            onServiceId={setServiceId}
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
        open={switcherOpen}
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
