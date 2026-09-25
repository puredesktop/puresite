/**
 * The same map, asked different questions.
 *
 * A picture of what links to what is worth having, but the questions people
 * actually carry are these: can a reader get to the thing this site is for,
 * is anything quietly broken or adrift, and would a search engine — or an
 * assistant answering for someone — understand what this says. Each is a way
 * of reading the same pages, so each is a pure function of the site.
 */
import type { SiteLinkGraph } from './siteLinks'
import { titleFromPage, urlPathFor, type SiteDocument } from './siteDocument'

/* ── Journeys: can a reader get there ─────────────────────────────────── */

export interface Journey {
  page: string
  /** Clicks from home; -1 when a reader arriving at home cannot get here. */
  from: number
  /** Clicks to the page the site is for; -1 when it cannot be reached. */
  to: number
  /** The way there, page by page, when there is one. */
  path: string[]
}

export interface Journeys {
  goal: string | null
  pages: Journey[]
  /** Pages from which a reader can never reach the goal. */
  stranded: string[]
  /** The shortest way from home to the goal, if there is one. */
  best: string[]
}

function outward(graph: SiteLinkGraph): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const link of graph.links) {
    if (link.target === link.fromPage) continue
    out.set(link.fromPage, [...(out.get(link.fromPage) ?? []), link.target])
  }
  return out
}

/** Shortest way from one page to another, following links. */
export function wayTo(graph: SiteLinkGraph, from: string, to: string): string[] {
  if (from === to) return [from]
  const out = outward(graph)
  const back = new Map<string, string>()
  const seen = new Set([from])
  const queue = [from]
  while (queue.length) {
    const page = queue.shift()!
    for (const next of out.get(page) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      back.set(next, page)
      if (next === to) {
        const path = [next]
        let at = next
        while (back.has(at)) {
          at = back.get(at)!
          path.unshift(at)
        }
        return path
      }
      queue.push(next)
    }
  }
  return []
}

/** How a reader moves through the site, towards what it is for. */
export function journeys(
  graph: SiteLinkGraph,
  home: string,
  goal: string | null,
): Journeys {
  const everywhere = [...graph.pages, ...graph.promised.map(entry => entry.path)]
  const pages: Journey[] = everywhere.map(page => {
    const fromHome = wayTo(graph, home, page)
    const toGoal = goal ? wayTo(graph, page, goal) : []
    return {
      page,
      from: fromHome.length ? fromHome.length - 1 : page === home ? 0 : -1,
      to: goal ? (toGoal.length ? toGoal.length - 1 : -1) : -1,
      path: toGoal,
    }
  })
  return {
    goal,
    pages,
    stranded: goal ? pages.filter(entry => entry.to < 0).map(entry => entry.page) : [],
    best: goal ? wayTo(graph, home, goal) : [],
  }
}

/* ── Health: what is quietly wrong ────────────────────────────────────── */

export interface HealthNote {
  page: string
  kind: 'orphan' | 'drift' | 'no-title' | 'thin'
  says: string
}

/** The header a page carries, as text, for comparing one page with another. */
function headerOf(html: string): string {
  const match = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i)
  return (match?.[1] ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** What a page says, without its markup. */
export function readingText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pages that are adrift: unreachable, unlike their siblings, or barely there. */
export function health(document: SiteDocument, graph: SiteLinkGraph): HealthNote[] {
  const notes: HealthNote[] = []
  for (const page of graph.orphans) {
    notes.push({
      page,
      kind: 'orphan',
      says: 'nothing links here, so a reader arrives only by address',
    })
  }

  // The header most pages share is the site's header; a page that wandered
  // from it looks like a different site to whoever lands on it.
  const headers = new Map<string, string[]>()
  for (const [page, html] of Object.entries(document.pages)) {
    const header = headerOf(html)
    if (!header) continue
    headers.set(header, [...(headers.get(header) ?? []), page])
  }
  const common = [...headers.entries()].sort((a, b) => b[1].length - a[1].length)[0]
  if (common && common[1].length > 1) {
    for (const [header, pages] of headers) {
      if (header === common[0]) continue
      for (const page of pages) {
        notes.push({ page, kind: 'drift', says: 'its header reads differently from the rest' })
      }
    }
    // A page with no header at all has drifted furthest: it looks like a
    // different site to whoever lands on it.
    for (const page of Object.keys(document.pages)) {
      if (!headerOf(document.pages[page] ?? '')) {
        notes.push({ page, kind: 'drift', says: 'no header, while every other page has one' })
      }
    }
  }

  for (const [page, html] of Object.entries(document.pages)) {
    if (!titleFromPage(html)) {
      notes.push({ page, kind: 'no-title', says: 'no page title, so it shows as a file name' })
    }
    if (readingText(html).length < 120) {
      notes.push({ page, kind: 'thin', says: 'barely says anything yet' })
    }
  }
  return notes
}

/* ── Reach: found by people, understood by machines ───────────────────── */

export interface ReachNote {
  page: string
  kind: 'no-title' | 'no-description' | 'heading-jump' | 'no-h1' | 'alt-missing'
  says: string
}

function metaDescription(html: string): string {
  const match = html.match(
    /<meta\b[^>]*name=("|')description\1[^>]*content=("|')([^"']*)\2/i,
  )
  return match?.[3]?.trim() ?? ''
}

/** What would keep a page from being found, or from being understood. */
export function reach(document: SiteDocument): ReachNote[] {
  const notes: ReachNote[] = []
  for (const [page, html] of Object.entries(document.pages)) {
    if (!titleFromPage(html)) {
      notes.push({ page, kind: 'no-title', says: 'a search result would show the file name' })
    }
    if (!metaDescription(html)) {
      notes.push({
        page,
        kind: 'no-description',
        says: 'no description, so the search result is whatever text comes first',
      })
    }
    const levels = [...html.matchAll(/<h([1-6])\b/gi)].map(match => Number(match[1]))
    if (!levels.includes(1)) {
      notes.push({ page, kind: 'no-h1', says: 'no main heading, so nothing says what this page is' })
    }
    for (let index = 1; index < levels.length; index += 1) {
      if (levels[index]! - levels[index - 1]! > 1) {
        notes.push({
          page,
          kind: 'heading-jump',
          says: `headings jump from h${levels[index - 1]} to h${levels[index]}`,
        })
        break
      }
    }
    const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => match[0])
    if (images.some(tag => !/\balt=/i.test(tag))) {
      notes.push({
        page,
        kind: 'alt-missing',
        says: 'a picture with no words for anyone who cannot see it',
      })
    }
  }
  return notes
}

/* ── The facts a site states, and where it contradicts itself ─────────── */

export interface Fact {
  page: string
  /** What the sentence is about: the word that named it. */
  about: string
  /** The date as written. */
  said: string
  /** The sentence it was said in. */
  sentence: string
}

const WHEN = /\b(\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/g
const ABOUT = ['close', 'closes', 'deadline', 'announce', 'announced', 'opens', 'open']

/** Dates the site states, with what they are about and where they are said. */
export function statedFacts(document: SiteDocument): Fact[] {
  const facts: Fact[] = []
  for (const [page, html] of Object.entries(document.pages)) {
    for (const sentence of readingText(html).split(/(?<=[.!?])\s+/)) {
      const about = ABOUT.find(word => new RegExp(`\\b${word}\\b`, 'i').test(sentence))
      if (!about) continue
      for (const match of sentence.matchAll(WHEN)) {
        facts.push({ page, about: about.replace(/s$|d$/, ''), said: match[0], sentence })
      }
    }
  }
  return facts
}

/** The same thing said two different ways, which is worse than not saying it. */
export function contradictions(facts: Fact[]): Array<{ about: string; facts: Fact[] }> {
  const byAbout = new Map<string, Fact[]>()
  for (const fact of facts) byAbout.set(fact.about, [...(byAbout.get(fact.about) ?? []), fact])
  return [...byAbout.entries()]
    .filter(([, group]) => new Set(group.map(fact => fact.said)).size > 1)
    .map(([about, group]) => ({ about, facts: group }))
}

/* ── What an assistant is handed ──────────────────────────────────────── */

/**
 * A plain-text map of the site for whatever reads it without eyes.
 *
 * Written from the same sentences as the pages, at build time, so it is never
 * a second copy to keep up to date. Nothing is invented: a site that does not
 * say when it closes has no closing date here either.
 */
export function llmsText(document: SiteDocument, graph: SiteLinkGraph): string {
  const home = document.manifest.pages[0] ?? 'index.html'
  const opening = readingText(document.pages[home] ?? '')
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(' ')
    .slice(0, 300)
  const facts = statedFacts(document)
  const lines = [`# ${document.manifest.title}`]
  if (opening) lines.push('', `> ${opening}`)
  if (facts.length) {
    lines.push('', '## Key facts')
    const said = new Set<string>()
    for (const fact of facts) {
      const line = `- ${fact.about}: ${fact.said}`
      if (said.has(line)) continue
      said.add(line)
      lines.push(line)
    }
  }
  lines.push('', '## Pages')
  for (const page of graph.pages) {
    const title = titleFromPage(document.pages[page] ?? '') || page
    lines.push(`- ${urlPathFor(page)} — ${title}`)
  }
  return `${lines.join('\n')}\n`
}

/** Where every page lives, for anything that crawls. */
export function sitemapXml(document: SiteDocument, base: string): string {
  const root = base.replace(/\/+$/, '')
  const urls = Object.keys(document.pages)
    .map(page => `  <url><loc>${root}${urlPathFor(page)}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

/** What crawlers may read, and where the map is. */
export function robotsText(base: string): string {
  const root = base.replace(/\/+$/, '')
  return `User-agent: *\nAllow: /\nSitemap: ${root}/sitemap.xml\n`
}

/* ── Asking the site a question ───────────────────────────────────────── */

export interface Answer {
  /** The page that answers, if one does. */
  page: string | null
  /** The sentence that answers it. */
  sentence: string
  /** A page the site promised but never built, which is why it cannot answer. */
  promised: string | null
}

const COMMON = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'to', 'of', 'in', 'on',
  'for', 'it', 'this', 'that', 'there', 'i', 'you', 'we', 'they', 'can', 'what', 'when',
  'where', 'who', 'how', 'why', 'be', 'and', 'or', 'my', 'me', 'any',
])

/**
 * Does the site answer this, and in which words?
 *
 * Deterministic: the sentence that carries the most of the question's own
 * words wins. Nothing is generated — if nothing on the site says it, the
 * honest answer is that nothing says it, and the site owes an answer.
 */
export function answerFor(
  document: SiteDocument,
  graph: SiteLinkGraph,
  question: string,
): Answer {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !COMMON.has(word))
  if (!words.length) return { page: null, sentence: '', promised: null }

  let best: { page: string; sentence: string; score: number } | null = null
  for (const [page, html] of Object.entries(document.pages)) {
    for (const sentence of readingText(html).split(/(?<=[.!?])\s+/)) {
      const lower = sentence.toLowerCase()
      const score = words.filter(word => lower.includes(word)).length
      if (score < Math.ceil(words.length / 2)) continue
      if (!best || score > best.score) best = { page, sentence: sentence.trim(), score }
    }
  }
  // A page the site promised about this very thing is worth naming whether or
  // not a sentence answered: "we say this, and the page we point at for more
  // does not exist yet" is the most useful answer there is.
  const promised =
    graph.promised.find(entry =>
      words.some(word => `${entry.title} ${entry.path}`.toLowerCase().includes(word)),
    )?.path ?? null
  if (best) return { page: best.page, sentence: best.sentence, promised }
  return { page: null, sentence: '', promised }
}
