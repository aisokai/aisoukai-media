import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NORMAL_TEST_FILES } from '../scripts/safe-test-manifest.mjs'
import { inspectTestClosure } from '../scripts/validate-safe-test-path.mjs'

function fixture(files, links = []) {
  const root = mkdtempSync(join(tmpdir(), 't07-guard-'))
  for (const [name, body] of Object.entries(files)) {
    const target = join(root, name)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, body)
  }
  for (const [target, name] of links) symlinkSync(target, join(root, name))
  return root
}

function assertViolation(name, files, expected, links) {
  test(`T07-GUARD: rejects ${name}`, () => {
    const root = fixture(files, links)
    try {
      const result = inspectTestClosure({ root, entry: 'entry.mjs' })
      assert.equal(result.ok, false)
      assert.ok(result.violations.some((v) => v.includes(expected)), result.violations.join('\n'))
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
}

test('normal validation uses one explicit test manifest', () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  assert.equal(packageJson.scripts.test, 'sh scripts/network-denied-launcher.sh')
  assert.ok(NORMAL_TEST_FILES.includes('tests/safe-validation-guard.test.mjs'))
})

const imp = 'im' + 'port'
const mid = './m' + 'id.mjs'
const nodeHttp = 'node:ht' + 'tp'
const childProcess = 'node:child_' + 'process'
assertViolation('transitive static network import', { 'entry.mjs': `${imp} '${mid}'`, 'mid.mjs': `${imp} '${nodeHttp}'` }, 'forbidden runtime reference')
assertViolation('export-from network import', { 'entry.mjs': `export * from '${mid}'`, 'mid.mjs': `f${'etch'}()` }, 'forbidden runtime reference')
assertViolation('literal dynamic network import', { 'entry.mjs': `${imp}('${mid}')`, 'mid.mjs': `f${'etch'}()` }, 'forbidden runtime reference')
assertViolation('nonliteral dynamic import', { 'entry.mjs': `const x = '${mid}'; ${imp}(x)` }, 'dynamic nonliteral import')
assertViolation('unresolved relative import', { 'entry.mjs': `${imp} './mis' + 'sing.mjs'` }, 'unresolved relative import')
assertViolation('process invocation import', { 'entry.mjs': `${imp} '${childProcess}'` }, 'forbidden runtime reference')
assertViolation('network package and bare request', { 'entry.mjs': `${imp} 'ax' + 'ios'; f${'etch'}()` }, 'forbidden runtime reference')
test('T07-GUARD: cycle terminates for safe modules', () => {
  const root = fixture({ 'entry.mjs': `${imp} './a.mjs'`, 'a.mjs': `${imp} './b.mjs'`, 'b.mjs': `${imp} './a.mjs'` })
  try { assert.deepEqual(inspectTestClosure({ root, entry: 'entry.mjs' }), { ok: true, violations: [] }) } finally { rmSync(root, { recursive: true, force: true }) }
})
test('T07-GUARD: rejects repo escape symlink', () => {
  const root = fixture({ 'entry.mjs': `${imp} './escape.mjs'` }, [['/dev/null', 'escape.mjs']])
  try { assert.ok(inspectTestClosure({ root, entry: 'entry.mjs' }).violations.some((v) => v.includes('SYMLINK_PATH_ESCAPE'))) } finally { rmSync(root, { recursive: true, force: true }) }
})
test('T07-GUARD: rejects internal symlink', () => {
  const root = fixture({ 'entry.mjs': `${imp} './linked.mjs'`, 'target.mjs': 'export const safe = true' }, [['target.mjs', 'linked.mjs']])
  try { assert.ok(inspectTestClosure({ root, entry: 'entry.mjs' }).violations.some((v) => v.includes('SYMLINK_PATH_ESCAPE'))) } finally { rmSync(root, { recursive: true, force: true }) }
})
test('T07-GUARD: rejects dangerous cycle without recursion overflow', () => {
  const root = fixture({ 'entry.mjs': `${imp} './a.mjs'`, 'a.mjs': `${imp} './b.mjs'`, 'b.mjs': `${imp} './a.mjs'; f${'etch'}()` })
  try { assert.ok(inspectTestClosure({ root, entry: 'entry.mjs' }).violations.some((v) => v.includes('forbidden runtime reference'))) } finally { rmSync(root, { recursive: true, force: true }) }
})
const transportFile = './telegram-' + 'transport.mjs'
assertViolation('live transport module reference', { 'entry.mjs': `${imp} '${transportFile}'`, 'telegram-transport.mjs': 'export const safe = true' }, 'live/notify transport')
for (const api of ['spawn', 'exec', 'fork']) {
  assertViolation(`${api} invocation reference`, { 'entry.mjs': `${imp} '${mid}'`, 'mid.mjs': `${imp} '${childProcess}'; ${api}()` }, 'forbidden runtime reference')
}
