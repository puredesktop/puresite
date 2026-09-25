/**
 * The material a piece is made from.
 *
 * Attached files live in the package's `assets/`; what each one SHOWS lives
 * in the manifest beside them. That split matters: the file is the thing, the
 * description is what the composition gets written from — and a screenshot
 * with no description is one the piece will use badly.
 *
 * Descriptions come from the model looking at the file when it can see, and
 * are typed by hand when it cannot. Either way they are the author's to
 * correct, so they are stored as ordinary editable text, not as a cache.
 */
import type { AssetNote, AssetRole } from './assetNotes'

export const ASSET_ROLES: { id: AssetRole; label: string; hint: string }[] = [
  { id: 'content', label: 'Content', hint: 'Can appear on screen' },
  {
    id: 'reference',
    label: 'Design reference',
    hint: 'Never shown — the piece is drawn to look like it',
  },
  { id: 'logo', label: 'Logo', hint: 'Brand mark for the title and closing slides' },
]

export interface MaterialItem extends AssetNote {
  /** Path to reference from the markup, e.g. `assets/logo.png`. */
  reference: string
  bytes?: number
  kind: 'image' | 'video' | 'audio' | 'font' | 'other'
}

const KINDS: [RegExp, MaterialItem['kind']][] = [
  [/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i, 'image'],
  [/\.(mp4|webm|mov|m4v)$/i, 'video'],
  [/\.(m4a|mp3|wav|aac|ogg|flac)$/i, 'audio'],
  [/\.(woff2?|ttf|otf)$/i, 'font'],
]

export function kindOf(name: string): MaterialItem['kind'] {
  return KINDS.find(([pattern]) => pattern.test(name))?.[1] ?? 'other'
}

/** Merge what is on disk with what the manifest says about it. */
export function mergeMaterial(
  files: { name: string; bytes?: number }[],
  notes: AssetNote[] = [],
): MaterialItem[] {
  const byName = new Map(notes.map(note => [note.name, note]))
  return files
    .filter(file => file.name && file.name !== '.keep')
    .map(file => {
      const note = byName.get(file.name)
      return {
        name: file.name,
        description: note?.description ?? '',
        role: note?.role ?? 'content',
        ...(note?.described ? { described: true } : {}),
        ...(file.bytes === undefined ? {} : { bytes: file.bytes }),
        reference: `assets/${file.name}`,
        kind: kindOf(file.name),
      }
    })
}

/** Notes for the manifest, dropping empties so the file stays clean. */
export function notesFrom(items: MaterialItem[]): AssetNote[] {
  return items
    .filter(item => item.description.trim() || item.role !== 'content')
    .map(item => ({
      name: item.name,
      description: item.description.trim(),
      ...(item.described ? { described: true } : {}),
      ...(item.role && item.role !== 'content' ? { role: item.role } : {}),
    }))
}
