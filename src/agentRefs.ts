/**
 * Refs for the shared agent activity layer: what the tools call each thing on
 * screen, so a tool call marks the page, file, collection or snapshot it names.
 *
 * Attributes only — nothing here changes what the app does.
 */
import { normalizePagePath } from './lib/pages'
import { urlPathFor } from './lib/siteDocument'

type AgentRefProps = { 'data-agent-ref': string; 'data-agent-label': string }

function props(refs: Array<string | false | undefined>, label: string): AgentRefProps {
  return {
    'data-agent-ref': [...new Set(refs.filter((ref): ref is string => Boolean(ref)))].join(' '),
    'data-agent-label': label,
  }
}

/**
 * A page, by its path (`about/index.html`). Page tools pass it as `page`;
 * addPage passes the new page as `path`. The tools also accept the short forms
 * that normalize to the same path (`about`, `/about/`), so those are keyed too.
 * `navIndex` is the page's 0-based place in manifest.pages — movePage's `from`.
 */
export function pageRefs(path: string, label: string, navIndex?: number): AgentRefProps {
  const short = path.endsWith('/index.html') ? path.slice(0, -'/index.html'.length) : ''
  const url = urlPathFor(path)
  const forms = [path, short, url].filter(form => form && normalizePagePath(form) === path)
  return props(
    [
      path,
      url !== '/' && normalizePagePath(url) === path && url,
      ...forms.flatMap(form => [`page:${form}`, `path:${form}`]),
      typeof navIndex === 'number' && navIndex >= 0 && `from:${navIndex}`,
    ],
    label || path,
  )
}

/** A file in assets/: setAssetRole's `name`, setElementSrc's `src`. */
export function assetRefs(name: string, label?: string): AgentRefProps {
  return props(
    [name, `assets/${name}`, `name:${name}`, `src:assets/${name}`, `src:${name}`],
    label || name,
  )
}

/** A records collection: setCollection/deleteCollection `name`, addFormForCollection `collection`. */
export function collectionRefs(name: string): AgentRefProps {
  return props([name, `name:${name}`, `collection:${name}`], name)
}

/** A history snapshot: restoreRevision's `file`. */
export function revisionRefs(file: string, label: string): AgentRefProps {
  return props([file, `file:${file}`], label)
}

/**
 * The picked element, by its child-index path within the open page: the
 * element tools' `path`, and insertElement's `beforePath`/`afterPath`.
 */
export function elementRefs(path: string, label: string): AgentRefProps {
  return props([`path:${path}`, `beforePath:${path}`, `afterPath:${path}`], label)
}
