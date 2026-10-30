/** Metadata only (no bytes), so the stylesheet logic and its tests can read it. See siteFonts.ts. */
export interface SiteFontFace {
  file: string
  style: 'normal' | 'italic'
  /** One weight, or a range for a variable face. */
  weight: string
}

export interface SiteFontFamily {
  family: string
  generic: 'sans-serif' | 'serif' | 'monospace'
  faces: SiteFontFace[]
  source: string
  /** What it is like, for matching a brand's type. */
  like: string
}

const fontsource = (name: string, variable = true) =>
  `https://www.npmjs.com/package/@fontsource${variable ? '-variable' : ''}/${name}/v/5.3.0`

export const SITE_FONT_FAMILIES: readonly SiteFontFamily[] = [
  { family: 'Inter', generic: 'sans-serif', faces: [{ file: 'inter.woff2', style: 'normal', weight: '100 900' }], source: fontsource('inter'), like: 'neutral grotesque; Helvetica, SF and most product sites' },
  { family: 'Montserrat', generic: 'sans-serif', faces: [{ file: 'montserrat.woff2', style: 'normal', weight: '100 900' }], source: fontsource('montserrat'), like: 'wide geometric; Gotham, Proxima Nova, navigation and wordmarks' },
  { family: 'Manrope', generic: 'sans-serif', faces: [{ file: 'manrope.woff2', style: 'normal', weight: '200 800' }], source: fontsource('manrope'), like: 'semi-condensed geometric grotesque; Avenir' },
  { family: 'DM Sans', generic: 'sans-serif', faces: [{ file: 'dm-sans.woff2', style: 'normal', weight: '100 1000' }], source: fontsource('dm-sans'), like: 'low-contrast geometric; Circular, start-up sites' },
  { family: 'Plus Jakarta Sans', generic: 'sans-serif', faces: [{ file: 'plus-jakarta-sans.woff2', style: 'normal', weight: '200 800' }], source: fontsource('plus-jakarta-sans'), like: 'open geometric; Gilroy, agency sites' },
  { family: 'Space Grotesk', generic: 'sans-serif', faces: [{ file: 'space-grotesk.woff2', style: 'normal', weight: '300 700' }], source: fontsource('space-grotesk'), like: 'technical grotesque with quirks' },
  { family: 'Archivo', generic: 'sans-serif', faces: [{ file: 'archivo.woff2', style: 'normal', weight: '100 900' }], source: fontsource('archivo'), like: 'sturdy grotesque; Franklin Gothic, reports' },
  { family: 'Newsreader', generic: 'serif', faces: [{ file: 'newsreader.woff2', style: 'normal', weight: '200 800' }, { file: 'newsreader-italic.woff2', style: 'italic', weight: '200 800' }], source: fontsource('newsreader'), like: 'editorial serif; Tiempos, Georgia' },
  { family: 'JetBrains Mono', generic: 'monospace', faces: [{ file: 'jetbrains-mono.woff2', style: 'normal', weight: '100 800' }], source: fontsource('jetbrains-mono'), like: 'monospace for tags and labels; SF Mono, Menlo' },
  { family: 'IBM Plex Mono', generic: 'monospace', faces: [{ file: 'ibm-plex-mono-400.woff2', style: 'normal', weight: '400' }, { file: 'ibm-plex-mono-600.woff2', style: 'normal', weight: '600' }], source: fontsource('ibm-plex-mono', false), like: 'humanist monospace' },
]

export function siteFontFamily(name: string): SiteFontFamily | undefined {
  const wanted = name.trim().replace(/^["']|["']$/g, '').toLowerCase()
  return SITE_FONT_FAMILIES.find(family => family.family.toLowerCase() === wanted)
}
