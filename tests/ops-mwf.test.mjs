import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('ops:mwf generates one scheduled draft before Telegram review notification', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /月水金 08:30 の定期記事生成 CLI/)
  assert.match(source, /scheduled-article-flow\.mjs/)
  assert.match(source, /--no-generate/)
  assert.match(source, /--auto-publish/)
  assert.match(source, /--result-json/)
  assert.match(source, /--no-notify/)
  assert.match(source, /ANTHROPIC_API_KEY 未設定/)
  assert.match(source, /今日は生成対象の承認済みネタがありません/)
  assert.match(source, /approve \/ publish \/ push は実行していません/)

  const scheduledIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const notificationBuildIndex = source.indexOf('const notificationText = buildReviewRequestNotification')
  const sendIndex = source.lastIndexOf('await sendOpsTelegram')
  assert.ok(scheduledIndex > 0)
  assert.ok(notificationBuildIndex > scheduledIndex)
  assert.ok(sendIndex > notificationBuildIndex)
})

test('ops:mwf guards duplicate Telegram review notifications by date, job, and text', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /reserveNotificationSend/)
  assert.match(source, /ops-mwf-review-request/)
  assert.match(source, /同一日・同一job・同一本文の重複/)
  assert.match(source, /reservation\.commit\(\)/)
  assert.match(source, /reservation\.release\(\)/)

  const envCheckIndex = source.indexOf('if (!botToken || !chatId)')
  const reserveIndex = source.indexOf('const reservation = reserveNotificationSend')
  const sendIndex = source.indexOf('await sendTelegram')
  assert.ok(envCheckIndex > 0)
  assert.ok(reserveIndex > envCheckIndex)
  assert.ok(sendIndex > reserveIndex)
})
