import { describe, expect, it } from 'vitest'
import {
  answerFor,
  contradictions,
  health,
  journeys,
  llmsText,
  reach,
  robotsText,
  sitemapXml,
  statedFacts,
  wayTo,
} from './siteLenses'
import { linkGraph } from './siteLinks'
import type { SiteDocument } from './siteDocument'

const header = '<header><nav><a href="/">Home</a> <a href="/apply/">How to apply</a></nav></header>'

function page(title: string, body: string, chrome = header): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${chrome}<main>${body}</main></body></html>`
}

const document_: SiteDocument = {
  pages: {
    'index.html': page(
      'Open Publishing Awards',
      '<h1>The 2026 nominations are open</h1><p>Nominations close 1 November 2026. Read <a href="/apply/">how to apply</a>.</p>',
    ),
    'apply/index.html': page(
      'How to apply',
      '<h1>How to apply</h1><p>Anyone may nominate. Nominations close 3 November 2026.</p><p><a href="../nominate/">start your nomination</a></p>',
      '<header><nav><a href="../">Home</a> <a href="../apply/">How to apply</a></nav></header>',
    ),
    'press/index.html': page('Press kit', '<h1>Press kit</h1><p>Logos and photographs for editors writing about the awards this year.</p>', ''),
  },
  styles: '',
  manifest: {
    version: 1,
    title: 'Open Publishing Awards',
    pages: ['index.html', 'apply/index.html', 'press/index.html'],
    target: { profile: 'static-host' },
  },
} as unknown as SiteDocument

const graph = linkGraph(document_)

describe('journeys', () => {
  it('counts the clicks from home, and to the thing the site is for', () => {
    const found = journeys(graph, 'index.html', 'nominate/index.html')
    const apply = found.pages.find(entry => entry.page === 'apply/index.html')!
    expect(apply.from).toBe(1)
    expect(apply.to).toBe(1)
    expect(found.best).toEqual(['index.html', 'apply/index.html', 'nominate/index.html'])
  })

  it('names the pages from which a reader can never get there', () => {
    const found = journeys(graph, 'index.html', 'nominate/index.html')
    expect(found.stranded).toContain('press/index.html')
    expect(found.stranded).not.toContain('index.html')
  })

  it('says -1 rather than pretending, when there is no way at all', () => {
    const found = journeys(graph, 'index.html', 'nowhere/index.html')
    expect(found.best).toEqual([])
    expect(found.pages.every(entry => entry.to === -1)).toBe(true)
  })

  it('walks links to find the way between two pages', () => {
    expect(wayTo(graph, 'index.html', 'nominate/index.html')).toEqual([
      'index.html',
      'apply/index.html',
      'nominate/index.html',
    ])
  })
})

describe('health', () => {
  const notes = health(document_, graph)

  it('names a page nothing links to', () => {
    expect(notes.find(note => note.kind === 'orphan')?.page).toBe('press/index.html')
  })

  it('notices a page whose header wandered from the rest', () => {
    // Press has no header at all; Apply's differs from Home's.
    expect(notes.some(note => note.kind === 'drift')).toBe(true)
  })
})

describe('reach', () => {
  const notes = reach(document_)

  it('says when a page would show as a file name or has no description', () => {
    expect(notes.every(note => note.kind !== 'no-title')).toBe(true)
    expect(notes.filter(note => note.kind === 'no-description')).toHaveLength(3)
  })
})

describe('the facts a site states', () => {
  it('reads the dates it gives, with the sentence that gave them', () => {
    const facts = statedFacts(document_)
    expect(facts.map(fact => fact.said)).toContain('1 November 2026')
    expect(facts.find(fact => fact.said === '1 November 2026')?.about).toBe('close')
  })

  it('catches the same thing said two different ways', () => {
    const clash = contradictions(statedFacts(document_))
    expect(clash).toHaveLength(1)
    expect(clash[0]!.facts.map(fact => fact.said).sort()).toEqual([
      '1 November 2026',
      '3 November 2026',
    ])
  })
})

describe('what a machine is handed', () => {
  it('writes the site as plain text, from its own sentences', () => {
    const text = llmsText(document_, graph)
    expect(text).toContain('# Open Publishing Awards')
    expect(text).toContain('- close: 1 November 2026')
    expect(text).toContain('- /apply/ — How to apply')
  })

  it('lists every page for anything that crawls', () => {
    expect(sitemapXml(document_, 'https://awards.example/')).toContain(
      '<loc>https://awards.example/apply/</loc>',
    )
    expect(robotsText('https://awards.example')).toContain(
      'Sitemap: https://awards.example/sitemap.xml',
    )
  })
})

describe('asking the site a question', () => {
  it('answers in the site’s own words, and says where from', () => {
    const answer = answerFor(document_, graph, 'When do nominations close?')
    expect(answer.page).toBe('index.html')
    expect(answer.sentence).toContain('1 November 2026')
  })

  it('says nothing answers it rather than inventing one', () => {
    const answer = answerFor(document_, graph, 'Is there a fee to enter?')
    expect(answer.page).toBeNull()
    expect(answer.sentence).toBe('')
  })

  it('points at the page the site promised but never built', () => {
    const answer = answerFor(document_, graph, 'How do I start my nomination?')
    // A sentence answers, and the page it points at for more does not exist.
    expect(answer.page).toBe('apply/index.html')
    expect(answer.promised).toBe('nominate/index.html')
  })
})
