import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The document model reads composition geometry out of HTML, so the
    // tests need a DOMParser.
    environment: 'happy-dom',
    // Real-browser rendering runs apart, with npm run test:browser.
    exclude: ['**/node_modules/**', '**/*.browser.test.ts'],
    // Fixture HTML is parsed for file contracts; it must never load remote resources.
    environmentOptions: {
      happyDOM: { settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableIframePageLoading: true, handleDisabledFileLoadingAsSuccess: true } },
    },
  },
})
