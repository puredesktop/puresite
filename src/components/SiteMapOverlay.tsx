import { useEffect, useMemo, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { siteLinkTheme } from './siteLinkTheme'
import { PageFrame } from './PageFrame'
import { mapLayout, type MapNode } from '../lib/siteMapLayout'
import { health, journeys, reach } from '../lib/siteLenses'
import { revisionLabel, type RevisionEntry } from '@purescience/platform-ui/editing/revisionHistory'

/** How wide a page looks on the map when it is shown as itself. */
const THUMB_WIDTH = 150
import type { PromisedPage, SiteLinkGraph } from '../lib/siteLinks'
import { titleFromPage, urlPathFor, type SiteDocument } from '../lib/siteDocument'

/**
 * The site as its links draw it.
 *
 * This is the page list's replacement, and it is not a list: home in the
 * middle, everything at its distance from home, promises dotted on the ring
 * past whoever promised them, and the pages nothing points at set apart along
 * the bottom where they cannot pretend to belong. It opens when you ask for it
 * (⌘M) and closes on Escape, so it costs no width while you are writing.
 */
export function SiteMapOverlay({
  document: siteDocument,
  previews,
  graph,
  home,
  selectedPage,
  publishState,
  revisions,
  onRestoreRevision,
  chosenPages,
  onChoosePage,
  onOpenPage,
  onOpenPromise,
  onAddPage,
  onSetGoal,
  onClose,
}: {
  document: SiteDocument
  /** Asset file name to data URL, so a page can be shown as it looks. */
  previews: Record<string, string>
  graph: SiteLinkGraph
  /** The page a reader arrives on. */
  home: string
  selectedPage: string
  /** Snapshots of the whole site, newest first. */
  revisions: RevisionEntry[]
  /** Lift the site back into an older shape. */
  onRestoreRevision: (file: string) => void
  /** Whether each page is new, changed or what readers already have. */
  publishState: (page: string) => 'new' | 'changed' | 'same' | 'removed'
  /** Pages ticked to be changed together; empty means just the one on screen. */
  chosenPages: string[]
  onChoosePage: (page: string) => void
  onOpenPage: (page: string) => void
  onOpenPromise: (promise: PromisedPage) => void
  /** A page nothing asked for yet — rare, but the way to start an island. */
  onAddPage: () => void
  /** Name the page the site is for, which is what Journeys measures against. */
  onSetGoal: (page: string | null) => void
  onClose: () => void
}): React.ReactElement {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 1000, height: 640 })
  const [hovered, setHovered] = useState<string | null>(null)
  const [find, setFind] = useState('')
  /** Which question the map is answering. */
  const [lens, setLens] = useState<'structure' | 'journeys' | 'health' | 'reach' | 'growth'>(
    'structure',
  )
  /**
   * How far in you are.
   *
   * The map and the page are the same canvas at different distances: pull
   * back and the site is a shape, push in and a page becomes itself. Past
   * the last stop, opening it is the only thing left to do, so that is what
   * happens.
   */
  const [zoom, setZoom] = useState(1)
  /** Show only what the page on screen reaches, and what reaches it. */
  const [near, setNear] = useState(false)

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    const measure = (): void => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setBox({ width: rect.width, height: rect.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Narrowing is done on the graph, before the layout, so what is left is
  // drawn as its own shape rather than as gaps in a bigger one.
  const shown = useMemo(() => {
    if (!near) return graph
    const keep = new Set([selectedPage])
    for (const link of graph.links) {
      if (link.fromPage === selectedPage) keep.add(link.target)
      if (link.target === selectedPage) keep.add(link.fromPage)
    }
    return {
      ...graph,
      pages: graph.pages.filter(page => keep.has(page)),
      links: graph.links.filter(link => keep.has(link.fromPage) && keep.has(link.target)),
      promised: graph.promised.filter(entry => keep.has(entry.path)),
      orphans: graph.orphans.filter(page => keep.has(page)),
    }
  }, [graph, near, selectedPage])

  const map = useMemo(
    () => mapLayout(shown, near ? selectedPage : home, { width: box.width, height: box.height }),
    [shown, home, near, selectedPage, box.width, box.height],
  )
  const at = useMemo(() => new Map(map.nodes.map(node => [node.path, node])), [map])
  // A live frame per page is what made the old cards worth looking at. Past a
  // dozen they cost more than they say, so the map falls back to names.
  const thumbnails = map.nodes.length <= 12
  const chosen = useMemo(() => new Set(chosenPages), [chosenPages])

  const label = (node: MapNode): string => {
    if (node.kind === 'promised') {
      return graph.promised.find(entry => entry.path === node.path)?.title ?? node.path
    }
    return titleFromPage(siteDocument.pages[node.path] ?? '') || node.path
  }

  // Each lens is a reading of the same pages, worked out once per view.
  const goal = siteDocument.manifest.goal ?? null
  const ways = useMemo(() => journeys(graph, home, goal), [graph, home, goal])
  const ailing = useMemo(() => health(siteDocument, graph), [siteDocument, graph])
  const unreachable = useMemo(() => reach(siteDocument), [siteDocument])
  const noteFor = (page: string): string => {
    if (lens === 'journeys') {
      const way = ways.pages.find(entry => entry.page === page)
      if (!way) return ''
      if (page === goal) return 'what the site is for'
      if (way.to < 0) return goal ? 'no way on to the goal' : ''
      return `${way.to} click${way.to === 1 ? '' : 's'} to the goal`
    }
    if (lens === 'health') {
      return ailing.find(note => note.page === page)?.says ?? ''
    }
    if (lens === 'reach') {
      const notes = unreachable.filter(note => note.page === page)
      return notes.length ? notes.map(note => note.says)[0]! : 'nothing in the way'
    }
    return ''
  }
  const troubled = (page: string): boolean => {
    if (lens === 'journeys') return ways.stranded.includes(page)
    if (lens === 'health') return ailing.some(note => note.page === page)
    if (lens === 'reach') return unreachable.some(note => note.page === page)
    return false
  }

  const query = find.trim().toLowerCase()
  const matches = (node: MapNode): boolean =>
    !query || `${label(node)} ${node.path}`.toLowerCase().includes(query)

  const open = (node: MapNode): void => {
    if (node.kind === 'promised') {
      const promise = graph.promised.find(entry => entry.path === node.path)
      if (promise) onOpenPromise(promise)
      return
    }
    onOpenPage(node.path)
  }

  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label="The site map">
        <Head>
          <div>
            <Title>{siteDocument.manifest.title}</Title>
            <Sub>
              {graph.pages.length} page{graph.pages.length === 1 ? '' : 's'}
              {graph.promised.length ? ` · ${graph.promised.length} promised by a link` : ''}
              {graph.orphans.length ? ` · ${graph.orphans.length} nothing links to` : ''}
            </Sub>
          </div>
          <span style={{ flex: 1 }} />
          {chosenPages.length ? (
            <Chosen>
              {chosenPages.length} page{chosenPages.length === 1 ? '' : 's'} chosen
            </Chosen>
          ) : null}
          <Lenses role="radiogroup" aria-label="What the map should answer">
            {(['structure', 'journeys', 'health', 'reach', 'growth'] as const).map(option => (
              <Lens
                key={option}
                type="button"
                role="radio"
                aria-checked={lens === option}
                onClick={() => setLens(option)}
                title={
                  option === 'structure'
                    ? 'What links to what'
                    : option === 'journeys'
                      ? 'Whether a reader can reach what the site is for'
                      : option === 'health'
                        ? 'Orphans, drift, and pages that barely say anything'
                        : option === 'reach'
                          ? 'What would keep a page from being found or understood'
                          : 'How the site got here, and how to go back'
                }
              >
                {option === 'structure'
                  ? 'Structure'
                  : option === 'journeys'
                    ? 'Journeys'
                    : option === 'health'
                      ? 'Health'
                      : option === 'reach'
                        ? 'Reach'
                        : 'Growth'}
              </Lens>
            ))}
          </Lenses>
          {lens === 'journeys' ? (
            <GoalPick>
              <span>The site is for</span>
              <select
                aria-label="The page this site is for"
                value={goal ?? ''}
                onChange={event => onSetGoal(event.currentTarget.value || null)}
              >
                <option value="">nothing in particular</option>
                {[...graph.pages, ...graph.promised.map(entry => entry.path)].map(page => (
                  <option key={page} value={page}>
                    {urlPathFor(page)}
                  </option>
                ))}
              </select>
            </GoalPick>
          ) : null}
          <Find>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="M20 20l-3.5-3.5"></path>
            </svg>
            <input
              type="search"
              value={find}
              onChange={event => setFind(event.target.value)}
              placeholder="Find a page"
              aria-label="Find a page on the map"
            />
          </Find>
          <Toggle type="button" aria-pressed={near} onClick={() => setNear(current => !current)}>
            Only what links here
          </Toggle>
          <Legend>
            <span><Line /> built</span>
            <span><Line $promised /> promised</span>
          </Legend>
          <Close type="button" aria-label="Close the map" onClick={onClose}>×</Close>
        </Head>

        <Canvas
          ref={canvasRef}
          onWheel={event => {
            if (!event.ctrlKey && !event.metaKey) return
            event.preventDefault()
            setZoom(current => Math.min(2.4, Math.max(0.6, current - event.deltaY / 500)))
          }}
        >
          <Zoomed style={{ transform: `scale(${zoom})` }}>
          <svg viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden="true">
            {map.edges.map(edge => {
              const from = at.get(edge.from)
              const to = at.get(edge.to)
              if (!from || !to) return null
              const lit = hovered === edge.from || hovered === edge.to
              return (
                <line
                  key={`${edge.from}|${edge.to}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={[
                    'edge',
                    edge.promised ? 'promised' : '',
                    edge.spine ? 'spine' : '',
                    lit ? 'lit' : '',
                  ].join(' ')}
                />
              )
            })}
          </svg>

          {map.nodes.map(node => (
            <Node
              key={node.path}
              type="button"
              style={{ left: node.x, top: node.y }}
              $kind={node.kind}
              $state={node.kind === 'promised' ? 'same' : publishState(node.path)}
              $trouble={lens !== 'structure' && troubled(node.path)}
              $here={node.path === selectedPage}
              $home={node.depth === 0}
              onMouseEnter={() => setHovered(node.path)}
              onMouseLeave={() => setHovered(current => (current === node.path ? null : current))}
              $dim={!matches(node)}
              onClick={() => open(node)}
              title={
                node.kind === 'promised'
                  ? `${node.path} — promised by a link, not built`
                  : node.path
              }
            >
              {node.kind === 'promised' ? null : (
                <Tick
                  as="span"
                  role="checkbox"
                  aria-checked={chosen.has(node.path)}
                  aria-label={`Change ${label(node)} together with others`}
                  tabIndex={0}
                  $on={chosen.has(node.path)}
                  onClick={event => {
                    event.stopPropagation()
                    onChoosePage(node.path)
                  }}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    event.stopPropagation()
                    onChoosePage(node.path)
                  }}
                />
              )}
              {thumbnails && node.kind !== 'promised' ? (
                <Thumb>
                  <PageFrame
                    html={siteDocument.pages[node.path] ?? ''}
                    styles={siteDocument.styles}
                    assets={previews}
                    page={node.path}
                    width={1100}
                    height={700}
                    scale={THUMB_WIDTH / 1100}
                  />
                </Thumb>
              ) : null}
              <span className="name">{label(node)}</span>
              <span className="path">
                {lens === 'structure' ? urlPathFor(node.path) : noteFor(node.path) || urlPathFor(node.path)}
              </span>
            </Node>
          ))}
          </Zoomed>
          <Zoom>
            <button type="button" aria-label="Further out" onClick={() => setZoom(z => Math.max(0.6, z - 0.2))}>
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Further in" onClick={() => setZoom(z => Math.min(2.4, z + 0.2))}>
              +
            </button>
            {zoom === 1 ? null : (
              <button type="button" onClick={() => setZoom(1)}>
                Fit
              </button>
            )}
          </Zoom>
        </Canvas>

        {lens === 'growth' ? (
          <Grew>
            <span className="label">How it grew</span>
            {revisions.length ? (
              <div className="line">
                {[...revisions].reverse().map(entry => (
                  <button
                    key={entry.file}
                    type="button"
                    title={`${revisionLabel(entry, Date.now())} — put the site back into this shape`}
                    onClick={() => onRestoreRevision(entry.file)}
                  >
                    <span className="dot" />
                    <span className="when">{revisionLabel(entry, Date.now())}</span>
                  </button>
                ))}
                <span className="now">now</span>
              </div>
            ) : (
              <span className="quiet">
                No snapshots yet. One is kept before every change from here on.
              </span>
            )}
          </Grew>
        ) : null}

        <Foot>
          <span>Click a page to open it. Click a promise to build it.</span>
          <span style={{ flex: 1 }} />
          <Add type="button" onClick={onAddPage}>
            New page
          </Add>
          <span className="quiet">Escape closes the map</span>
        </Foot>
      </Sheet>
    </Scrim>
  )
}

const Scrim = styled.div`
  ${siteLinkTheme}
  position: fixed;
  inset: 0;
  z-index: var(--platform-z-index-zi-app-modal);
  display: flex;
  padding: 16px;
  background: color-mix(in srgb, var(--platform-colors-text) 42%, transparent);
  backdrop-filter: blur(8px);
`
const Sheet = styled.section`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  background: var(--platform-colors-surface);
  border: 1px solid var(--platform-colors-border));
  box-shadow: 0 30px 70px var(--platform-shadow-lg);
  color: var(--platform-colors-text);
`
const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--platform-colors-border));
`
const Title = styled.div`
  font-size: 15px;
  font-weight: 600;
`
const Sub = styled.div`
  font-size: 12.5px;
  color: var(--platform-colors-text-secondary);
`
/** The tick that puts a page in the scope a request applies to. */
const Tick = styled.span<{ $on: boolean }>`
  position: absolute;
  top: 6px;
  right: 6px;
  width: 14px;
  height: 14px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid
    ${({ $on }) => ($on ? 'var(--site-accent)' : 'var(--platform-colors-border-strong)')};
  background: ${({ $on }) => ($on ? 'var(--site-accent)' : 'transparent')};
`
const Chosen = styled.span`
  font-size: var(--platform-typography-font-size-xs);
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--site-accent-wash);
  color: var(--platform-colors-text);
`
const Lenses = styled.div`
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--pure-chrome-well);
`
const Lens = styled.button`
  font: inherit;
  font-size: var(--platform-typography-font-size-xs);
  height: 24px;
  padding: 0 11px;
  border-radius: 999px;
  border: 0;
  background: none;
  color: var(--platform-colors-text-secondary);
  cursor: pointer;
  &[aria-checked='true'] {
    background: var(--pure-chrome-paper);
    color: var(--platform-colors-text);
    font-weight: var(--platform-typography-font-weight-bold);
  }
`
const GoalPick = styled.label`
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--platform-typography-font-size-xs);
  color: var(--platform-colors-text-secondary);
  select {
    font: inherit;
    font-size: var(--platform-typography-font-size-xs);
    padding: 4px 8px;
    border-radius: 8px;
    border: 1px solid var(--platform-colors-border);
    background: var(--pure-chrome-well);
    color: var(--platform-colors-text);
  }
`
const Find = styled.label`
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--platform-colors-border);
  color: var(--platform-colors-text-secondary);
  input {
    border: 0;
    outline: 0;
    background: none;
    font: inherit;
    font-size: var(--platform-typography-font-size-sm);
    color: var(--platform-colors-text);
    width: 116px;
  }
`
const Toggle = styled.button`
  font: inherit;
  font-size: var(--platform-typography-font-size-sm);
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--platform-colors-border);
  background: transparent;
  color: inherit;
  cursor: pointer;
  &[aria-pressed='true'] {
    background: var(--site-accent-wash);
    border-color: var(--site-accent);
  }
`
const Legend = styled.div`
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--platform-colors-text-secondary);
  span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
`
const Line = styled.i<{ $promised?: boolean }>`
  width: 18px;
  height: 0;
  border-bottom: ${({ $promised }) =>
    $promised ? '2px dashed var(--site-promise-ink)' : '2px solid var(--site-built-line)'};
`
const Close = styled.button`
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid var(--platform-colors-border));
  background: transparent;
  font-size: 17px;
  line-height: 1;
  color: inherit;
  cursor: pointer;
`
const Canvas = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--platform-colors-bg);

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .edge {
    stroke: color-mix(in srgb, var(--platform-colors-text) 18%, transparent);
    stroke-width: 1.5;
  }
  .edge.spine {
    stroke: var(--site-built-line);
    stroke-width: 2.5;
  }
  .edge.promised {
    stroke: var(--site-promise-line);
    stroke-width: 2;
    stroke-dasharray: 6 5;
  }
  .edge.lit {
    stroke: var(--site-accent);
  }
`
const Thumb = styled.span`
  display: block;
  width: ${() => THUMB_WIDTH}px;
  height: 64px;
  overflow: hidden;
  border-radius: 7px;
  margin-bottom: 4px;
  pointer-events: none;
  background: var(--platform-colors-bg);
`
/** Everything the map draws, moved together as you go in and out. */
const Zoomed = styled.div`
  position: absolute;
  inset: 0;
  transform-origin: center center;
  transition: transform 120ms ease;
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`
const Zoom = styled.div`
  position: absolute;
  right: 14px;
  bottom: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 999px;
  background: var(--platform-colors-surface);
  border: 1px solid var(--platform-colors-border);
  font-size: var(--platform-typography-font-size-xs);
  color: var(--platform-colors-text-secondary);
  button {
    font: inherit;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 999px;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  span {
    font-family: var(--platform-typography-font-family-mono);
    min-width: 38px;
    text-align: center;
  }
`
const Node = styled.button<{
  $kind: string
  $here: boolean
  $home: boolean
  $dim: boolean
  $state: string
  $trouble: boolean
}>`
  position: absolute;
  transform: translate(-50%, -50%);
  max-width: 168px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${({ $home }) => ($home ? '10px 14px' : '8px 12px')};
  border-radius: 11px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  background: ${({ $kind }) =>
    $kind === 'promised'
      ? 'color-mix(in srgb, var(--site-promise-ink) 10%, var(--platform-colors-surface))'
      : 'var(--platform-colors-surface)'};
  border: ${({ $kind, $here }) =>
    $kind === 'promised'
      ? '1.5px dashed var(--site-promise-line)'
      : $here
      ? '1.5px solid var(--site-accent)'
      : '1px solid var(--platform-colors-border))'};
  box-shadow: ${({ $here }) =>
    $here ? '0 0 0 4px var(--site-accent-wash)' : '0 6px 16px color-mix(in srgb, var(--platform-colors-text) 8%, transparent)'};
  opacity: ${({ $kind, $dim }) => ($dim ? 0.25 : $kind === 'orphan' ? 0.85 : 1)};
  /* Under a lens, what the lens is about is lit and the rest recedes. */
  outline: ${({ $trouble }) =>
    $trouble ? '2px solid var(--pure-attention-text)' : 'none'};
  outline-offset: 2px;

  .name {
    font-size: ${({ $home }) => ($home ? '14px' : '12.5px')};
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* A line under the name says what readers have: nothing for a page that
     is already live, the accent for one they have never seen. */
  .name {
    border-bottom: 2px solid
      ${({ $state }) =>
        $state === 'new'
          ? 'var(--site-accent)'
          : $state === 'changed'
            ? 'var(--pure-attention-text)'
            : 'transparent'};
  }
  .path {
    font-family: var(--platform-typography-font-family-mono);
    font-size: 10.5px;
    color: var(--platform-colors-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &:focus-visible {
    outline: 2px solid var(--site-built-line);
    outline-offset: 3px;
  }
`
const Add = styled.button`
  font: inherit;
  font-size: var(--platform-typography-font-size-sm);
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--platform-colors-border);
  background: transparent;
  color: inherit;
  cursor: pointer;
`
/** The site's own history, as a line you can step back along. */
const Grew = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  border-top: 1px solid var(--platform-colors-border);
  font-size: var(--platform-typography-font-size-xs);
  color: var(--platform-colors-text-secondary);
  .label {
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    overflow-x: auto;
  }
  button {
    display: flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--site-built-line);
  }
  .now {
    font-weight: var(--platform-typography-font-weight-bold);
    color: var(--platform-colors-text);
  }
`
const Foot = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 18px;
  border-top: 1px solid var(--platform-colors-border));
  font-size: 12.5px;
  color: var(--platform-colors-text-secondary);
  .quiet {
    opacity: 0.8;
  }
`
