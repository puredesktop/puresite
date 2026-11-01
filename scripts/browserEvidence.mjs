/** What a head receipt must show of the real-browser suite: which browser, and that its tests really ran. */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The Playwright and browser this checkout uses, or why that could not be told. */
export async function browserIdentity(cwd = process.cwd()) {
  try {
    const require = createRequire(join(cwd, 'package.json'))
    const packagePath = require.resolve('playwright-core/package.json')
    const library = dirname(packagePath)
    const browser = JSON.parse(readFileSync(join(library, 'browsers.json'), 'utf8')).browsers.find(entry => entry.name === 'chromium-headless-shell')
    const { chromium } = await import(pathToFileURL(require.resolve('playwright-core')).href).then(module => module.default ?? module)
    const executable = chromium.executablePath()
    return {
      playwrightCore: JSON.parse(readFileSync(packagePath, 'utf8')).version,
      browser: 'chromium-headless-shell',
      revision: browser?.revision ?? null,
      browserVersion: browser?.browserVersion ?? null,
      browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
      executable,
      executableExists: existsSync(executable),
    }
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) }
  }
}

/** Why this browser suite's results prove nothing, or null when every test ran and passed. An exit code alone cannot say that. */
export function browserSuiteProblem(results) {
  if (!results) return 'the browser suite left no results'
  const { numTotalTests: total, numPassedTests: passed, success } = results
  if (!Number.isInteger(total) || total < 1) return 'the browser suite ran no tests'
  if (success !== true || passed !== total) return `only ${passed ?? 0} of ${total} browser tests passed`
  return null
}
