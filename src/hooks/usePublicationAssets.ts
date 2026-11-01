import { useEffect, useMemo, useState } from 'react'
import { readBinaryBase64 } from '../bridge/platformBridge'
import { requiredAssetNames } from '../lib/buildSite'
import { readAssetFingerprints } from '../lib/publicationSnapshot'
import type { SiteDocument } from '../lib/siteDocument'
import type { MaterialItem } from '../lib/material'

/** Asset folder refreshes invalidate even same-name, same-size replacements. */
export function usePublicationAssets(document: SiteDocument, root: string | null, material: MaterialItem[], revision = 0) {
  const paths = useMemo(() => JSON.stringify(requiredAssetNames(document)), [document.pages, document.styles, document.manifest.assets])
  // Prose/CSS edits that keep the same required paths need no second binary read.
  // Material refreshes still invalidate same-path, same-size replacements.
  const input = useMemo(() => ({ document, root }), [paths, root, material, revision])
  const [loaded, setLoaded] = useState<{ input: typeof input; fingerprints: Record<string, string> }>()
  useEffect(() => {
    let cancelled = false
    void readAssetFingerprints(input.document, name => {
      if (!input.root) throw new Error('No saved package')
      return readBinaryBase64(`${input.root}/assets/${name}`)
    }).then(fingerprints => { if (!cancelled) setLoaded({ input, fingerprints }) })
    return () => { cancelled = true }
  }, [input])
  return loaded?.input === input ? loaded.fingerprints : undefined
}
