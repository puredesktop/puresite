/**
 * Calling a file by name instead of by path.
 *
 * `assets/logo-CK55h_T1.png` is a name a machine gave a file, and every time
 * a person or a model retypes it is a chance to get it wrong — which is
 * exactly how a page ends up asking for a picture the site does not have. So
 * each file also answers to a short name the person chooses: `logo`, `hero`.
 * The markup keeps the real path, the name is how it is spoken about, and
 * renaming it changes nothing that ships.
 */
import type { MaterialItem } from './material'

/** A short name from a file name: no extension, no machine suffix, no spaces. */
export function suggestedName(fileName: string): string {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '')
  const parts = stem.split(/[-_\s]+/).filter(Boolean)
  // Exports and downloads tack an identifier on the end — "logo-CK55h_T1".
  // It means something to the tool that wrote it and nothing to anyone else,
  // so it is dropped: a segment mixing letters with digits, shouting in caps
  // or simply long. A year ("hero-2024") is none of those and stays.
  while (parts.length > 1) {
    const last = parts[parts.length - 1]!
    const mixed = /\d/.test(last) && /[a-z]/i.test(last)
    if (!mixed || !(/[A-Z]/.test(last) || last.length >= 6)) break
    parts.pop()
  }
  return (
    parts
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'file'
  )
}

/** What this file is called, whether or not anyone has named it. */
export function nameOf(item: Pick<MaterialItem, 'name' | 'alias'>): string {
  return item.alias?.trim() || suggestedName(item.name)
}

/** Every file with the name it answers to, for the agent and the files list. */
export function namedFiles(
  material: MaterialItem[],
): Array<{ called: string; file: string; reference: string }> {
  const taken = new Set<string>()
  return material.map(item => {
    let called = nameOf(item)
    // Two files called the same thing would make the name useless.
    if (taken.has(called)) {
      let count = 2
      while (taken.has(`${called}-${count}`)) count += 1
      called = `${called}-${count}`
    }
    taken.add(called)
    return { called, file: item.name, reference: `assets/${item.name}` }
  })
}

/** The file a name refers to, if any. */
export function fileForName(material: MaterialItem[], called: string): string | null {
  const wanted = called.trim().toLowerCase().replace(/^assets\//, '')
  return (
    namedFiles(material).find(
      entry => entry.called === wanted || entry.file.toLowerCase() === wanted,
    )?.file ?? null
  )
}

/**
 * Point every reference to one file at another.
 *
 * The fix for the commonest broken site there is: a page asking for a file
 * that was renamed, re-exported or never arrived. The `../` depth each page
 * needs is already in the markup, so only the file name moves.
 */
export function repointAsset(
  pages: Record<string, string>,
  from: string,
  to: string,
): Record<string, string> {
  const pattern = new RegExp(
    `((?:\\.\\./)*assets/)${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
    'g',
  )
  const next: Record<string, string> = {}
  for (const [page, html] of Object.entries(pages)) next[page] = html.replace(pattern, `$1${to}`)
  return next
}

/** Which pages use a file, by its name inside `assets/`. */
export function usedOn(pages: Record<string, string>, file: string): string[] {
  const pattern = new RegExp(
    `(?:\\.\\./)*assets/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
  )
  return Object.entries(pages)
    .filter(([, html]) => pattern.test(html))
    .map(([page]) => page)
}
