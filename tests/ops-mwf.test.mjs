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
  assert.match(source, /--publish-today/)
  assert.match(source, /ANTHROPIC_API_KEY 未設定/)
  assert.match(source, /本文確認・承認/)
  assert.match(source, /approve \/ publish \/ push は実行していません/)

  const scheduledIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const notificationBuildIndex = source.indexOf('const notificationText = buildReviewRequestNotification')
  const sendIndex = source.lastIndexOf('await sendOpsTelegram')
  assert.ok(scheduledIndex > 0)
  assert.ok(notificationBuildIndex > scheduledIndex)
  assert.ok(sendIndex > notificationBuildIndex)
})

test('ops:mwf rejects auto-publish and keeps article approval as body review only', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /ops:mwf では --auto-publish を受け付けません/)
  assert.match(source, /process\.exit\(1\)/)
  assert.match(source, /本文確認後に承認/)
  assert.doesNotMatch(source, /--auto-publish', '--no-notify/)
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

test('ops:mwf reports already-live today posts before no-topic notifications', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /loadContentStatus/)
  assert.match(source, /findTodayLivePosts/)
  assert.match(source, /alreadyLiveTodayNoop/)
  assert.match(source, /本日公開対象の記事は既に公開中です/)
  assert.match(source, /新規下書き生成: なし/)
  assert.match(source, /process\.exitCode = 0/)

  const todayLiveIndex = source.indexOf('const todayLivePosts = findTodayLivePosts')
  const alreadyLiveIndex = source.indexOf('本日公開対象の記事は既に公開中です')
  const noTopicIndex = source.indexOf('本日配信予定の未承認記事はありません。')
  assert.ok(todayLiveIndex > 0)
  assert.ok(alreadyLiveIndex > todayLiveIndex)
  assert.ok(noTopicIndex > alreadyLiveIndex)
})
