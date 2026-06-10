import test from 'node:test'
import assert from 'node:assert/strict'
import { COMMAND_ALLOWLIST, parseInstruction } from '../scripts/telegram-instruction-dry-run.mjs'

test('allowlist内のコマンドはqueue job typeに変換される', () => {
  const notice = parseInstruction('/notice 本日午後休診')
  assert.equal(notice.allowed, true)
  assert.equal(notice.mapped_job_type, 'temporary_closure_notice')

  const gmb = parseInstruction('/gmb 6月の診療カレンダー')
  assert.equal(gmb.mapped_job_type, 'gmb_update')

  const sns = parseInstruction('/sns 2026-06-01-sample-post')
  assert.equal(sns.mapped_job_type, 'sns_repurpose')
})

test('照会系コマンドはjobを作らない', () => {
  assert.equal(parseInstruction('/review').mapped_job_type, null)
  assert.equal(parseInstruction('/status').mapped_job_type, null)
})

test('実行系コマンド (/approve /post /publish) は blocked', () => {
  for (const cmd of ['approve', 'reject', 'post', 'publish']) {
    const result = parseInstruction(`/${cmd} mj-20260611-000000-test`)
    assert.equal(result.allowed, false)
    assert.match(result.blocked_reason, /blocked/)
    assert.ok(!COMMAND_ALLOWLIST.includes(cmd))
  }
})

test('不明コマンド・非コマンド入力は変換しない', () => {
  assert.equal(parseInstruction('/deploy now').allowed, false)
  assert.equal(parseInstruction('ただのテキスト').allowed, false)
})
