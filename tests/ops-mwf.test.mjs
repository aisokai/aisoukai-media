import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

test('weekly job keeps the requested one-way flow and has no Git/admin stop gate', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const generation = source.indexOf('runScheduledArticle(resultPath)')
  const stock = source.indexOf('rememberGeneratedDraft({ root: ROOT, scheduledResult })')
  const notify = source.indexOf('await sendOpsTelegram(text, boundary)')
  assert.ok(generation > 0)
  assert.ok(stock > generation)
  assert.ok(notify > stock)
  assert.match(source, /SEND_DAYS/)
  assert.doesNotMatch(source, /git', \['fetch|checkScheduledGitReadiness|stocked-pending-sync|adminDiscoverability|convert-selected-topics/)
})

test('Telegram failures are explicit, durable, and retryable; only sent content dedupes', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  assert.match(source, /readRetryableNotification/)
  assert.match(source, /retryFailedReviewNotification/)
  assert.match(source, /await sendOpsTelegram\(pending\.text, \{ job: pending\.job, contentVersion: pending\.contentVersion \}\)/)
  assert.match(source, /reservation\.fail\(\{ text/)
  assert.match(source, /process\.exitCode = 1/)
  assert.match(source, /reservation\.commit\(\{ text \}\)/)
})

test('approval remains the only publication gate', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  assert.match(source, /--auto-publish を受け付けません/)
  assert.match(source, /approve \/ publish は実行していません/)
  assert.doesNotMatch(source, /approve-post|publish-post|git', \['push'/)
})
