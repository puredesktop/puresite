import react from '@vitejs/plugin-react-swc'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/** Keep Vite port in sync with plugin.json entrypoint.url. */
function devServerFromManifest(metaUrl) {
  const appDir = dirname(fileURLToPath(metaUrl))
  const manifest = JSON.parse(readFileSync(join(appDir, 'plugin.json'), 'utf8'))
  const url = new URL(manifest.entrypoint.url)
  return {
    host: url.hostname,
    port: Number(url.port),
    strictPort: true,
  }
}

export default defineConfig({
  plugins: [
    react({
      plugins: [
        [createRequire(import.meta.url).resolve('@swc/plugin-styled-components'), { displayName: true, fileName: true }],
      ],
    }),
  ],
  optimizeDeps: {
    include: ['react-dom'],
  },
  server: devServerFromManifest(import.meta.url),
})
