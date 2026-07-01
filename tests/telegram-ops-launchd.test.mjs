import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('telegram ops launchd install does not run build or push', () => {
  const source = readFileSync('scripts/setup-launchd-telegram-ops.mjs', 'utf8')

  assert.match(source, /npm run telegram:ops -- --apply/)
  assert.doesNotMatch(source, /npm run telegram:ops -- --apply --build/)
  assert.match(source, /Human Gate/)
})

test('telegram ops does not approve article bodies unless explicitly unlocked', () => {
  const source = readFileSync('scripts/telegram-ops.mjs', 'utf8')

  assert.match(source, /allowTelegramBodyApprove/)
  assert.match(source, /--allow-body-approve-from-telegram/)
  assert.match(source, /本文承認はTelegram返信では実行しません/)
  assert.match(source, /管理画面で本文を確認してから承認してください/)

  const guardIndex = source.indexOf('if (!allowTelegramBodyApprove')
  const pipelineIndex = source.indexOf('const result = await runApprovePipeline')
  assert.ok(guardIndex > 0)
  assert.ok(pipelineIndex > guardIndex)
})

test('approve post CLI requires explicit body-reviewed confirmation', () => {
  const source = readFileSync('scripts/approve-post.mjs', 'utf8')

  assert.match(source, /confirm_body_reviewed/)
  assert.match(source, /--confirm-body-reviewed/)
  assert.match(source, /掲載ネタの承認だけでは本文承認にできません/)
})

test('publish-ready validation does not accept auto_approved as body approval', () => {
  const source = readFileSync('scripts/validate-publish-ready.mjs', 'utf8')

  assert.match(source, /auto_approved:true は本文承認の代替にしません/)
  assert.doesNotMatch(source, /Human approval または Auto Publish Policy/)
  assert.doesNotMatch(source, /!humanApproved && !autoApproved/)
})
