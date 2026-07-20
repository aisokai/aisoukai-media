import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NORMAL_TEST_FILES } from '../scripts/safe-test-manifest.mjs'

test('normal validation uses one explicit test manifest', () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  assert.equal(packageJson.scripts.test, 'sh scripts/network-denied-launcher.sh')
  assert.ok(NORMAL_TEST_FILES.includes('tests/safe-validation-guard.test.mjs'))
})
