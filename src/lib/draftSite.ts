import type { MaterialItem } from './material'

/** Four minutes, then it is not coming. */
const DRAFT_TIMEOUT_MS = 240_000

export interface DraftedPage {
  path: string
  title: string
  html: string
}

export interface ReferenceImage {
  name: string
  mimeType: string
  /** Base64, no data: prefix. */
  data: string
  role?: 'content' | 'reference' | 'logo'
}

const SYSTEM = `You write small static websites as plain HTML and one stylesheet.

Compose content for the deterministic commitDrawerRequest tool. Follow its schema.

The title names the folder the author will look for later, so make it what the
site IS — never "Untitled" or "Site".

Rules for the pages:
- One complete document per page: doctype, <html lang>, <head> with charset,
  a viewport meta, a <title>, and a link to the stylesheet.
- The FIRST page is always index.html. A page named "about" is written as
  "about/index.html" so it serves at /about/, and links to it as "/about/".
- Link the stylesheet with the right number of ../ for the page's depth:
  index.html uses "styles/site.css", about/index.html uses "../styles/site.css".
  Getting this wrong is invisible on the home page and breaks every other one.
- LAY CONTENT OUT IN FLOW. Never position an element absolutely at a fixed
  top or left: text wraps differently at every width, and a block pinned below
  a heading ends up underneath it the moment that heading takes another line.
  Use flex and grid with gap. Nothing overlaps anything unless it is a
  deliberate design decision.
- The page must work at 390px wide as well as 1280px. That is what "responsive"
  means here: one column on a phone, more room on a desktop, no horizontal
  scrolling at any width.
- Every page carries the same nav, in the same place. The nav IS the site map
  here: a nav link to a page you have not written is a promise the app shows
  as still to build, never a broken link, so link what the site should have.
- WRITE ONE PAGE unless the author asked for more. Its sentences link onward
  to the pages the site needs — "read how to apply", "see the 2025 winners" —
  and those links are how the rest gets built, one at a time, from what the
  writing already promised. A site of empty pages helps nobody.
- Images come only from the attached files, referenced as assets/<file name>
  with the right ../ prefix for the page's depth. Never invent a filename.
- No scripts, no network fonts, no build step. This is a static site: what you
  write is what gets served.

The stylesheet governs every page — one palette, one type scale, one measure.
Write it once, properly, rather than putting styles in each page.`

const LOOKS: Record<string, string> = {
  auto: `LOOK — read it off the attached files. A design reference wins: take
its palette, type, weight and spacing and write the site in that language.
Failing that, take the colours from a logo. With nothing to read, choose one
restrained look and hold it.`,
  plain: `LOOK — Plain: near-black on white, one column, generous line height,
no ornament. Let the writing carry it.`,
  editorial: `LOOK — Editorial: a serif for reading, a clear measure around
68 characters, real margins, and one accent used sparingly.`,
  studio: `LOOK — Studio: dark ground, light type, one saturated accent used
for a single thing per page.`,
}

const REFERENCE_RULE = `Every attached file is shown to you as an image, named and marked with its
role. A file marked [reference] is a design reference, never content: read its
palette, type and spacing off it and never place it on a page — its filename is
not an image source. Files marked [content] or [logo] are the opposite: you see
them so you can design with them, and you place them with
<img src="assets/<file name>">. With no reference attached, read the look off
the content and logo images instead.`

function sliceJson(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open)
  const end = text.lastIndexOf(close)
  return start < 0 || end <= start ? null : text.slice(start, end + 1)
}

/**
 * Whole objects out of a broken document.
 *
 * Walks the body brace by brace, respecting strings and escapes so a brace
 * inside a style attribute does not end an object early, and keeps everything
 * that parses on its own. Used only when the response as a whole will not.
 */
function salvagePages(source: string): DraftedPage[] {
  const found: DraftedPage[] = []
  let i = 0
  while (i < source.length) {
    if (source[i] !== '{') {
      i += 1
      continue
    }
    let depth = 0
    let inString = false
    let escaped = false
    let end = -1
    for (let j = i; j < source.length; j += 1) {
      const ch = source[j]
      if (escaped) {
        escaped = false
        continue
      }
      if (inString && ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end < 0) {
      i += 1
      continue
    }
    try {
      const entry = JSON.parse(source.slice(i, end + 1)) as DraftedPage
      if (entry && typeof entry.html === 'string' && typeof entry.path === 'string') {
        found.push({
          path: entry.path,
          title: typeof entry.title === 'string' ? entry.title : '',
          html: entry.html,
        })
        i = end + 1
        continue
      }
    } catch {
      // A half-written object is simply not one of the whole ones.
    }
    i += 1
  }
  return found
}

export function parseDraft(text: string): {
  title: string
  styles: string
  pages: DraftedPage[]
} {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = (fenced ? fenced[1] : text).trim()
  // A bare array must never fall back to slicing braces: the first brace
  // belongs to its first entry, so the fallback lifts one page out and reads
  // it as a whole draft containing no pages.
  const source = body.startsWith('[')
    ? sliceJson(body, '[', ']')
    : (sliceJson(body, '{', '}') ?? sliceJson(body, '[', ']'))
  if (!source) return { title: '', styles: '', pages: salvagePages(body) }

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return { title: '', styles: '', pages: salvagePages(body) }
  }

  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as { pages?: unknown })?.pages ?? [])
  const title = Array.isArray(parsed)
    ? ''
    : String((parsed as { title?: unknown })?.title ?? '').trim()
  const styles = Array.isArray(parsed)
    ? ''
    : String((parsed as { styles?: unknown })?.styles ?? '')
  if (!Array.isArray(list)) return { title, styles, pages: [] }

  const pages = list
    .filter(
      (entry): entry is DraftedPage =>
        !!entry &&
        typeof (entry as DraftedPage).html === 'string' &&
        typeof (entry as DraftedPage).path === 'string' &&
        /<html|<!doctype/i.test((entry as DraftedPage).html),
    )
    .map(entry => ({
      path: entry.path,
      title: typeof entry.title === 'string' ? entry.title : '',
      html: entry.html,
    }))

  return { title: title.slice(0, 80), styles, pages }
}

function inventoryOf(material: MaterialItem[]): string {
  const usable = material.filter(item => item.role !== 'reference')
  if (!usable.length) return '(nothing attached)'
  return usable
    .map(item => {
      const role = item.role && item.role !== 'content' ? ` [${item.role}]` : ''
      const shows = item.description.trim()
      return `- ${item.reference}${role}${shows ? ` — ${shows}` : ''}`
    })
    .join('\n')
}

export function siteDesignGuide(look="auto"):string{return SYSTEM+"\n"+(LOOKS[look]??LOOKS.auto)+"\nUse commitDrawerRequest with pages as a path-to-complete-HTML object and styles as the complete shared stylesheet."}
