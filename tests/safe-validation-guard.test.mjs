import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateSafeTestPath } from '../scripts/validate-safe-test-path.mjs'

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-safe-validation-'))
  for (const [file, contents] of Object.entries(files)) {
    const target = join(root, file)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, contents)
  }
  return root
}

function packageJson(scripts) {
  return JSON.stringify({ type: 'module', scripts })
}

test('安全な明示テストと隔離live CLIを受理する', () => {
  const root = fixture({
    'package.json': packageJson({ test: 'node --test tests/*.test.mjs scripts/*.test.mjs scripts/lib/*.test.mjs', 'test:isolated-env': 'node --test tests/activation.integration.mjs tests/gmb-api.integration.mjs tests/lineworks-adapter.integration.mjs tests/safety-gates.integration.mjs', 'telegram:notify:live-check': 'node scripts/telegram-notify-live-check.mjs' }),
    'tests/example.test.mjs': "import test from 'node:test'\ntest('safe', () => {})\n",
    'scripts/example.test.mjs': "import test from 'node:test'\ntest('safe', () => {})\n",
    'scripts/lib/example.test.mjs': "import test from 'node:test'\ntest('safe', () => {})\n",
    'scripts/telegram-notify-live-check.mjs': `const sender = await im${'port'}('./telegram-live-send.mjs')\n`,
    'scripts/lib/explicit-execution-gate.mjs': "const x = '--send'\nconst y = '--human-approved'\n",
  })
  try {
    assert.deepEqual(validateSafeTestPath({ root }), { ok: true, violations: [] })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

for (const [name, files, expected] of [
  ['bare node --test', { 'package.json': packageJson({ test: 'node --test' }) }, 'bare node --test'],
  ['broad test glob', { 'package.json': packageJson({ test: 'node --test **/*.test.mjs' }) }, 'broad glob'],
  ['live test script name', { 'package.json': packageJson({ test: 'node --test tests/*.test.mjs' }), 'scripts/test-telegram-live.mjs': '' }, 'live-like test filename'],
  ['send default', { 'package.json': packageJson({ test: 'node --test tests/*.test.mjs' }), 'scripts/telegram-notify-live-check.mjs': "const x = '--send'\n" }, 'two explicit Human Gate flags'],
  ['network import from a test', { 'package.json': packageJson({ test: 'node --test tests/*.test.mjs' }), 'tests/network.test.mjs': `im${'port'} '../scripts/telegram-live-send.mjs'\n`, 'scripts/telegram-live-send.mjs': 'fetch(\"https://example.invalid\")\n' }, 'imports a live/network module'],
  ['live file inside normal test path', { 'package.json': packageJson({ test: 'node --test tests/*.test.mjs' }), 'tests/telegram-live.test.mjs': '' }, 'live-like test filename'],
]) {
  test(`危険fixtureをfail-closedする: ${name}`, () => {
    const root = fixture(files)
    try {
      const result = validateSafeTestPath({ root })
      assert.equal(result.ok, false)
      assert.ok(result.violations.some((violation) => violation.includes(expected)), result.violations.join('\n'))
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
}
