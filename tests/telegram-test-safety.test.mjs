import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { EXPLICIT_SEND_FLAG, hasExplicitHumanGate, HUMAN_APPROVAL_FLAG } from '../scripts/lib/explicit-execution-gate.mjs'

const ROOT = process.cwd()

test('通常テストは *.test.mjs の明示対象だけを収集する', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(packageJson.scripts.test, 'node --test tests/*.test.mjs scripts/*.test.mjs scripts/lib/*.test.mjs')
  assert.ok(!('test:telegram' in packageJson.scripts))
  assert.match(packageJson.scripts['telegram:notify:live-check'], /telegram-notify-live-check\.mjs/)
})

test('live Telegram確認は二重の明示Human Gateなしでは到達不能', () => {
  assert.equal(hasExplicitHumanGate([]), false)
  assert.equal(hasExplicitHumanGate([EXPLICIT_SEND_FLAG]), false)
  assert.equal(hasExplicitHumanGate([HUMAN_APPROVAL_FLAG]), false)
  assert.equal(hasExplicitHumanGate([EXPLICIT_SEND_FLAG, HUMAN_APPROVAL_FLAG]), true)
})

test('live CLIは無引数でfail-closedし、送信実装を読まない', () => {
  const result = spawnSync(process.execPath, ['scripts/telegram-notify-live-check.mjs'], { cwd: ROOT, env: { PATH: process.env.PATH }, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /--send.*--human-approved/)
})
