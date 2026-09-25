import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The document model reads composition geometry out of HTML, so the
    // tests need a DOMParser.
    environment: 'happy-dom',
  },
})
