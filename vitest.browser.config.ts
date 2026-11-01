import { defineConfig } from 'vitest/config'

// Generated sites rendered in headless Chromium. Node drives the browser, so
// no DOM environment here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.browser.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
