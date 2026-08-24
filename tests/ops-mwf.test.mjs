import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

test('weekly job syncs only through the owned-draft fail-closed helper before choosing an admin CTA', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const generation = source.indexOf('runScheduledArticle(resultPath)')
  const stock = source.indexOf('rememberGeneratedDraft({ root: ROOT, scheduledResult })')
  const sync = source.indexOf('syncOwnedGeneratedDraft({')
  const notify = source.indexOf('await sendOpsTelegram(text, boundary)')
  assert.ok(generation > 0)
  assert.ok(stock > generation)
  assert.ok(sync > stock)
  assert.ok(notify > sync)
  assert.match(source, /SEND_DAYS/)
  assert.match(source, /syncOwnedGeneratedDraft/)
  assert.match(source, /process\.execPath/)
  assert.match(source, /PATH: process\.env\.PATH/)
  assert.doesNotMatch(source, /git add \.|git', \['push'/)
  assert.doesNotMatch(source, /convert-selected-topics|approve-post|publish-post/)
})

test('local stock notices stay CTA-free, while only a synced outcome can select the review-request job', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  assert.match(source, /ops-mwf-stock-notice/)
  assert.match(source, /buildScheduledReviewNotification/)
  assert.match(source, /outcome\.kind === 'synced'/)
  assert.match(source, /reservation\.fail\(\{ text/)
  assert.match(source, /process\.exitCode = 1/)
  assert.match(source, /reservation\.commit\(\{ text \}\)/)
  assert.doesNotMatch(source, /resolveNotificationSiteUrl|readRetryableNotification|retryFailedReviewNotification/)
})

test('approval remains the only publication gate', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  assert.match(source, /--auto-publish を受け付けません/)
  assert.match(source, /approve \/ publish は実行していません/)
  assert.doesNotMatch(source, /approve-post|publish-post|git', \['push'/)
})
