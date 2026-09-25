/**
 * What a file is FOR, which is not the same as what it is.
 *
 * A screenshot is content; a poster whose look you want is a reference and
 * must never appear on a page — it steers how the site is drawn. Getting
 * this wrong is how a mood board ends up on the about page.
 */
export type AssetRole = 'content' | 'reference' | 'logo'

export interface AssetNote {
  /** File name inside `assets/`. */
  name: string
  /** What it shows — written by the model, or by hand. */
  description: string
  /** True when the description came from the model looking at the file. */
  described?: boolean
  /** Defaults to 'content' when absent. */
  role?: AssetRole
  /**
   * The short name this file answers to — `logo`, `hero`.
   *
   * Absent means it answers to a name derived from its file name. The markup
   * always carries the real path; this is only how the file is spoken about,
   * so renaming it breaks nothing.
   */
  alias?: string
}
