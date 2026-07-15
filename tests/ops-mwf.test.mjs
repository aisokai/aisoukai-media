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
  assert.match(source, /OPENAI_API_KEY 未設定/)
  assert.doesNotMatch(source, /ANTHROPIC_API_KEY/)
  assert.match(source, /本文確認・承認/)
  assert.match(source, /checkScheduledGitReadiness/)
  assert.match(source, /syncGeneratedDraftToGitHub/)
  assert.match(source, /生成下書きのGitHub同期/)
  assert.match(source, /approve \/ publish は実行していません/)

  const readinessIndex = source.indexOf('gitReadiness = checkScheduledGitReadiness')
  const scheduledIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const syncIndex = source.indexOf('draftSyncResult = syncGeneratedDraftToGitHub')
  const notificationBuildIndex = source.indexOf('const notificationText = buildReviewRequestNotification')
  const sendIndex = source.lastIndexOf('await sendOpsTelegram')
  assert.ok(readinessIndex > 0)
  assert.ok(scheduledIndex > 0)
  assert.ok(readinessIndex < scheduledIndex)
  assert.ok(syncIndex > scheduledIndex)
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

test('ops:mwf has a process lock to prevent cron and launchd double generation', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const gitignore = readFileSync('.gitignore', 'utf8')

  assert.match(source, /ops-mwf\.lock/)
  assert.match(source, /acquireRunLock/)
  assert.match(source, /openSync\(LOCK_PATH, 'wx'\)/)
  assert.match(source, /別の ops:mwf が実行中です/)
  assert.match(source, /process\.on\('exit', releaseRunLock\)/)
  assert.match(gitignore, /^logs\/ops-mwf\.lock$/m)
})

test('ops:mwf only syncs the generated draft path to GitHub for production review', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /isSafeGeneratedPostPath/)
  assert.match(source, /content\\\/posts\\\/\\d\{4\}-\\d\{2\}-\\d\{2\}-\[a-z0-9-\]\+\\\.md/)
  assert.match(source, /git', \['add', '--', relPath\]/)
  assert.match(source, /git', \['commit', '-m', `draft: \$\{scheduledResult\.slug\}`\]/)
  assert.match(source, /git', \['push', 'origin', 'main'\]/)
  assert.doesNotMatch(source, /git', \['add', '-A'\]/)
})

test('ops:mwf stops before generation when git is dirty or out of sync', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /git', \['status', '--porcelain'\]/)
  assert.match(source, /未commit変更があります/)
  assert.match(source, /git', \['fetch', 'origin', 'main'\]/)
  assert.match(source, /git', \['rev-list', '--left-right', '--count', 'HEAD\.\.\.origin\/main'\]/)
  assert.match(source, /GitHub側に未取得commitがあります/)
  assert.match(source, /ローカルのみのcommitがあります/)
  assert.match(source, /Git同期が安全でないため記事生成を停止/)

  const readinessIndex = source.indexOf('gitReadiness = checkScheduledGitReadiness')
  const scheduledIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  assert.ok(readinessIndex > 0)
  assert.ok(scheduledIndex > readinessIndex)
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
