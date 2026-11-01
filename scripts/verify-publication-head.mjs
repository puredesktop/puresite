/** PureDev's post-push check. Never commits, pushes, merges or publishes a site. */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { browserIdentity, browserSuiteProblem } from './browserEvidence.mjs'

const args = process.argv.slice(2)
const expected = args[0]
if (!/^[a-f0-9]{40}$/.test(expected ?? '')) {
  throw new Error('Pass the exact 40-character review-head commit after PureDev commits and pushes it.')
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const head = git('rev-parse', 'HEAD')
if (head !== expected) throw new Error(`Expected head ${expected}; this checkout is ${head}.`)
if (git('status', '--porcelain')) throw new Error('Verify a clean checkout of the delivered head, including all new source and fixture files.')
const remoteRef = args[1] ?? `refs/heads/${git('branch', '--show-current')}`
if (!remoteRef.startsWith('refs/heads/')) throw new Error('The published branch must be a refs/heads/ reference.')
const remoteHead = git('ls-remote', '--heads', 'origin', remoteRef).split(/\s/)[0]
if (remoteHead !== head) throw new Error(`Origin ${remoteRef} does not point to ${head}; PureDev must push the review head before final verification.`)
const evidence = mkdtempSync(join(tmpdir(), 'puresite-head-verification-'))
const receipt = {
  head, tree: git('rev-parse', 'HEAD^{tree}'), remote: git('remote', 'get-url', 'origin'), remoteRef,
  relatedRevision: 'f5f639cb8991f4506c8900bc47e8912acb20f865',
  configuration: 'Repository package scripts; existing supported platform dependencies and styled-components SWC plugin enabled.',
  files: Object.fromEntries(git('ls-files').split('\n').filter(Boolean).map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
  browser: await browserIdentity(),
  commands: [], complete: false,
}
const save = () => writeFileSync(join(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
save()
const browserResults = join(evidence, 'browser-results.json')
const browserCommand = ['run', 'test:browser', '--', '--reporter=default', '--reporter=json', `--outputFile.json=${browserResults}`]
for (const [name, args] of [['tests', ['test']], ['browser', browserCommand], ['typecheck', ['run', 'typecheck']], ['build', ['run', 'build']]]) {
  const result = spawnSync('npm', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const log = join(evidence, `${name}.log`)
  writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? ''))
  receipt.commands.push({ command: `npm ${args.join(' ')}`, exitCode: result.status, signal: result.signal, log })
  let problem = null
  if (name === 'browser') {
    let results = null
    try {
      if (existsSync(browserResults)) results = JSON.parse(readFileSync(browserResults, 'utf8'))
    } catch {
      // Unreadable results prove nothing, the same as none.
    }
    receipt.browserTests = results && { total: results.numTotalTests, passed: results.numPassedTests }
    problem = browserSuiteProblem(results)
  }
  save()
  if (result.status !== 0 || problem) throw new Error(`Head verification failed${problem ? ` (${problem})` : ''}; evidence: ${evidence}`)
}
if (git('rev-parse', 'HEAD') !== head || git('status', '--porcelain')) throw new Error(`The checkout changed during verification; evidence: ${evidence}`)
if (git('ls-remote', '--heads', 'origin', remoteRef).split(/\s/)[0] !== head) throw new Error(`The published branch moved during verification; evidence: ${evidence}`)
receipt.complete = true
save()
process.stdout.write(`Verified published head ${head}. Receipt: ${join(evidence, 'receipt.json')}\n`)
