/**
 * Where each page sits when the site is drawn as what it is: a thing that
 * points at itself.
 *
 * Distance from the home page is the only structure a reader has, so it is the
 * structure here: home at the centre, the pages it links to on the first ring,
 * what those reach on the second. A page a link promises but nobody has built
 * sits on the ring beyond whoever promised it, so a gap in the site looks like
 * a gap. Pages nothing points at have no distance at all, so they sit apart,
 * along the bottom, rather than pretending to belong to a ring.
 *
 * Pure and deterministic: the same site draws the same map every time, which
 * is what makes it worth looking at twice.
 */
import type { SiteLinkGraph } from './siteLinks'

export type MapNodeKind = 'page' | 'promised' | 'orphan'

export interface MapNode {
  /** Page path, built or promised. */
  path: string
  kind: MapNodeKind
  /** Clicks from home; -1 for an orphan, which cannot be reached at all. */
  depth: number
  x: number
  y: number
  /** The page that put it here, for drawing the line inward. */
  parent: string | null
}

export interface MapEdge {
  from: string
  to: string
  /** The target does not exist yet. */
  promised: boolean
  /** Both ends are on the shortest way in from home. */
  spine: boolean
}

export interface SiteMap {
  nodes: MapNode[]
  edges: MapEdge[]
  /** The deepest ring drawn, for the rings behind the nodes. */
  rings: number
}

export interface MapBox {
  width: number
  height: number
}

/** Lay the site out around its home page. */
export function mapLayout(graph: SiteLinkGraph, home: string, box: MapBox): SiteMap {
  const known = new Set(graph.pages)
  const orphans = new Set(graph.orphans)

  const children = new Map<string, string[]>()
  const parent = new Map<string, string>()
  const depth = new Map<string, number>([[home, 0]])
  const queue: string[] = [home]
  const seen = new Set<string>([home])

  // Breadth first, so every page lands at its shortest distance from home and
  // the line drawn inward is the way a reader would actually have arrived.
  while (queue.length) {
    const page = queue.shift()!
    const outward = graph.links
      .filter(link => link.fromPage === page && link.target !== page)
      .map(link => link.target)
    for (const target of outward) {
      if (seen.has(target)) continue
      if (orphans.has(target)) continue
      seen.add(target)
      parent.set(target, page)
      depth.set(target, (depth.get(page) ?? 0) + 1)
      children.set(page, [...(children.get(page) ?? []), target])
      if (known.has(target)) queue.push(target)
    }
  }

  // A page that exists but was only ever reached sideways still needs a home:
  // hang it off the page that links to it, one ring further out.
  for (const page of graph.pages) {
    if (seen.has(page) || orphans.has(page)) continue
    const inbound = graph.links.find(link => link.target === page)
    const from = inbound?.fromPage ?? home
    seen.add(page)
    parent.set(page, from)
    depth.set(page, (depth.get(from) ?? 0) + 1)
    children.set(from, [...(children.get(from) ?? []), page])
  }

  const cx = box.width / 2
  const unreachable = countUnreachable(graph, depth, orphans)
  const cy = (box.height - bandHeight(unreachable, box.width)) / 2
  const maxDepth = Math.max(1, ...[...depth.values()])
  const outerX = Math.max(120, box.width / 2 - 150)
  const outerY = Math.max(90, cy - 70)

  const nodes: MapNode[] = [
    { path: home, kind: 'page', depth: 0, x: cx, y: cy, parent: null },
  ]

  /**
   * Each branch is given a slice of the circle in proportion to how much of
   * the site hangs off it, so a busy branch spreads and a thin one does not
   * take space it has no use for.
   */
  const weigh = (page: string): number => {
    const kids = children.get(page) ?? []
    if (!kids.length) return 1
    return kids.reduce((sum, kid) => sum + weigh(kid), 0)
  }

  const place = (page: string, from: number, to: number): void => {
    const kids = children.get(page) ?? []
    if (!kids.length) return
    const total = kids.reduce((sum, kid) => sum + weigh(kid), 0) || 1
    let cursor = from
    for (const kid of kids) {
      const slice = ((to - from) * weigh(kid)) / total
      const angle = cursor + slice / 2
      const ring = (depth.get(kid) ?? 1) / maxDepth
      const radians = (angle * Math.PI) / 180
      nodes.push({
        path: kid,
        kind: known.has(kid) ? 'page' : 'promised',
        depth: depth.get(kid) ?? 1,
        x: cx + Math.cos(radians) * outerX * ring,
        y: cy + Math.sin(radians) * outerY * ring,
        parent: page,
      })
      place(kid, cursor, cursor + slice)
      cursor += slice
    }
  }

  place(home, -90, 270)

  // Anything the rings never reached: an orphan, or a page that is linked
  // but not from anywhere a reader can get to from home. Both are drawn
  // along the bottom rather than dropped — a map that quietly omits pages is
  // worse than the list it replaced.
  const placed = new Set(nodes.map(node => node.path))
  const promisedPaths = graph.promised.map(entry => entry.path)
  const band = [...graph.pages, ...promisedPaths].filter(page => !placed.has(page))
  // They are laid in rows that fit the width rather than one long line:
  // cards that overlap say less than a list would, which is the opposite of
  // the point.
  const perRow = Math.max(1, Math.floor(box.width / BAND_CARD))
  band.forEach((page, index) => {
    const row = Math.floor(index / perRow)
    const inRow = index % perRow
    const rowCount = Math.min(perRow, band.length - row * perRow)
    const step = box.width / (rowCount + 1)
    nodes.push({
      path: page,
      kind: known.has(page) ? 'orphan' : 'promised',
      depth: -1,
      x: step * (inRow + 1),
      y: box.height - bandHeight(band.length, box.width) + BAND_ROW * row + BAND_ROW / 2,
      parent: null,
    })
  })

  const spine = new Set<string>()
  for (const [child, from] of parent) spine.add(`${from}|${child}`)

  const edges: MapEdge[] = graph.links
    .filter(link => link.fromPage !== link.target)
    .map(link => ({
      from: link.fromPage,
      to: link.target,
      promised: !known.has(link.target),
      spine: spine.has(`${link.fromPage}|${link.target}`),
    }))

  return { nodes, edges, rings: maxDepth }
}

/** Width and height one card in the bottom band is given. */
const BAND_CARD = 196
const BAND_ROW = 74

/** Height kept clear at the bottom for whatever the rings cannot reach. */
function bandHeight(count: number, width: number): number {
  if (!count) return 0
  const perRow = Math.max(1, Math.floor(width / BAND_CARD))
  return Math.ceil(count / perRow) * BAND_ROW + 12
}

/** How many pages and promises the rings will not have reached. */
function countUnreachable(
  graph: SiteLinkGraph,
  depth: Map<string, number>,
  orphans: Set<string>,
): number {
  const promisedPaths = graph.promised.map(entry => entry.path)
  return [...graph.pages, ...promisedPaths].filter(
    page => orphans.has(page) || !depth.has(page),
  ).length
}
