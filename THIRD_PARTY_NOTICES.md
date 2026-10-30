# Third-party notices

Create, preview, and publish static websites.

Dependencies and bundled assets retain their upstream licenses. The MIT license
for original pure.science inc code does not relicense third-party material.

## Direct external runtime dependencies

This list covers dependencies declared by the snapshot package manifests, including
nested packages where present. It is not a complete transitive dependency inventory.
Consult the installed version’s license and notices before redistributing dependencies.

| Package | Declared version | Upstream |
| --- | --- | --- |
| `react` | `^19.1.0` | [react](https://github.com/react/react) |
| `react-dom` | `^19.1.0` | [react-dom](https://github.com/react/react) |
| `styled-components` | `^6.1.18` | [styled-components](https://github.com/styled-components/styled-components) |

## Bundled fonts

The open faces a site may name are bundled in `src/fonts/` (Latin subsets as woff2,
from the Fontsource packages named in `src/fonts/siteFontRegistry.ts`) and written into
each site package's `assets/fonts/` when its stylesheet names them. Each is licensed
under the SIL Open Font License 1.1; the licence and copyright lines are in
`src/fonts/licenses/`.

| Family | Upstream | Licence |
| --- | --- | --- |
| Inter | [rsms/inter](https://github.com/rsms/inter) | OFL-1.1 |
| Montserrat | [JulietaUla/Montserrat](https://github.com/JulietaUla/Montserrat) | OFL-1.1 |
| Manrope | [sharanda/manrope](https://github.com/sharanda/manrope) | OFL-1.1 |
| DM Sans | [googlefonts/dm-fonts](https://github.com/googlefonts/dm-fonts) | OFL-1.1 |
| Plus Jakarta Sans | [tokotype/PlusJakartaSans](https://github.com/tokotype/PlusJakartaSans) | OFL-1.1 |
| Space Grotesk | [floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk) | OFL-1.1 |
| Archivo | [Omnibus-Type/Archivo](https://github.com/Omnibus-Type/Archivo) | OFL-1.1 |
| Newsreader | [productiontype/Newsreader](https://github.com/productiontype/Newsreader) | OFL-1.1 |
| JetBrains Mono | [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono) | OFL-1.1 |
| IBM Plex Mono | [IBM/plex](https://github.com/IBM/plex) | OFL-1.1 |
