/**
 * The open faces a site may name and get, self-hosted.
 *
 * A site names a family in its stylesheet (`font-family: Inter, …`); when the
 * family is one of these, the stylesheet's managed foundation block gets an
 * @font-face pointing at `assets/fonts/<file>` and the file is written into
 * the package, so the type is the same on every visitor's computer and no
 * font is fetched from a network. Latin subsets as woff2 from the Fontsource
 * packages named in `source`, SIL Open Font License 1.1, licences in
 * `licenses/`.
 */
import archivo from './archivo.woff2?inline'
import dmSans from './dm-sans.woff2?inline'
import ibmPlexMono400 from './ibm-plex-mono-400.woff2?inline'
import ibmPlexMono600 from './ibm-plex-mono-600.woff2?inline'
import inter from './inter.woff2?inline'
import jetbrainsMono from './jetbrains-mono.woff2?inline'
import manrope from './manrope.woff2?inline'
import montserrat from './montserrat.woff2?inline'
import newsreaderItalic from './newsreader-italic.woff2?inline'
import newsreader from './newsreader.woff2?inline'
import plusJakartaSans from './plus-jakarta-sans.woff2?inline'
import spaceGrotesk from './space-grotesk.woff2?inline'
import { SITE_FONT_FAMILIES } from './siteFontRegistry'

export { SITE_FONT_FAMILIES }

/** Data URLs by package path under assets/ (`fonts/inter.woff2`), for the preview and for writing the files. */
export const SITE_FONT_URLS: Readonly<Record<string, string>> = Object.freeze({
  'fonts/archivo.woff2': archivo,
  'fonts/dm-sans.woff2': dmSans,
  'fonts/ibm-plex-mono-400.woff2': ibmPlexMono400,
  'fonts/ibm-plex-mono-600.woff2': ibmPlexMono600,
  'fonts/inter.woff2': inter,
  'fonts/jetbrains-mono.woff2': jetbrainsMono,
  'fonts/manrope.woff2': manrope,
  'fonts/montserrat.woff2': montserrat,
  'fonts/newsreader-italic.woff2': newsreaderItalic,
  'fonts/newsreader.woff2': newsreader,
  'fonts/plus-jakarta-sans.woff2': plusJakartaSans,
  'fonts/space-grotesk.woff2': spaceGrotesk,
})
