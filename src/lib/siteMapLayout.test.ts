import { describe, expect, it } from 'vitest'
import { mapLayout } from './siteMapLayout'
import type { SiteLinkGraph, SiteLink } from './siteLinks'

function link(fromPage: string, target: string, text = target): SiteLink {
  return { fromPage, href: `/${target}`, target, text, inNav: false }
}

const graph: SiteLinkGraph = {
  pages: ['index.html', 'about/index.html', 'apply/index.html', 'press/index.html'],
  links: [
    link('index.html', 'about/index.html'),
    link('index.html', 'apply/index.html'),
    link('apply/index.html', 'nominate/index.html', 'start your nomination'),
    link('about/index.html', 'apply/index.html'),
  ],
  promised: [
    {
      path: 'nominate/index.html',
      promises: [link('apply/index.html', 'nominate/index.html', 'start your nomination')],
      title: 'Start your nomination',
      inNav: false,
    },
  ],
  orphans: ['press/index.html'],
}

const box = { width: 900, height: 600 }

describe('mapLayout', () => {
  const map = mapLayout(graph, 'index.html', box)
  const node = (path: string) => map.nodes.find(entry => entry.path === path)!

  it('puts home in the middle, because that is where a reader starts', () => {
    expect(node('index.html').x).toBe(box.width / 2)
    expect(node('index.html').depth).toBe(0)
  })

  it('places a page at its shortest distance from home, not its last one', () => {
    // Apply is linked from Home and from About; one click is the truth.
    expect(node('apply/index.html').depth).toBe(1)
    expect(node('apply/index.html').parent).toBe('index.html')
  })

  it('draws a promised page on the ring past whoever promised it', () => {
    expect(node('nominate/index.html').kind).toBe('promised')
    expect(node('nominate/index.html').depth).toBe(2)
    expect(node('nominate/index.html').parent).toBe('apply/index.html')
  })

  it('sets orphans apart along the bottom, with no distance and no parent', () => {
    const press = node('press/index.html')
    expect(press.kind).toBe('orphan')
    expect(press.depth).toBe(-1)
    expect(press.parent).toBeNull()
    expect(press.y).toBeGreaterThan(box.height - 120)
  })

  it('gives every page a place, once', () => {
    expect(map.nodes).toHaveLength(5)
    expect(new Set(map.nodes.map(entry => entry.path)).size).toBe(5)
  })

  it('keeps every node inside the box it was given', () => {
    for (const entry of map.nodes) {
      expect(entry.x).toBeGreaterThanOrEqual(0)
      expect(entry.x).toBeLessThanOrEqual(box.width)
      expect(entry.y).toBeGreaterThanOrEqual(0)
      expect(entry.y).toBeLessThanOrEqual(box.height)
    }
  })

  it('marks the links that are the way in, and the ones that are still promises', () => {
    const spine = map.edges.filter(edge => edge.spine).map(edge => `${edge.from}→${edge.to}`)
    expect(spine).toContain('index.html→apply/index.html')
    expect(spine).not.toContain('about/index.html→apply/index.html')
    expect(map.edges.find(edge => edge.to === 'nominate/index.html')?.promised).toBe(true)
  })

  it('draws the same map twice for the same site', () => {
    const again = mapLayout(graph, 'index.html', box)
    expect(again.nodes).toEqual(map.nodes)
  })
})

describe('pages the rings cannot reach', () => {
  it('draws a page that is linked, but not from anywhere home leads', () => {
    const island: SiteLinkGraph = {
      pages: ['index.html', 'a/index.html', 'b/index.html'],
      // Home says nothing; A and B only point at each other.
      links: [link('a/index.html', 'b/index.html'), link('b/index.html', 'a/index.html')],
      promised: [],
      orphans: [],
    }
    const map = mapLayout(island, 'index.html', box)
    expect(map.nodes.map(node => node.path).sort()).toEqual([
      'a/index.html',
      'b/index.html',
      'index.html',
    ])
    // They sit apart, at the bottom: no reader arriving at home gets to them.
    expect(map.nodes.find(node => node.path === 'a/index.html')?.depth).toBe(-1)
  })
})
