import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// This former checkout-sync regression now verifies retirement. No Git fixture or
// live repository execution is needed: only a copied entrypoint runs in tmp.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'mwf-retired-entrypoint-')))
const scriptPath = join(root, 'ops-mwf.mjs')
const scriptUrl = pathToFileURL(scriptPath).href
writeFileSync(scriptPath, readFileSync(new URL('../scripts/ops-mwf.mjs', import.meta.url)))
const guardPath = join(root, 'deny-effects.mjs')
writeFileSync(guardPath, `
import { registerHooks } from 'node:module'
const allowed = new Set(['node:path', 'node:url', ${JSON.stringify(scriptUrl)}])
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!allowed.has(specifier)) throw new Error('DENIED_IMPORT:' + specifier)
    return nextResolve(specifier, context)
  }
})
globalThis.fetch = () => { throw new Error('DENIED_FETCH') }
globalThis.WebSocket = class { constructor() { throw new Error('DENIED_WEBSOCKET') } }
`)
const env = { PATH: '/usr/bin:/bin' }
function run(args) {
  return spawnSync(process.execPath, ['--import', pathToFileURL(guardPath).href, ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 5000,
  })
}

for (const flags of [[], ['--force'], ['--no-generate'], ['--dry-run'], ['--auto-publish'], ['--force', '--no-generate']]) {
  test(`retired CLI is side-effect-free with ${flags.join(' ') || 'no flags'}`, () => {
    const before = readdirSync(root).sort()
    const result = run([scriptPath, ...flags])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stderr, '')
    assert.match(result.stdout, /退役済み/)
    assert.match(result.stdout, /生成・Git同期・通知・approve \/ publish は実行していません/)
    assert.deepEqual(readdirSync(root).sort(), before)
  })
}

test('importing the retired entrypoint is silent under the same denial guard', () => {
  const result = run(['--input-type=module', '-e', `await import(${JSON.stringify(scriptUrl)})`])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '')
})

for (const specifier of ['node:fs', 'node:child_process', 'node:https', './scheduled-article-flow.mjs']) {
  test(`guard rejects ${specifier} before any protected read, process, or transport`, () => {
    const result = run(['--input-type=module', '-e', `await import(${JSON.stringify(specifier)})`])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /DENIED_IMPORT/)
  })
}

test('guard rejects global fetch before network access', () => {
  const result = run(['--input-type=module', '-e', "fetch('https://example.invalid')"])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /DENIED_FETCH/)
})
