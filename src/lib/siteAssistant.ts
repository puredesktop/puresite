/**
 * Asking for a change, at whatever size the change is.
 *
 * The selection decides what is sent and what may come back: a picked
 * element sends that element marked inside its page and splices the
 * revision in; page scope sends one page; several ticked pages are revised
 * one by one with the same request. Only what is in scope is sent, and only
 * what is in scope can change — a question about a headline cannot rewrite
 * the pages that were never mentioned.
 */
import { elementAt } from './pages'

const SHARED_RULES = `Rules:
- Lay content out in flow; never position a child absolutely at a fixed offset.
- Keep every reference to assets/<name> and every href exactly as it is
  unless the request is about it.
- Prefer inline style on the element for a one-off look, and keep the page's
  classes in place — the site stylesheet governs every page, and a change
  meant for one element must not need a stylesheet edit to show up.
- Keep the page's design: same classes, same structure, unless the request
  is about the design itself.`

const ELEMENT_SYSTEM = `You revise ONE element of an HTML page.

The element to change is marked data-ps-target="1" inside its surrounding
markup, which is shown for context only. Return ONLY the revised element —
the single tag replacing the marked one, nothing else, no fence, no
commentary, and none of the surrounding markup.

${SHARED_RULES}`

const PAGE_SYSTEM = `You revise ONE page of a static site.

Return ONLY the page: from <!doctype html> to </html>, no fence and no
commentary. Change what the request asks and preserve everything else — the
same design and the same words wherever the request does not reach.

${SHARED_RULES}`

function readText(result: unknown): string {
  return typeof result === 'string'
    ? result
    : (((result as { message?: { content?: string } })?.message?.content ??
        (result as { text?: string })?.text ??
        '') as string)
}

/** The first complete element of an answer that may have prose around it. */
export function extractElement(text: string): string | null {
  const fenced = /```(?:html)?\s*\n([\s\S]*?)```/i.exec(text)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.search(/<[a-z]/i)
  if (start < 0) return null
  const holder = new DOMParser().parseFromString(
    `<body>${body.slice(start)}</body>`,
    'text/html',
  )
  const element = holder.body.firstElementChild
  return element ? element.outerHTML : null
}

/** The whole page out of an answer that may have prose around it. */
export function extractPage(text: string): string | null {
  const fenced = /```(?:html)?\s*\n([\s\S]*?)```/i.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.search(/<!doctype html|<html[\s>]/i)
  if (start < 0) return null
  const end = body.toLowerCase().lastIndexOf('</html>')
  if (end < 0) return null
  return body.slice(start, end + '</html>'.length).trim()
}

/**
 * Revise one picked element of one page. Returns the whole page with the
 * revision spliced in, or null when nothing usable came back.
 */
