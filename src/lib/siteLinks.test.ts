import { describe, expect, it } from 'vitest'
import {
  linkGraph,
  linksForPage,
  pageLinks,
  promiseBrief,
  hrefFrom,
  promisedLinksAtBuild,
  repointPromise,
  unlinkPromise,
  shipPage,
  titleForPromise,
} from './siteLinks'
import type { SiteDocument } from './siteDocument'

function site(pages: Record<string, string>): SiteDocument {
  const paths = Object.keys(pages)
  return {
    pages,
    styles: '',
    assets: {},
    manifest: {
      version: 1,
      title: 'Open Publishing Awards',
      pages: paths,
      target: { profile: 'static-host' },
    },
  } as unknown as SiteDocument
}

const home = `<!doctype html><html><body>
  <header><nav>
    <a href="/about/">About</a>
    <a href="/judges/">Judges</a>
  </nav></header>
  <main>
    <p>Read <a href="apply/index.html">how to apply</a>, check the
    <a href="/eligibility/">eligibility criteria</a>, then
    <a href="/nominate/">submit a nomination</a>.</p>
    <p><a href="https://example.org">An outside link</a> and
    <a href="assets/brochure.pdf">a file</a>.</p>
  </main>
</body></html>`

const apply = `<!doctype html><html><body>
  <header><nav><a href="../about/">About</a><a href="../judges/">Judges</a></nav></header>
  <main><p><a href="../nominate/">start your nomination</a> before November.</p></main>
</body></html>`

const about = `<!doctype html><html><body><main><p>Since 2019.</p></main></body></html>`
const press = `<!doctype html><html><body><main><p>Press kit.</p></main></body></html>`

const document_ = site({
  'index.html': home,
  'apply/index.html': apply,
  'about/index.html': about,
  'press/index.html': press,
})

describe('pageLinks', () => {
  it('reads internal links with their text, and leaves the outside world alone', () => {
    const links = pageLinks(home, 'index.html')
    expect(links.map(link => link.target)).toEqual([
      'about/index.html',
      'judges/index.html',
      'apply/index.html',
      'eligibility/index.html',
      'nominate/index.html',
    ])
    expect(links.find(link => link.target === 'nominate/index.html')?.text).toBe(
      'submit a nomination',
    )
  })

  it('knows which links come from the header, because those sit on every page', () => {
    const links = pageLinks(home, 'index.html')
    expect(links.find(link => link.target === 'judges/index.html')?.inNav).toBe(true)
    expect(links.find(link => link.target === 'nominate/index.html')?.inNav).toBe(false)
  })

  it('resolves a link the way a browser would, from the page it sits on', () => {
    expect(pageLinks(apply, 'apply/index.html').map(link => link.target)).toEqual([
      'about/index.html',
      'judges/index.html',
      'nominate/index.html',
    ])
  })
})

describe('linkGraph', () => {
  const graph = linkGraph(document_)

  it('separates the pages that exist from the ones links promise', () => {
    expect(graph.pages).toContain('apply/index.html')
    // Judges and Nominate are each promised twice, so the tie breaks on path.
    expect(graph.promised.map(entry => entry.path)).toEqual([
      'judges/index.html',
      'nominate/index.html',
      'eligibility/index.html',
    ])
  })

  it('collects every sentence that promised a page', () => {
    const nominate = graph.promised.find(entry => entry.path === 'nominate/index.html')!
    expect(nominate.promises.map(link => link.text)).toEqual([
      'submit a nomination',
      'start your nomination',
    ])
    expect(nominate.title).toBe('Start your nomination')
    expect(nominate.inNav).toBe(false)
  })

  it('marks a promise made by the header, since it is missing from every page', () => {
    expect(graph.promised.find(entry => entry.path === 'judges/index.html')?.inNav).toBe(true)
  })

  it('names a page nothing points at, and never the home page', () => {
    expect(graph.orphans).toEqual(['press/index.html'])
  })
})

describe('linksForPage', () => {
  it('tells a page who points at it and where it points', () => {
    const graph = linkGraph(document_)
    const apply_ = linksForPage(graph, 'apply/index.html')
    expect(apply_.in.map(link => link.fromPage)).toEqual(['index.html'])
    expect(apply_.out.map(link => link.target)).toContain('about/index.html')
    expect(apply_.promises.map(link => link.target)).toEqual([
      'judges/index.html',
      'nominate/index.html',
    ])
  })
})

describe('titleForPromise', () => {
  it('prefers the words a reader would have clicked', () => {
    expect(
      titleForPromise('winners/index.html', [
        { fromPage: 'index.html', href: '/winners/', target: 'winners/index.html', text: 'here', inNav: false },
        {
          fromPage: 'about/index.html',
          href: '/winners/',
          target: 'winners/index.html',
          text: 'the 2025 winners',
          inNav: false,
        },
      ]),
    ).toBe('The 2025 winners')
  })

  it('falls back to the address when every link says nothing', () => {
    expect(
      titleForPromise('past-winners/index.html', [
        { fromPage: 'index.html', href: '/past-winners/', target: 'past-winners/index.html', text: 'here', inNav: false },
      ]),
    ).toBe('Past winners')
  })
})

describe('promiseBrief', () => {
  it('hands on what the site already said, and asks for nothing invented', () => {
    const graph = linkGraph(document_)
    const nominate = graph.promised.find(entry => entry.path === 'nominate/index.html')!
    const brief = promiseBrief(document_, nominate)
    expect(brief).toContain('Build nominate/index.html')
    expect(brief).toContain('“submit a nomination” in the home page')
    expect(brief).toContain('“start your nomination” in apply/index.html')
    expect(brief).toContain('ask rather than invent')
  })

  it('says when the header is what promised the page', () => {
    const graph = linkGraph(document_)
    const judges = graph.promised.find(entry => entry.path === 'judges/index.html')!
    expect(promiseBrief(document_, judges)).toContain('header of every page')
  })
})

describe('shipPage', () => {
  const known = ['index.html', 'apply/index.html', 'about/index.html']

  it('keeps the words of a promised link and drops the anchor, so no reader meets a 404', () => {
    const shipped = shipPage(home, 'index.html', known)
    expect(shipped).toContain('submit a nomination')
    expect(shipped).not.toContain('href="/nominate/"')
  })

  it('leaves links to pages that exist exactly as they were', () => {
    const shipped = shipPage(home, 'index.html', known)
    expect(shipped).toContain('href="apply/index.html"')
    expect(shipped).toContain('href="/about/"')
  })

  it('never touches the outside world, assets or in-page anchors', () => {
    const html = '<a href="https://example.org">out</a><a href="assets/a.pdf">file</a><a href="#top">top</a>'
    expect(shipPage(html, 'index.html', known)).toBe(html)
  })

  it('reports what it would unwrap, so publishing can say so', () => {
    // Only these two pages exist here, so About is a promise as well.
    const promised = promisedLinksAtBuild({ 'index.html': home, 'apply/index.html': apply })
    expect(promised.map(entry => `${entry.page} → ${entry.link.target}`)).toEqual([
      'index.html → about/index.html',
      'index.html → judges/index.html',
      'index.html → eligibility/index.html',
      'index.html → nominate/index.html',
      'apply/index.html → about/index.html',
      'apply/index.html → judges/index.html',
      'apply/index.html → nominate/index.html',
    ])
  })
})

describe('keeping or dropping a promise', () => {
  const pages = {
    'index.html': home,
    'apply/index.html': apply,
  }

  it('sends the promising links at a page that exists, written from where they sit', () => {
    const next = repointPromise(pages, 'nominate/index.html', 'apply/index.html')
    // The home page reaches it without climbing; the nested page climbs once.
    expect(next['index.html']).toContain('<a href="apply/">submit a nomination</a>')
    expect(next['apply/index.html']).toContain('<a href="../apply/">start your nomination</a>')
    // Nothing else moves.
    expect(next['index.html']).toContain('href="/about/"')
  })

  it('keeps the words when a promise is dropped, and takes the link away', () => {
    const next = unlinkPromise(pages, 'nominate/index.html')
    expect(next['index.html']).toContain('submit a nomination')
    expect(next['index.html']).not.toContain('/nominate/')
    expect(next['apply/index.html']).toContain('start your nomination')
    expect(next['apply/index.html']).not.toContain('../nominate/')
  })

  it('writes the home page as the root, not as a file name', () => {
    expect(hrefFrom('about/index.html', 'index.html')).toBe('../')
    expect(hrefFrom('index.html', 'about/index.html')).toBe('about/')
    expect(hrefFrom('a/b/index.html', 'c/index.html')).toBe('../../c/')
  })
})
