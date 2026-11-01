// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { browserSuiteProblem } from './browserEvidence.mjs'

const scripts = dirname(fileURLToPath(import.meta.url))
const made = []
afterEach(() => made.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))

/** A disposable published checkout with stand-ins for npm and Playwright: the gate's own logic, on a real head and origin. */
function publishedCheckout() {
  const root = mkdtempSync(join(tmpdir(), 'puresite-gate-'))
  made.push(root)
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  git(root, 'init', '--bare', '-b', 'review', 'origin.git')
  const work = join(root, 'work')
  git(root, 'clone', join(root, 'origin.git'), 'work')
  git(work, 'checkout', '-b', 'review')
  writeFileSync(join(work, '.gitignore'), 'node_modules/\n')
  writeFileSync(join(work, 'package.json'), '{}\n')
  git(work, 'add', '.')
  git(work, '-c', 'user.name=Gate', '-c', 'user.email=gate@example.invalid', 'commit', '-m', 'Head')
  git(work, 'push', 'origin', 'review')

  const playwright = join(work, 'node_modules/playwright-core')
  mkdirSync(playwright, { recursive: true })
  writeFileSync(join(playwright, 'package.json'), JSON.stringify({ name: 'playwright-core', version: '9.9.9', main: 'index.cjs' }))
  writeFileSync(join(playwright, 'browsers.json'), JSON.stringify({ browsers: [{ name: 'chromium-headless-shell', revision: '4242', browserVersion: '1.2.3' }] }))
  writeFileSync(join(playwright, 'index.cjs'), `module.exports = { chromium: { executablePath: () => ${JSON.stringify(join(root, 'no-such-browser'))} } }`)

  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'npm'), `#!/bin/sh
echo "npm $*" >> "${join(root, 'npm-calls.txt')}"
case "$*" in
  *test:browser*)
    for arg in "$@"; do case "$arg" in --outputFile.json=*) out="\${arg#--outputFile.json=}";; esac; done
    if [ -n "$FAKE_RESULTS" ]; then printf '%s' "$FAKE_RESULTS" > "$out"; fi
    exit "\${FAKE_BROWSER_EXIT:-0}";;
esac
exit 0
`)
  chmodSync(join(bin, 'npm'), 0o755)

  const gate = (env = {}) => {
    const run = spawnSync(process.execPath, [join(scripts, 'verify-publication-head.mjs'), git(work, 'rev-parse', 'HEAD'), 'refs/heads/review'], {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, ...env },
    })
    const where = /(?:Receipt: |evidence: )(\/\S+)/.exec(`${run.stdout}${run.stderr}`)?.[1] ?? ''
    const receiptPath = where.endsWith('receipt.json') ? where : join(where, 'receipt.json')
    made.push(dirname(receiptPath))
    return { status: run.status, output: `${run.stdout}${run.stderr}`, receipt: JSON.parse(readFileSync(receiptPath, 'utf8')) }
  }
  return { gate, calls: () => readFileSync(join(root, 'npm-calls.txt'), 'utf8') }
}

const passed = JSON.stringify({ success: true, numTotalTests: 60, numPassedTests: 60 })

describe('the head verification gate', () => {
  it('completes only after the browser suite ran, and records it with the browser it used', () => {
    const { gate, calls } = publishedCheckout()
    const { status, receipt } = gate({ FAKE_RESULTS: passed, PLAYWRIGHT_BROWSERS_PATH: '/shared/browsers' })
    expect(status).toBe(0)
    expect(receipt.complete).toBe(true)
    expect(calls()).toMatch(/npm run test:browser/)
    expect(receipt.browserTests).toEqual({ total: 60, passed: 60 })
    expect(receipt.commands.map(command => command.command.split(' -- ')[0])).toEqual(['npm test', 'npm run test:browser', 'npm run typecheck', 'npm run build'])
    expect(receipt.commands[1].log).toMatch(/browser\.log$/)
    expect(receipt.browser).toMatchObject({ playwrightCore: '9.9.9', revision: '4242', browserVersion: '1.2.3', browsersPath: '/shared/browsers', executableExists: false })
  })

  it('does not complete when the browser cannot start, and keeps the failure', () => {
    const { status, receipt, output } = publishedCheckout().gate({ FAKE_BROWSER_EXIT: '1', FAKE_RESULTS: JSON.stringify({ success: false, numTotalTests: 60, numPassedTests: 0 }) })
    expect(status).not.toBe(0)
    expect(output).toMatch(/Head verification failed/)
    expect(receipt.complete).toBe(false)
    expect(receipt.commands.at(-1)).toMatchObject({ exitCode: 1 })
    expect(receipt.browserTests).toEqual({ total: 60, passed: 0 })
  })

  for (const [name, results] of [
    ['leaves no results', ''],
    ['runs no tests', JSON.stringify({ success: true, numTotalTests: 0, numPassedTests: 0 })],
    ['skips some of them', JSON.stringify({ success: true, numTotalTests: 60, numPassedTests: 12 })],
  ]) {
    it(`does not take exit 0 for a pass when the suite ${name}`, () => {
      const { status, receipt, output } = publishedCheckout().gate({ FAKE_RESULTS: results })
      expect(status).not.toBe(0)
      expect(output).toMatch(/browser/)
      expect(receipt.complete).toBe(false)
    })
  }
})

describe('the browser results', () => {
  it('count only when every test ran and passed', () => {
    expect(browserSuiteProblem(null)).toMatch(/no results/)
    expect(browserSuiteProblem({ success: true, numTotalTests: 0, numPassedTests: 0 })).toMatch(/no tests/)
    expect(browserSuiteProblem({ success: false, numTotalTests: 3, numPassedTests: 2 })).toBe('only 2 of 3 browser tests passed')
    expect(browserSuiteProblem({ success: true, numTotalTests: 3, numPassedTests: 3 })).toBeNull()
  })
})
