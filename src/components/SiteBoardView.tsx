/**
 * The board IS the app.
 *
 * Pages down the left in nav order, the page itself in the middle at a real
 * viewport width, and everything you can change to it on the right. Tabs for
 * Pages and Files sit at the left of the stage head rather than in the
 * shell's toolbar, because they are two views of this one workspace and not
 * two places to be; what they switch is still the left strip.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { styled } from 'styled-components'
import {previewViewport,type PreviewViewport} from '../lib/previewViewport'
import { PageFrame } from './PageFrame'
import { SiteMapOverlay } from './SiteMapOverlay'
import { PromiseSheet } from './PromiseSheet'
import { WorkList } from './WorkList'
import { ChangesSheet } from './ChangesSheet'
import { SelectionAsk } from './SelectionAsk'
import { CommandPalette } from './CommandPalette'
import { QuestionsSheet } from './QuestionsSheet'
import {
  linkGraph,
  linksForPage,
  promiseBrief,
  promiseFor,
  type PromisedPage,
} from '../lib/siteLinks'
import { ASSET_ROLES, type MaterialItem } from '../lib/material'
import { suggestedName, usedOn } from '../lib/assetNames'
import { draftState, draftSummary, liveUrlFor, stateOf } from '../lib/draftState'
import { fetchLivePage } from '../bridge/platformBridge'
import { readElement } from '../lib/pages'
import { APP_ACCENT, VIEWPORTS, type ViewportId } from '../constants'
import { urlPathFor, type SiteDocument, type SitePage } from '../lib/siteDocument'
import type { AssetRole } from '../lib/assetNotes'
import type { CheckFinding } from '../lib/buildSite'
import { siteNeedsData, type Collection, type DataProvider } from '../lib/siteData'
import type { SiteSelection } from '../agents/catalog'
import { verificationBadge, type SiteVerification } from '../lib/siteVerification'
import { revisionLabel, type RevisionEntry } from '@purescience/platform-ui/editing/revisionHistory'


export function SiteBoardView({
  document,
  pages,
  material,
  previews,
  collections,
  dataProvider,
  onAddFormForCollection,
  onDeleteCollection,
  selectedPage,
  pageSelection,
  onPageSelection,
  selection,
  findings,
  verification,
  onRecheck,
  revisions,
  onRestoreRevision,
  statusAction,
  status,
  asking,
  viewport,
  onViewport,
  onPreviewViewport,
  onSelectPage,
  onSelectElement,
  onEditElement,
  onAddPage,
  onBuildPromise,
  onRepointPromise,
  onUnlinkPromise,
  onBuildAllPromises,
  onLinkSelection,
  onSetGoal,
  onDeletePage,
  onMovePage,
  onSetPageTitle,
  onSetElementText,
  onSetElementSrc,
  onAddFiles,
  onSetRole,
  onDescribe,
  onRenameFile,
  onUseFileInstead,
  onDescribeAll,
  describing,
  onAsk,
  onOpenHtml,
  onOpenInBrowser,
  onPublish,
  onExport,
  exporting,
}: {
  document: SiteDocument
  pages: SitePage[]
  material: MaterialItem[]
  previews: Record<string, string>
  collections: Collection[]
  /** The chosen host's storage, when it has any. */
  dataProvider: DataProvider | undefined
  onAddFormForCollection: (collection: string) => void
  onDeleteCollection: (name: string) => void
  selectedPage: string
  /** Pages a request applies to. Empty means just the one on screen. */
  pageSelection: string[]
  onPageSelection: (pages: string[]) => void
  selection: SiteSelection | null
  findings: CheckFinding[]
  /** Whether the preview is the site that ships, and why not yet. */
  verification: SiteVerification
  /** Measure again now — the badge's own affordance while it says "being checked". */
  onRecheck: () => void
  /** Snapshots, newest first: each is the whole site before a change. */
  revisions: RevisionEntry[]
  onRestoreRevision: (file: string) => void
  /** One action beside the status line — Undo, after an ask or agent write. */
  statusAction: { label: string; title?: string; onClick: () => void } | null
  status: string
  asking: boolean
  viewport: ViewportId
  onViewport: (id: ViewportId) => void
  onPreviewViewport: (size:PreviewViewport) => void
  onSelectPage: (page: string) => void
  onSelectElement: (selection: SiteSelection | null) => void
  /** Typing in the page itself: the edited element arrives serialized. */
  onEditElement: (page: string, path: string, outerHtml: string) => void
  onAddPage: () => void
  /** Build a page some link promised, from the sentences that promised it. */
  onBuildPromise: (path: string, title: string, brief: string) => void
  /** Send every link that promised a page at one that exists instead. */
  onRepointPromise: (from: string, to: string) => void
  /** Keep the words, drop the link, wherever the page was promised. */
  onUnlinkPromise: (path: string) => void
  /** Make every promised page at once, as drafts, in one request. */
  onBuildAllPromises: (promises: Array<{ path: string; title: string; brief: string }>) => void
  /** Wrap what is selected in a link, which may promise a page. */
  onLinkSelection: (page: string, path: string, href: string) => void
  /** Name the page the site is for; nothing is guessed on the person's behalf. */
  onSetGoal: (page: string | null) => void
  onDeletePage: (page: string) => void
  onMovePage: (from: number, to: number) => void
  onSetPageTitle: (page: string, title: string) => void
  onSetElementText: (page: string, path: string, text: string) => void
  onSetElementSrc: (page: string, path: string, src: string) => void
  onAddFiles: () => void
  onSetRole: (name: string, role: AssetRole) => void
  /** A description typed by hand — what the file shows, for drafting. */
  onDescribe: (name: string, description: string) => void
  /** Set the short name a file answers to; the markup keeps the real path. */
  onRenameFile: (file: string, called: string) => void
  /** Point every reference to a missing file at one that is here. */
  onUseFileInstead: (missing: string, file: string) => void
  /** Ask the model to look at every undescribed image. */
  onDescribeAll: () => void
  describing: boolean
  onAsk: (request: string) => void
  onOpenHtml: () => void
  onOpenInBrowser: () => void
  onExport: (format: 'pdf' | 'png') => void
  exporting: boolean
  onPublish: () => void
}): React.ReactElement {
  // The site map used to be a column of cards here. The links in the content
  // are the map now, so this strip opens only for what is not a page: the
  // files, and the records a form writes.
  const [tab, setTab] = useState<'none' | 'files' | 'data'>('none')
  const [picking, setPicking] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [workOpen, setWorkOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [questionsOpen, setQuestionsOpen] = useState(false)
  /** Which of the two sites is on the stage. */
  const [side, setSide] = useState<'draft' | 'live' | 'both'>('draft')
  const [livePage, setLivePage] = useState<{ page: string; html: string | null } | null>(null)
  /** A page a link promises, opened from the content or from the map. */
  const [promise, setPromise] = useState<PromisedPage | null>(null)
  const [request, setRequest] = useState('')
  const [filesOpen, setFilesOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyNow = Date.now()

  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize,setStageSize]=useState({width:0,height:0})
  const frame=previewViewport(viewport,stageSize)
  const zoom=frame.scale

  useLayoutEffect(()=>{
    const node=stageRef.current
    if(!node)return
    const measure=()=>{
      const {width,height}=node.getBoundingClientRect()
      if(width<=0||height<=0)return
      setStageSize(current=>current.width===width&&current.height===height?current:{width,height})
    }
    measure()
    const observer=new ResizeObserver(measure)
    observer.observe(node)
    // Keep the window fallback for embedded hosts that miss observer callbacks.
    window.addEventListener('resize',measure)
    return ()=>{observer.disconnect();window.removeEventListener('resize',measure)}
  },[viewport,tab,pages.length])
  useLayoutEffect(()=>{
    onPreviewViewport({id:viewport,width:frame.width,height:frame.height})
  },[viewport,frame.width,frame.height,onPreviewViewport])

  const html = document.pages[selectedPage] ?? ''
  const picked = selection?.page === selectedPage ? selection : null
  const pageFindings = findings.filter(finding => finding.page === selectedPage)
  // What the writing says the site is. The board, the map and the agent tools
  // all read this, so they cannot disagree about what exists.
  const graph = useMemo(() => linkGraph(document), [document])
  const pageLinkage = useMemo(() => linksForPage(graph, selectedPage), [graph, selectedPage])
  const openPromise = (path: string): void => {
    const found = promiseFor(graph, path)
    if (found) setPromise(found)
  }
  /** Where a file is used, said plainly, for the files list. */
  const fileUse = (file: string): string => {
    const pages_ = usedOn(document.pages, file)
    return pages_.length ? `on ${pages_.length} page${pages_.length === 1 ? '' : 's'}` : 'not used yet'
  }
  // What readers have, against what is here. Offline: the fingerprints of
  // the last publish are enough to say what has moved.
  const draft = useMemo(
    () => draftState(document, document.manifest.published),
    [document],
  )
  const liveUrl = liveUrlFor(document.manifest.published, selectedPage)

  // The live page is fetched only when it is asked for, and again whenever
  // the page on screen changes, so what is beside the draft is this page.
  useEffect(() => {
    if (side === 'draft' || !liveUrl) return
    let cancelled = false
    setLivePage({ page: selectedPage, html: null })
    void fetchLivePage(liveUrl).then(html => {
      if (!cancelled) setLivePage({ page: selectedPage, html })
    })
    return () => {
      cancelled = true
    }
  }, [side, liveUrl, selectedPage])

  const errors = findings.filter(finding => finding.severity === 'error')
  // What keeps THIS page from verified, beyond the findings already listed.
  const pageNotes = (verification.pages[selectedPage]?.reasons ?? []).filter(
    reason => !pageFindings.some(finding => finding.message === reason),
  )

  const highlight = useMemo(() => (picked ? [picked.path] : []), [picked])

  /**
   * Data is a tab only when the site is trying to collect something.
   *
   * "The host could store records" is true of every here.now site, so it
   * would put a tab on every site that is only pages — noise on the thing
   * most people are building. A form on a page, or a collection that
   * already exists, means somewhere to put records is a live question.
   */
  const hasForm = useMemo(
    () => Object.values(document.pages).some(html => /<form[\s>]/i.test(html)),
    [document.pages],
  )
  const showData = siteNeedsData({ pages: document.pages, collections })

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // ⌘K belongs to the shell, which jumps between files and apps. Inside
      // the site, ⌘P is the one box for its pages, promises and asks.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setFindOpen(open => !open)
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'm') return
      // Typing in the ask box, a page title or a file description is not a
      // request for the map.
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      setMapOpen(open => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A tab that disappears must not leave the strip showing nothing.
  useEffect(() => {
    if (tab === 'data' && !showData) setTab('none')
  }, [tab, showData])

  const togglePage = useCallback(
    (path: string) => {
      onPageSelection(
        pageSelection.includes(path)
          ? pageSelection.filter(item => item !== path)
          : [...pageSelection, path],
      )
    },
    [pageSelection, onPageSelection],
  )

  /**
   * What "this" means for the next request, said in the rail.
   *
   * An element beats a page selection, and a page selection beats the page on
   * screen — so the person and the agent are never working from different
   * ideas of the scope.
   */
  const scopeHead = picked
    ? 'CHANGE THIS ELEMENT'
    : pageSelection.length > 1
      ? pageSelection.length === pages.length
        ? 'CHANGE THE WHOLE SITE'
        : `CHANGE THESE ${pageSelection.length} PAGES`
      : 'CHANGE THIS PAGE'
  const scopeHint = picked
    ? 'Only what you picked changes.'
    : pageSelection.length > 1
      ? `${pageSelection.length} pages change together.`
      : 'Only this page changes.'

  const submitRequest = useCallback(() => {
    const text = request.trim()
    if (!text || asking) return
    onAsk(text)
    setRequest('')
  }, [request, asking, onAsk])

  /** Where the selected element sits on the stage, and what it says. */
  const [pickedAt, setPickedAt] = useState<{
    text: string
    rect: { x: number; y: number; width: number; height: number }
  } | null>(null)

  const handlePick = useCallback(
    (
      path: string,
      label: string,
      at?: { text: string; rect?: { x: number; y: number; width: number; height: number } },
    ) => {
      onSelectElement({ page: selectedPage, path, label })
      setPicking(false)
      setPickedAt(at?.rect ? { text: at.text, rect: at.rect } : null)
    },
    [onSelectElement, selectedPage],
  )

  return (
    <Board $strip={tab !== 'none'}>
      {tab === 'none' ? null : (
      <Strip>
        {tab === 'data' ? (
          <Files>
            {!dataProvider ? (
              <Hint>
                {collections.length
                  ? 'This site stores records, but the host it publishes to does not. Choose one that does, or the collections will not ship.'
                  : 'The host this site publishes to does not store records.'}
              </Hint>
            ) : null}
            {!collections.length && hasForm ? (
              <Hint>
                A page here has a form and there is nowhere for it to send
                anything yet. Ask for a collection — “store these enquiries:
                name, email, message” — and the form can post to it.
              </Hint>
            ) : null}
            {collections.map(collection => (
              <DataCard key={collection.name}>
                <CardName>{collection.name}</CardName>
                <Mono>
                  {collection.fields.length} field
                  {collection.fields.length === 1 ? '' : 's'} ·{' '}
                  {collection.access.insert === 'public' ? 'anyone submits' : 'owner only'}
                  {collection.access.read === 'public' ? ' · public' : ''}
                </Mono>
                <FieldList>
                  {collection.fields.map(field => (
                    <FieldLine key={field.name}>
                      {field.name}
                      <FieldType>{field.type}</FieldType>
                    </FieldLine>
                  ))}
                </FieldList>
                <Scope>
                  <ScopeButton
                    type="button"
                    disabled={collection.access.insert !== 'public'}
                    title={
                      collection.access.insert === 'public'
                        ? `Put a form on ${selectedPage}`
                        : 'This collection does not accept public submissions'
                    }
                    onClick={() => onAddFormForCollection(collection.name)}
                  >
                    Add a form here
                  </ScopeButton>
                  <DangerButton
                    type="button"
                    onClick={() => onDeleteCollection(collection.name)}
                  >
                    Remove
                  </DangerButton>
                </Scope>
              </DataCard>
            ))}
            {dataProvider?.requiresAccount && collections.length ? (
              <Hint>{dataProvider.accountNote}</Hint>
            ) : null}
          </Files>
        ) : (
          <Files>
            {material.length ? (
              <>
                {/*
                  A description is what drafting composes from — a file
                  without one is a file the site will use badly. The model
                  writes the missing ones by looking; any can be corrected by
                  hand, and a hand edit is kept as the author's.
                */}
                {material.some(
                  item => item.kind === 'image' && !item.description.trim(),
                ) ? (
                  <GhostButton
                    type="button"
                    disabled={describing}
                    onClick={onDescribeAll}
                  >
                    {describing ? 'Looking…' : 'Describe them for me'}
                  </GhostButton>
                ) : null}
                {material.map(item => (
                  <FileRow key={item.name}>
                    {previews[item.name] ? (
                      <FileThumb src={previews[item.name]} alt="" />
                    ) : (
                      <FileKind>{item.kind}</FileKind>
                    )}
                    <FileBody>
                      <CalledRow>
                        <CalledInput
                          value={item.alias ?? ''}
                          placeholder={suggestedName(item.name)}
                          aria-label={`What ${item.name} is called`}
                          onChange={event => onRenameFile(item.name, event.currentTarget.value)}
                        />
                        <FileUse>{fileUse(item.name)}</FileUse>
                      </CalledRow>
                      <FileName title={item.name}>{item.name}</FileName>
                      <DescriptionInput
                        value={item.description}
                        placeholder="What does this show?"
                        aria-label={`Description of ${item.name}`}
                        onChange={event =>
                          onDescribe(item.name, event.currentTarget.value)
                        }
                      />
                      <RoleSelect
                        value={item.role ?? 'content'}
                        aria-label={`What ${item.name} is for`}
                        $set={(item.role ?? 'content') !== 'content'}
                        onChange={event =>
                          onSetRole(item.name, event.currentTarget.value as AssetRole)
                        }
                      >
                        {ASSET_ROLES.map(role => (
                          <option key={role.id} value={role.id}>
                            {role.label}
                          </option>
                        ))}
                      </RoleSelect>
                    </FileBody>
                  </FileRow>
                ))}
              </>
            ) : (
              <Hint>
                Images, a logo, anything the site is made from. Reference one
                from a page as <code>assets/name.png</code>.
              </Hint>
            )}
            <GhostButton type="button" onClick={onAddFiles}>
              Add files…
            </GhostButton>
          </Files>
        )}
      </Strip>
      )}

      <Middle>
        <Head>
          <Tabs>
            <Tab
              type="button"
              onClick={() => setQuestionsOpen(true)}
              title="Put a reader's question to the site and see whether it answers"
            >
              Ask
            </Tab>
            <Tab
              type="button"
              onClick={() => setFindOpen(true)}
              title="Find a page, build a promise, or ask (⌘P)"
            >
              Find
            </Tab>
            <Tab
              type="button"
              onClick={() => setMapOpen(true)}
              title="The whole site, as its links draw it (⌘M)"
            >
              Map
            </Tab>
            <Tab
              type="button"
              data-active={tab === 'files' ? '' : undefined}
              onClick={() => setTab(current => (current === 'files' ? 'none' : 'files'))}
            >
              Files
            </Tab>
            {showData ? (
              <Tab
                type="button"
                data-active={tab === 'data' ? '' : undefined}
                onClick={() => setTab(current => (current === 'data' ? 'none' : 'data'))}
              >
                Data
              </Tab>
            ) : null}
          </Tabs>
          <span style={{ flex: 1 }} />
          <Meta>
            {pages.length} page{pages.length === 1 ? '' : 's'} ·{' '}
            {frame.width}×{frame.height}
            {errors.length ? ` · ${errors.length} to fix` : ''}
          </Meta>
          <DraftChip
            type="button"
            $live={draft.matchesLive}
            onClick={() => setChangesOpen(true)}
            title={
              draft.matchesLive
                ? 'Everything here is what readers have'
                : 'What readers would notice when this is published'
            }
          >
            <span className="dot" />
            {draftSummary(draft)}
          </DraftChip>
          {graph.promised.length ? (
            <PromisedChip
              type="button"
              onClick={() => setWorkOpen(true)}
              title="Pages the writing promises that nobody has built yet"
            >
              {graph.promised.length} to build
            </PromisedChip>
          ) : null}
          {/*
            The preview's honesty, in one word. Verified means every page was
            measured in a visible frame with its fonts loaded and nothing the
            checker knows of will break once live. Being checked names why
            not yet — and is a button, because "check again now" is the
            thing to do about it.
          */}
          <Badge
            type="button"
            $state={verification.state}
            title={
              verification.reasons.join('\n') ||
              'Every page measured in a visible frame with fonts loaded; nothing here will be broken once it is live.'
            }
            onClick={verification.state === 'checking' ? onRecheck : undefined}
            aria-live="polite"
          >
            {verificationBadge(verification)}
          </Badge>
          <ToolbarButton type="button" onClick={onOpenHtml}>
            HTML
          </ToolbarButton>
          <ToolbarButton type="button" onClick={onOpenInBrowser}>
            Open in browser
          </ToolbarButton>
          <ToolbarButton type="button" disabled={exporting} title="Save the current page as a printable PDF for review" onClick={() => onExport('pdf')}>
            {exporting ? 'Exporting…' : 'Export PDF'}
          </ToolbarButton>
          <ToolbarButton type="button" disabled={exporting} title="Save the full current page as a PNG at the preview width" onClick={() => onExport('png')}>
            Export PNG
          </ToolbarButton>
          <PrimaryButton type="button" onClick={onPublish}>
            Publish…
          </PrimaryButton>
        </Head>

        <Stage ref={stageRef}>
          {/* The viewport fills the stage; the page scrolls inside the iframe. */}
          <StagePage data-video-drop-surface style={{ width: frame.width * zoom }}>
            <PageFrame
              html={html}
              styles={document.styles}
              assets={previews}
              page={selectedPage}
              width={frame.width}
              height={frame.height}
              scale={zoom}
              interactive
              knownPages={graph.pages}
              onNavigate={(to, state) => {
                if (state === 'promised') openPromise(to)
                else onSelectPage(to)
              }}
              picking={picking}
              highlight={highlight}
              onPick={handlePick}
              onEdit={(path, outerHtml) =>
                onEditElement(selectedPage, path, outerHtml)
              }
            />
            {selection && selection.page === selectedPage && pickedAt ? (
            <SelectionAsk
              document={document}
              page={selectedPage}
              label={selection.label || 'thing'}
              text={pickedAt.text}
              at={{
                x: pickedAt.rect.x * zoom,
                y: pickedAt.rect.y * zoom,
                width: pickedAt.rect.width * zoom,
                height: pickedAt.rect.height * zoom,
              }}
              busy={asking}
              onAsk={request => {
                setPickedAt(null)
                onAsk(request)
              }}
              onLink={href => {
                setPickedAt(null)
                onLinkSelection(selectedPage, selection.path, href)
              }}
              onDismiss={() => {
                setPickedAt(null)
                onSelectElement(null)
              }}
            />
          ) : null}
          </StagePage>
        </Stage>

        <Foot>
          {document.manifest.published?.url ? (
            <Sides role="group" aria-label="Which site to show">
              {(['draft', 'both', 'live'] as const).map(option => (
                <SideButton
                  key={option}
                  type="button"
                  aria-pressed={side === option}
                  onClick={() => setSide(option)}
                >
                  {option === 'draft' ? 'Draft' : option === 'both' ? 'Side by side' : 'Live'}
                </SideButton>
              ))}
            </Sides>
          ) : null}
          <Sizes>
            {VIEWPORTS.map(item => (
              <SizeButton
                key={item.id}
                type="button"
                $on={item.id === viewport}
                title={item.id==='desktop'?'Fill available space':`${item.width}px wide`}
                onClick={() => onViewport(item.id)}
              >
                {item.label}
              </SizeButton>
            ))}
          </Sizes>
          <span style={{ flex: 1 }} />
          <PickToggle type="button" $on={picking} onClick={() => setPicking(!picking)}>
            {picking ? 'Picking elements' : 'Pick elements'}
          </PickToggle>
        </Foot>

        <StatusFoot>
          <Mono role="status">
            {status || urlPathFor(selectedPage)}
            {zoom < 1 ? ` · ${Math.round(zoom * 100)}% of ${frame.width}px` : ''}
          </Mono>
          {statusAction ? (
            <StatusAction
              type="button"
              title={statusAction.title}
              aria-label={statusAction.title ?? statusAction.label}
              onClick={statusAction.onClick}
            >
              {statusAction.label}
            </StatusAction>
          ) : null}
        </StatusFoot>
      </Middle>

      <Rail>
        <RailHead>
          <Mono>{selectedPage}</Mono>
          <span style={{ flex: 1 }} />
          <Faint>{urlPathFor(selectedPage)}</Faint>
        </RailHead>

        <Field>
          <Label htmlFor="page-title">Page title</Label>
          <Input
            id="page-title"
            value={pages.find(page => page.path === selectedPage)?.title ?? ''}
            onChange={event => onSetPageTitle(selectedPage, event.currentTarget.value)}
          />
        </Field>

        <Ops>
          <ScopeButton
            type="button"
            title="Earlier in the list here. The menu readers see is the links in each page's header."
            disabled={pages.findIndex(page => page.path === selectedPage) <= 0}
            onClick={() => {
              const index = pages.findIndex(page => page.path === selectedPage)
              onMovePage(index, index - 1)
            }}
          >
            ↑ Move
          </ScopeButton>
          <ScopeButton
            type="button"
            title="Later in the list here. The menu readers see is the links in each page's header."
            disabled={
              pages.findIndex(page => page.path === selectedPage) >= pages.length - 1
            }
            onClick={() => {
              const index = pages.findIndex(page => page.path === selectedPage)
              onMovePage(index, index + 1)
            }}
          >
            ↓ Move
          </ScopeButton>
          <DangerButton
            type="button"
            disabled={pages.length <= 1}
            onClick={() => onDeletePage(selectedPage)}
          >
            Delete
          </DangerButton>
        </Ops>

        {picked ? (
          <>
            <SectionLabel>SELECTED · {picked.label}</SectionLabel>
            <PickedControls
              html={html}
              picked={picked}
              material={material}
              onText={text => onSetElementText(selectedPage, picked.path, text)}
              onSrc={src => onSetElementSrc(selectedPage, picked.path, src)}
              onClear={() => onSelectElement(null)}
            />
          </>
        ) : null}

        {pageFindings.length || pageNotes.length ? (
          <>
            <SectionLabel>THIS PAGE</SectionLabel>
            <Findings>
              {pageFindings.map((finding, index) => (
                <Finding key={`${finding.code}-${index}`} $error={finding.severity === 'error'}>
                  <strong>{finding.message}</strong>
                  <span>{finding.fix}</span>
                </Finding>
              ))}
              {pageNotes.map(note => (
                <Finding key={note} $error={verification.pages[selectedPage]?.state === 'failed'}>
                  <strong>{note}</strong>
                </Finding>
              ))}
            </Findings>
          </>
        ) : null}

        <SectionLabel>{scopeHead}</SectionLabel>
        <Scope>
          <ScopeButton
            type="button"
            onClick={() =>
              onPageSelection(
                pageSelection.length === pages.length
                  ? []
                  : pages.map(page => page.path),
              )
            }
          >
            {pageSelection.length === pages.length
              ? 'Whole site'
              : 'Select all pages'}
          </ScopeButton>
          {pageSelection.length ? (
            <ScopeButton type="button" onClick={() => onPageSelection([])}>
              Clear ({pageSelection.length})
            </ScopeButton>
          ) : null}
        </Scope>
        <FileDrawer>
          <Disclosure
            type="button"
            disabled={!revisions.length}
            aria-expanded={historyOpen && revisions.length > 0}
            onClick={() => setHistoryOpen(open => !open)}
          >
            <Caret $open={historyOpen && revisions.length > 0}>▸</Caret>
            <Meta>
              {revisions.length
                ? `History · ${revisions.length} version${revisions.length === 1 ? '' : 's'}`
                : 'No history yet'}
            </Meta>
          </Disclosure>
        </FileDrawer>
        {historyOpen && revisions.length ? (
          <HistoryRows>
            <Faint>
              Each entry is the whole site before that change. Restoring keeps
              the current version too, and never changes where the site is
              published.
            </Faint>
            {revisions.map(entry => {
              const label = revisionLabel(entry, historyNow)
              return (
                <HistoryRow key={entry.file}>
                  <HistoryLabel title={`${entry.file} · ${entry.textChars} text chars`}>
                    {label}
                  </HistoryLabel>
                  <ScopeButton
                    type="button"
                    aria-label={`Restore the version from ${label}`}
                    title={`Put back the version from ${label} (${entry.textChars} text chars)`}
                    onClick={() => onRestoreRevision(entry.file)}
                  >
                    Restore
                  </ScopeButton>
                </HistoryRow>
              )
            })}
          </HistoryRows>
        ) : null}
        <FileDrawer>
          <Disclosure
            type="button"
            disabled={!material.length}
            aria-expanded={filesOpen && material.length > 0}
            onClick={() => setFilesOpen(open => !open)}
          >
            <Caret $open={filesOpen && material.length > 0}>▸</Caret>
            <Meta>
              {material.length
                ? `${material.length} file${material.length === 1 ? '' : 's'}`
                : 'No files yet'}
            </Meta>
          </Disclosure>
          <span style={{ flex: 1 }} />
          <ScopeButton type="button" onClick={onAddFiles}>
            Add files…
          </ScopeButton>
        </FileDrawer>
        {material.length > 0 && filesOpen ? (
          <AssetRow>
            {material.map(item => (
              <AssetChip
                key={item.name}
                type="button"
                title={item.reference}
                onClick={() =>
                  setRequest(current =>
                    current.includes(item.reference)
                      ? current
                      : `${current}${current.trim() ? ' ' : ''}${item.reference} `,
                  )
                }
              >
                {previews[item.name] ? (
                  <AssetThumb src={previews[item.name]} alt="" />
                ) : (
                  <AssetKind>{item.kind}</AssetKind>
                )}
                <AssetName>{item.name}</AssetName>
              </AssetChip>
            ))}
          </AssetRow>
        ) : null}

        <AskBox>
          <AskInput
            value={request}
            placeholder={
              picked
                ? 'Make this two lines, and give it more room above…'
                : pageSelection.length > 1
                  ? 'Give every one of these the same footer…'
                  : 'Add an about page with the three services…'
            }
            spellCheck={false}
            onChange={event => setRequest(event.currentTarget.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                submitRequest()
              }
            }}
          />
          <AskBoxFoot>
            <AskHint>{asking ? 'Working…' : scopeHint}</AskHint>
            <span style={{ flex: 1 }} />
            <Kbd>⌘⏎</Kbd>
            <SendButton
              type="button"
              aria-label="Send"
              disabled={!request.trim() || asking}
              onClick={submitRequest}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4z" />
              </svg>
            </SendButton>
          </AskBoxFoot>
        </AskBox>
      </Rail>
      {questionsOpen ? (
        <QuestionsSheet
          document={document}
          graph={graph}
          onOpenPage={page => {
            setQuestionsOpen(false)
            onSelectPage(page)
          }}
          onBuildPromise={path => {
            setQuestionsOpen(false)
            openPromise(path)
          }}
          onAsk={request => {
            setQuestionsOpen(false)
            onAsk(request)
          }}
          onClose={() => setQuestionsOpen(false)}
        />
      ) : null}

      {findOpen ? (
        <CommandPalette
          document={document}
          graph={graph}
          onOpenPage={onSelectPage}
          onBuildPromise={openPromise}
          onOpenMap={() => setMapOpen(true)}
          onOpenWork={() => setWorkOpen(true)}
          onAddPage={onAddPage}
          onAsk={onAsk}
          onClose={() => setFindOpen(false)}
        />
      ) : null}

      {changesOpen ? (
        <ChangesSheet
          document={document}
          draft={draft}
          onOpenPage={page => {
            setChangesOpen(false)
            onSelectPage(page)
          }}
          onCompare={page => {
            setChangesOpen(false)
            onSelectPage(page)
            setSide('both')
          }}
          onPublish={() => {
            setChangesOpen(false)
            onPublish()
          }}
          onClose={() => setChangesOpen(false)}
        />
      ) : null}

      {workOpen ? (
        <WorkList
          document={document}
          graph={graph}
          findings={findings}
          material={material}
          onUseFileInstead={onUseFileInstead}
          onBuild={found => {
            setWorkOpen(false)
            onBuildPromise(found.path, found.title, promiseBrief(document, found))
          }}
          onBuildAll={all => {
            setWorkOpen(false)
            onBuildAllPromises(
              all.map(found => ({
                path: found.path,
                title: found.title,
                brief: promiseBrief(document, found),
              })),
            )
          }}
          onOpenPage={page => {
            setWorkOpen(false)
            onSelectPage(page)
          }}
          onAddFiles={() => {
            setWorkOpen(false)
            onAddFiles()
          }}
          onClose={() => setWorkOpen(false)}
        />
      ) : null}

      {mapOpen ? (
        <SiteMapOverlay
          document={document}
          previews={previews}
          graph={graph}
          home={pages[0]?.path ?? selectedPage}
          selectedPage={selectedPage}
          publishState={page => stateOf(draft, page)}
          revisions={revisions}
          onRestoreRevision={onRestoreRevision}
          chosenPages={pageSelection}
          onChoosePage={togglePage}
          onOpenPage={page => {
            onSelectPage(page)
            setMapOpen(false)
          }}
          onOpenPromise={found => {
            setPromise(found)
            setMapOpen(false)
          }}
          onAddPage={() => {
            onAddPage()
            setMapOpen(false)
          }}
          onSetGoal={onSetGoal}
          onClose={() => setMapOpen(false)}
        />
      ) : null}

      {promise ? (
        <PromiseSheet
          promise={promise}
          document={document}
          onClose={() => setPromise(null)}
          onBuild={() => {
            const chosen = promise
            setPromise(null)
            onBuildPromise(chosen.path, chosen.title, promiseBrief(document, chosen))
          }}
          onRepoint={to => {
            const chosen = promise
            setPromise(null)
            onRepointPromise(chosen.path, to)
          }}
          onUnlink={() => {
            const chosen = promise
            setPromise(null)
            onUnlinkPromise(chosen.path)
          }}
        />
      ) : null}
    </Board>
  )
}

/**
 * What you can do to the element you clicked.
 *
 * Text on a leaf, a picture on an image or an empty box. A container offers
 * nothing, because the honest answer for one is "edit the HTML".
 */
function PickedControls({
  html,
  picked,
  material,
  onText,
  onSrc,
  onClear,
}: {
  html: string
  picked: SiteSelection
  material: MaterialItem[]
  onText: (text: string) => void
  onSrc: (src: string) => void
  onClear: () => void
}): React.ReactElement {
  // The same reading the tests cover — not a second hand-rolled walk.
  const info = useMemo(() => readElement(html, picked.path), [html, picked.path])

  const images = material.filter(item => item.kind === 'image')

  if (!info) {
    return <Hint>That element is gone — pick another.</Hint>
  }

  return (
    <Picked>
      {info.editableText ? (
        <Input
          value={info.text}
          aria-label="Element text"
          onChange={event => onText(event.currentTarget.value)}
        />
      ) : null}
      {info.isImage || (!info.editableText && !info.isImage) ? (
        <RoleSelect
          $set={false}
          value=""
          aria-label="Put an image here"
          onChange={event => {
            if (event.currentTarget.value) onSrc(event.currentTarget.value)
          }}
        >
          <option value="">
            {info.isImage ? 'Replace image…' : 'Put an image here…'}
          </option>
          {images.map(item => (
            <option key={item.name} value={item.reference}>
              {item.name}
            </option>
          ))}
        </RoleSelect>
      ) : null}
      {!info.editableText && !info.isImage ? (
        <Hint>
          A container holds other elements — change it in the HTML, or ask.
        </Hint>
      ) : null}
      <ScopeButton type="button" onClick={onClear}>
        Clear selection
      </ScopeButton>
    </Picked>
  )
}

/** Typed loosely on purpose: styled-components' attrs rejects data-* literals. */
const chrome = (kind: string, extra: Record<string, string> = {}): Record<string, string> => ({
  'data-chrome': kind,
  ...extra,
})

/** Site map on the left, the page in the middle, the inspector on the right: two platform sidebars. */
const Board = styled.div<{ $strip: boolean }>`
  display: grid;
  /* With no page column, the page itself gets that width back. */
  grid-template-columns: ${({ $strip }) =>
    $strip ? 'auto minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto'};
  height: 100%;
  min-height: 0;
`

const Strip = styled.aside.attrs(chrome('sidebar'))`
  gap: 12px;
  padding: 12px var(--pure-chrome-inset) 16px;
`

const Tabs = styled.div`
  display: inline-flex;
  gap: 2px;
`

/** A 28px toolbar control; data-active marks the open tab. */
const Tab = styled.button.attrs(chrome('toolbar-control'))``








const CardName = styled.span`
  font-size: var(--pure-chrome-ui-size);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`


const Scope = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`



const DataCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 11px 12px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  background: var(--pure-chrome-surface);
`

const FieldList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const FieldLine = styled.span`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--pure-chrome-ui-size);
`

const FieldType = styled.span.attrs(chrome('meta'))``

const Files = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

/** One file per platform list row; the sidebar already insets it. */
const FileRow = styled.div.attrs(chrome('list-row'))`
  && {
    gap: 10px;
    padding: 6px 0;
  }
`

const FileThumb = styled.img`
  width: 56px;
  height: 40px;
  object-fit: contain;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  background: var(--pure-chrome-well);
`

const FileKind = styled.span.attrs(chrome('meta'))`
  width: 56px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
`

const FileBody = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const CalledRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
`
const CalledInput = styled.input.attrs(chrome('field'))`
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: var(--platform-typography-font-size-sm);
  font-weight: var(--platform-typography-font-weight-bold);
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  &:hover,
  &:focus {
    border-color: var(--pure-chrome-line);
    background: var(--pure-chrome-well);
  }
`
const FileUse = styled.span.attrs(chrome('meta'))`
  white-space: nowrap;
`
const FileName = styled.span`
  font-size: var(--pure-chrome-ui-size);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/** The toolbar runs edge to edge; the stage and its feet keep the 20px desk margin. */
const Middle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  padding-bottom: 16px;

  > * {
    margin: 0 20px;
  }
  > [data-chrome='toolbar'] {
    margin: 0;
  }
`

/** The one bar above the page: the platform's 36px editor toolbar. */
const Head = styled.div.attrs(chrome('toolbar'))`
  gap: 8px;
`

const ToolbarButton = styled.button.attrs(chrome('toolbar-control'))``

const Sizes = styled.div`
  display: inline-flex;
  gap: 4px;
`

const SizeButton = styled.button<{ $on: boolean }>`
  height: var(--pure-chrome-control-height);
  padding: 0 10px;
  border: 1px solid
    ${props => (props.$on ? APP_ACCENT : 'var(--pure-chrome-line)')};
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  background: ${props => (props.$on ? APP_ACCENT : 'transparent')};
  color: ${props => (props.$on ? 'var(--pure-chrome-on-accent)' : 'var(--platform-colors-text)')};
`

const Stage = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  justify-content: center;
  padding: 0;
  border-radius: 0;
  background: var(--pure-chrome-well);
`

const StagePage = styled.div`
  /* The ask that appears beside a selection is positioned against this, so
     the coordinates the frame reports land where the element actually is. */
  position: relative;
  flex: none;
  border-radius: 0;

  background: #ffffff;
  align-self: flex-start;
`

const Foot = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const StatusFoot = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

/** The page's inspector: the platform's right sidebar. */
const Rail = styled.aside.attrs(chrome('sidebar', { 'data-side': 'right' }))`
  gap: 12px;
  padding: 12px var(--pure-chrome-inset) 16px;
`

const RailHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`

const Label = styled.label`
  color: var(--pure-chrome-soft);
`

const Input = styled.input.attrs(chrome('field'))``

const Ops = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
`

const SectionLabel = styled.div.attrs(chrome('section-label'))`
  && {
    padding: 10px 0 0;
    border-top: 1px solid var(--pure-chrome-line);
  }
`

const Picked = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Findings = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Finding = styled.div<{ $error: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--pure-chrome-radius);
  font-size: var(--pure-chrome-ui-size);
  line-height: 1.45;
  background: ${props =>
    props.$error
      ? 'var(--platform-colors-danger-surface, rgb(180 52 14 / 0.1))'
      : 'var(--pure-chrome-well)'};
  color: ${props =>
    props.$error ? 'var(--platform-colors-danger)' : 'var(--pure-chrome-soft)'};

  strong {
    font-weight: 600;
  }
`

const FileDrawer = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const Disclosure = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }
`

const Caret = styled.span<{ $open: boolean }>`
  font-size: 9px;
  line-height: 1;
  color: var(--pure-chrome-muted);
  transform: rotate(${props => (props.$open ? '90deg' : '0deg')});
  transition: transform 120ms ease;

  ${Disclosure}:disabled & {
    opacity: 0;
  }
`

const AssetRow = styled.div`
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
`

const AssetChip = styled.button`
  flex: none;
  width: 66px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
`

const AssetThumb = styled.img`
  width: 66px;
  height: 40px;
  object-fit: contain;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  background: var(--pure-chrome-well);
`

const AssetKind = styled.span.attrs(chrome('meta'))`
  width: 66px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
`

const AssetName = styled.span.attrs(chrome('meta'))`
  overflow: hidden;
  text-overflow: ellipsis;
`

const AskBox = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid var(--pure-chrome-line);
  border-radius: var(--pure-chrome-radius);
  background: var(--pure-chrome-surface);
`

const AskInput = styled.textarea`
  min-height: 40px;
  resize: vertical;
  padding: 10px 12px 4px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12px;
  outline: none;
`

const AskBoxFoot = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 8px 12px;
`

const AskHint = styled.span.attrs(chrome('meta'))`
  line-height: 1.4;
  white-space: normal;
`

const Kbd = styled.span`
  font-family: var(--platform-typography-font-family-mono);
  font-size: 10px;
  padding: 2px 5px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  color: var(--pure-chrome-muted);
`

const SendButton = styled.button`
  flex: none;
  width: var(--pure-chrome-control-height);
  height: var(--pure-chrome-control-height);
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: ${APP_ACCENT};
  color: var(--pure-chrome-on-accent);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

const Hint = styled.span`
  font-size: var(--pure-chrome-ui-size);
  color: var(--pure-chrome-soft);
  line-height: 1.5;
`

const Meta = styled.div.attrs(chrome('meta'))``
/**
 * Which of the two sites you are looking at.
 *
 * Amber says work nobody else can see; grey says this is what readers have.
 * One rule, one place, so the answer is never a guess.
 */
const Sides = styled.div`
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--pure-chrome-well);
`
const SideButton = styled.button`
  font: inherit;
  font-size: var(--platform-typography-font-size-xs);
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 0;
  background: none;
  color: var(--pure-chrome-muted);
  cursor: pointer;
  &[aria-pressed='true'] {
    background: var(--pure-chrome-paper);
    color: var(--platform-colors-text);
    font-weight: var(--platform-typography-font-weight-bold);
  }
`
/** Which side of the comparison a frame is. */
const SideLabel = styled.div<{ $live?: boolean }>`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 2px;
  font-size: var(--platform-typography-font-size-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $live }) => ($live ? 'var(--pure-chrome-muted)' : 'var(--pure-attention-text)')};
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${({ $live }) =>
      $live ? 'var(--pure-chrome-muted)' : 'var(--pure-attention-text)'};
  }
`
const Waiting = styled.div`
  display: grid;
  place-items: center;
  padding: 24px;
  text-align: center;
  border-radius: 8px;
  background: var(--pure-chrome-well);
  color: var(--pure-chrome-muted);
  font-size: var(--platform-typography-font-size-sm);
`
const DraftChip = styled.button.attrs(chrome('meta'))<{ $live: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font: inherit;
  font-size: var(--platform-typography-font-size-xs);
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid
    ${({ $live }) =>
      $live
        ? 'var(--pure-chrome-line)'
        : 'color-mix(in srgb, var(--pure-attention-text) 45%, transparent)'};
  background: ${({ $live }) => ($live ? 'transparent' : 'var(--pure-attention-muted)')};
  color: ${({ $live }) => ($live ? 'var(--pure-chrome-muted)' : 'var(--pure-attention-text)')};
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${({ $live }) => ($live ? 'var(--pure-chrome-muted)' : 'var(--pure-attention-text)')};
  }
`
/** How many pages the writing promises that nobody has built. */
const PromisedChip = styled.button.attrs(chrome('meta'))`
  font: inherit;
  font-size: var(--platform-typography-font-size-xs);
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--pure-attention-text) 45%, transparent);
  background: var(--pure-attention-muted);
  color: var(--pure-attention-text);
  cursor: pointer;
  white-space: nowrap;
`

const Mono = styled.div.attrs(chrome('meta'))`
  white-space: normal;
`

const Faint = styled.span.attrs(chrome('meta'))``

const DescriptionInput = styled.input.attrs(chrome('field'))`
  width: 100%;
`

const RoleSelect = styled.select<{ $set: boolean }>`
  width: 100%;
  height: var(--pure-chrome-control-height);
  padding: 0 8px;
  border: 1px solid
    ${props =>
      props.$set ? 'var(--pure-chrome-accent)' : 'var(--pure-chrome-line)'};
  border-radius: 7px;
  background: var(--pure-chrome-surface);
  color: ${props =>
    props.$set ? 'var(--pure-chrome-accent)' : 'var(--pure-chrome-soft)'};
  font: inherit;
  font-size: 12px;
`

/** A 28px outlined button on the platform radius, wherever it sits. */
const GhostButton = styled.button`
  height: var(--pure-chrome-control-height);
  padding: 0 12px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 7px;
  background: var(--pure-chrome-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`

const ScopeButton = styled(GhostButton)`
  padding: 0 10px;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

const DangerButton = styled(ScopeButton)`
  color: var(--platform-colors-danger);
`

const PickToggle = styled(GhostButton)<{ $on: boolean }>`
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-label-size);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-color: ${props => (props.$on ? APP_ACCENT : 'var(--pure-chrome-line)')};
  background: ${props => (props.$on ? APP_ACCENT : 'var(--pure-chrome-surface)')};
  color: ${props => (props.$on ? 'var(--pure-chrome-on-accent)' : 'var(--platform-colors-text)')};
`

/** The toolbar's one primary control: the accent's third and last appearance. */
const PrimaryButton = styled.button`
  height: var(--pure-chrome-control-height);
  padding: 0 14px;
  border: 0;
  border-radius: 7px;
  background: ${APP_ACCENT};
  color: var(--pure-chrome-on-accent);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

/** A 28px outlined toolbar select that says how honest the preview is. */
const Badge = styled.button.attrs(chrome('toolbar-select'))<{
  $state: 'verified' | 'checking' | 'failed'
}>`
  && {
    border-color: ${props =>
      props.$state === 'failed' ? 'var(--platform-colors-danger)' : 'var(--pure-chrome-line)'};
    background: ${props =>
      props.$state === 'failed'
        ? 'var(--platform-colors-danger-surface, rgb(180 52 14 / 0.1))'
        : 'transparent'};
    color: ${props =>
      props.$state === 'failed'
        ? 'var(--platform-colors-danger)'
        : props.$state === 'checking'
          ? 'var(--pure-chrome-soft)'
          : 'var(--platform-colors-text)'};
    cursor: ${props => (props.$state === 'checking' ? 'pointer' : 'default')};
    white-space: nowrap;
  }
`

const StatusAction = styled.button`
  margin-left: auto;
  padding: 2px 10px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  background: var(--pure-chrome-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`

const HistoryRows = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid var(--pure-chrome-line);
  border-radius: var(--pure-chrome-radius);
  overflow: hidden;
`

/** One version per platform list row. */
const HistoryRow = styled.div.attrs(chrome('list-row'))`
  && {
    gap: 8px;
    padding: 0 10px;
  }
  &:last-child {
    border-bottom: 0;
  }
`

const HistoryLabel = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`
