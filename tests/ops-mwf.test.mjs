import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildScheduledFailureNotification,
  buildScheduledStockNotification,
  classifyScheduledDraftOutcome,
  shouldSendDraftReviewNotification,
  shouldSendScheduledIncidentNotification,
  shouldSendStockUpdateNotification,
} from '../scripts/lib/scheduled-draft-notification.mjs'

function functionDeclaration(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} declaration is missing`)
  const bodyStart = source.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] !== '}') continue
    depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  throw new Error(`${name} declaration is incomplete`)
}

function loadPureFunction(source, name, globals = {}) {
  const names = Object.keys(globals)
  const values = Object.values(globals)
  return Function(...names, `"use strict"; ${functionDeclaration(source, name)}; return ${name}`)(...values)
}

test('ops:mwf generates and durably stocks before any Git readiness assessment', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const queueSyncIndex = source.indexOf("run('convert-selected-topics.mjs'")
  const generationIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const prepareCallIndex = source.indexOf('const prepared = prepareGeneratedDraftForHumanPush', generationIndex)
  const prepareSource = functionDeclaration(source, 'prepareGeneratedDraftForHumanPush')
  const rememberIndex = prepareSource.indexOf('const stockResult = rememberGeneratedDraft')
  const readinessIndex = prepareSource.indexOf('const gitReadiness = checkScheduledGitReadiness')
  const recoveryIndex = prepareSource.indexOf('const draftSyncResult = recoverOwnedGeneratedDraft')
  const notificationIndex = source.indexOf('const notificationText = shouldSendScheduledIncidentNotification')

  assert.ok(queueSyncIndex > 0)
  assert.ok(generationIndex > queueSyncIndex)
  assert.ok(prepareCallIndex > generationIndex)
  assert.ok(rememberIndex > 0)
  assert.ok(readinessIndex > rememberIndex)
  assert.ok(recoveryIndex > readinessIndex)
  assert.ok(notificationIndex > prepareCallIndex)
  assert.doesNotMatch(source, /classifyPreGenerationFailure/)
  assert.doesNotMatch(source, /Git同期が安全でないため記事生成を停止/)
})

test('selected-topic persistence depends on generation safety, never Git preflight', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const syncHeaderIndex = source.indexOf("header('1/3  ネタリスト selected 同期')")
  const generateGuardIndex = source.indexOf('if (!generateDecision.ok)', syncHeaderIndex)
  const queueSyncIndex = source.indexOf("run('convert-selected-topics.mjs'", generateGuardIndex)
  const generationIndex = source.indexOf("run('scheduled-article-flow.mjs'", queueSyncIndex)
  const prepareCallIndex = source.indexOf('const prepared = prepareGeneratedDraftForHumanPush', generationIndex)
  const guardedBlock = source.slice(syncHeaderIndex, generationIndex)

  assert.ok(syncHeaderIndex > 0)
  assert.ok(generateGuardIndex > syncHeaderIndex)
  assert.ok(queueSyncIndex > generateGuardIndex)
  assert.ok(generationIndex > queueSyncIndex)
  assert.ok(prepareCallIndex > generationIndex)
  assert.doesNotMatch(guardedBlock, /gitReadiness|checkScheduledGitReadiness|recoverOwnedGeneratedDraft/)
})

test('nonzero selected-topic sync remains a fail-closed generation incident before article generation', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const classifyTopicSyncFailure = loadPureFunction(source, 'classifyTopicSyncFailure')
  assert.deepEqual(classifyTopicSyncFailure({ status: 17, signal: null, termination: null }), {
    kind: 'incident',
    reviewReady: false,
    exitCode: 17,
    reason: 'selected topic sync が exit 17 で停止しました',
  })

  const syncIndex = source.indexOf("run('convert-selected-topics.mjs'")
  const classifyIndex = source.indexOf('syncIncident = classifyTopicSyncFailure', syncIndex)
  const exitIndex = source.indexOf('process.exitCode = syncIncident.exitCode', classifyIndex)
  const generationIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  assert.ok(syncIndex > 0)
  assert.ok(classifyIndex > syncIndex)
  assert.ok(exitIndex > classifyIndex)
  assert.ok(generationIndex > exitIndex)
})

test('dirty, ahead, behind, diverged, fetch failure, index lock, and unknown Git states classify as stocked pending sync exit zero', () => {
  for (const reason of ['dirty tracked', 'dirty untracked', 'dirty staged', 'ahead-only', 'behind', 'diverged', 'fetch failure', 'index lock', 'unknown']) {
    const outcome = classifyScheduledDraftOutcome({
      childStatus: 0,
      scheduledResult: { ok: true, generated: true },
      stockResult: { ok: true, stocked: true },
      draftSyncResult: { ok: false, reason },
    })
    assert.equal(outcome.kind, 'stocked-pending-sync')
    assert.equal(outcome.exitCode, 0)
    assert.equal(shouldSendStockUpdateNotification(outcome), false)
    assert.equal(shouldSendScheduledIncidentNotification(outcome), false)
  }
})

test('Telegram copy exposes only the three plain-language stock outcomes', () => {
  const reflected = buildScheduledStockNotification({
    outcome: { kind: 'review-ready' },
    dashboardUrl: 'https://aisoukai-media.vercel.app/admin/pending-review',
  })
  const pending = buildScheduledStockNotification({ outcome: { kind: 'stocked-pending-sync' } })
  const failure = buildScheduledFailureNotification()

  assert.equal(reflected, '新しい記事を1件ストックしました。管理画面で確認できます。\nhttps://aisoukai-media.vercel.app/admin/pending-review')
  assert.equal(pending, '新しい記事を1件ストックしました。管理画面への反映待ちです。')
  assert.equal(failure, '記事ストックを更新できませんでした。次回再試行します。')
  assert.match(reflected, /admin\/pending-review/)
  assert.doesNotMatch(pending, /https?:\/\//)
  for (const text of [reflected, pending, failure]) {
    assert.doesNotMatch(text, /Git|git|dirty|commit|exit|code|コード|ログ|HEAD|branch|push/i)
  }

  const notificationSource = readFileSync('scripts/lib/scheduled-draft-notification.mjs', 'utf8')
  for (const name of ['buildScheduledStockNotification', 'buildScheduledFailureNotification']) {
    assert.doesNotMatch(functionDeclaration(notificationSource, name), /終了コード|Git同期|dirty|commit|ログを確認/)
  }
})

test('Git-only pending remains non-notified until the admin source confirms the exact version', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const notificationSource = readFileSync('scripts/lib/scheduled-draft-notification.mjs', 'utf8')
  assert.match(source, /shouldSendStockUpdateNotification\(scheduledOutcome\)/)
  assert.doesNotMatch(notificationSource, /ops-mwf-stock-update/)
  assert.match(notificationSource, /ops-mwf-review-request/)
  assert.match(notificationSource, /ops-mwf-incident/)
  assert.match(source, /reserveNotificationSend/)
  assert.match(source, /reservation\.commit\(\)/)
  assert.match(source, /reservation\.release\(\)/)
})

test('saved pending-review receipts perform the bounded freshness check on a later invocation', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const helper = functionDeclaration(source, 'pendingReviewRecheckReadiness')
  const receiptCheck = helper.indexOf('readPendingReviewReceipts(REVIEW_PENDING_PATH).length === 0')
  const readinessCheck = helper.indexOf('return checkScheduledGitReadiness()')
  const recheckCall = source.indexOf('const pendingReviewReadiness = pendingReviewRecheckReadiness(gitReadiness)')

  assert.ok(receiptCheck >= 0)
  assert.ok(readinessCheck > receiptCheck)
  assert.ok(recheckCall > 0)
  assert.match(source, /adminSourceFresh: pendingReviewReadiness\?\.adminSourceFresh/)

  const existingReadiness = { adminSourceFresh: true }
  const freshReadiness = { adminSourceFresh: true, reason: 'fresh' }
  const noReceipt = loadPureFunction(source, 'pendingReviewRecheckReadiness', {
    readPendingReviewReceipts: () => [],
    REVIEW_PENDING_PATH: 'ignored',
    checkScheduledGitReadiness: () => { throw new Error('must not check without a receipt') },
  })
  assert.equal(noReceipt(existingReadiness), existingReadiness)
  assert.equal(noReceipt(null), null)
  const withReceipt = loadPureFunction(source, 'pendingReviewRecheckReadiness', {
    readPendingReviewReceipts: () => [{ path: 'content/posts/2026-08-01-pending.md' }],
    REVIEW_PENDING_PATH: 'ignored',
    checkScheduledGitReadiness: () => freshReadiness,
  })
  assert.equal(withReceipt(null), freshReadiness)
})

test('true generation or stocking failures use the failure update and retain nonzero exit', () => {
  const generationFailure = classifyScheduledDraftOutcome({
    childStatus: 17,
    scheduledResult: { ok: false, generated: false },
  })
  const stockFailure = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    stockResult: { ok: false, stocked: false, reason: 'unsafe path' },
  })
  assert.equal(generationFailure.kind, 'incident')
  assert.equal(generationFailure.exitCode, 17)
  assert.equal(stockFailure.kind, 'incident')
  assert.equal(stockFailure.exitCode, 1)
  assert.equal(shouldSendScheduledIncidentNotification(stockFailure), true)
})

test('child signal and exit evidence is preserved before stock handling and already-live checks', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const normalizeSpawnSyncResult = loadPureFunction(source, 'normalizeSpawnSyncResult')
  const attachChildRunEvidence = loadPureFunction(source, 'attachChildRunEvidence')
  for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const child = normalizeSpawnSyncResult({ status: null, signal, error: undefined })
    const outcome = attachChildRunEvidence(classifyScheduledDraftOutcome({
      childStatus: child.status,
      scheduledResult: { ok: false, generated: false },
    }), child)
    assert.equal(child.status, exitCode)
    assert.equal(outcome.exitCode, exitCode)
    assert.equal(outcome.childSignal, signal)
    assert.match(outcome.reason, new RegExp(`${signal}.*exit ${exitCode}`))
  }
  assert.deepEqual(normalizeSpawnSyncResult({ status: 17, signal: null }), {
    status: 17,
    signal: null,
    termination: null,
  })
  assert.deepEqual(normalizeSpawnSyncResult({ status: null, signal: null }), {
    status: 1,
    signal: null,
    termination: 'unknown_result',
  })

  const generationIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const outcomeIndex = source.indexOf('scheduledOutcome = attachChildRunEvidence(classifyScheduledDraftOutcome', generationIndex)
  const stockIndex = source.indexOf('const prepared = prepareGeneratedDraftForHumanPush', outcomeIndex)
  const alreadyLiveIndex = source.indexOf('const alreadyLiveNoop = alreadyLiveTodayNoop', stockIndex)
  assert.ok(outcomeIndex > generationIndex)
  assert.ok(stockIndex > outcomeIndex)
  assert.ok(alreadyLiveIndex > stockIndex)
  assert.doesNotMatch(source, /if \(alreadyLiveTodayNoop[\s\S]{0,120}process\.exitCode = 0/)
  assert.doesNotMatch(source, /process\.exitCode = 0/)
})

test('ops:mwf never pushes, approves, or publishes and rejects auto-publish', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const commitSource = readFileSync('scripts/lib/scheduled-draft-commit.mjs', 'utf8')
  assert.match(source, /ops:mwf では --auto-publish を受け付けません/)
  assert.match(source, /approve \/ publish は実行していません/)
  assert.doesNotMatch(source, /git', \['push'/)
  assert.doesNotMatch(commitSource, /git', \['push'/)
  assert.doesNotMatch(source, /approve-post|publish-post|auto-review-post/)
  assert.doesNotMatch(commitSource, /runCommand\('(?:approve|publish)'/)
})

test('ops:mwf preserves process lock, weekday, no-generate, already-live, and child-failure semantics', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const gitignore = readFileSync('.gitignore', 'utf8')
  assert.match(source, /openSync\(LOCK_PATH, 'wx'\)/)
  assert.match(source, /別の ops:mwf が実行中です/)
  assert.match(source, /process\.on\('exit', releaseRunLock\)/)
  assert.match(source, /SEND_DAYS/)
  assert.match(source, /--no-generate/)
  assert.match(source, /OPENAI_API_KEY 未設定/)
  assert.match(source, /alreadyLiveTodayNoop/)
  assert.match(source, /normalizeSpawnSyncResult/)
  assert.match(gitignore, /^logs\/ops-mwf\.lock$/m)
  assert.match(gitignore, /^logs\/ops-mwf-owned-draft\.json$/m)
})

test('launchd setup remains scoped to its own GUI job and uses normal reviewed mode', () => {
  const source = readFileSync('scripts/setup-launchd-mwf.mjs', 'utf8')
  assert.match(source, /return `gui\/\$\{process\.getuid\(\)\}`/)
  assert.match(source, /runLaunchctl\(\['print', `\$\{launchdDomain\(\)\}\/\$\{LABEL\}`\]\)/)
  assert.match(source, /runLaunchctl\(\['bootout', launchdDomain\(\), PLIST_PATH\]\)/)
  assert.match(source, /runLaunchctl\(\['bootstrap', launchdDomain\(\), PLIST_PATH\]\)/)
  assert.doesNotMatch(source, /runLaunchctl\(\['(?:list|load|unload)'/)
  assert.doesNotMatch(source, /com\.mitani\.aisoukai-media-(?:telegram-ops|media)/)
  assert.ok(source.includes('<string>--force</string>'))
  assert.doesNotMatch(source, /<string>--dry-run<\/string>/)
  assert.match(source, /通常生成/)
})

test('Telegram dedupe reserves only after credentials and commits only after successful send', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const envIndex = source.indexOf('if (!botToken || !chatId)')
  const reserveIndex = source.indexOf('const reservation = reserveNotificationSend', envIndex)
  const sendIndex = source.indexOf('await sendTelegram', reserveIndex)
  const commitIndex = source.indexOf('reservation.commit()', sendIndex)
  const releaseIndex = source.indexOf('reservation.release()', commitIndex)
  assert.ok(envIndex > 0)
  assert.ok(reserveIndex > envIndex)
  assert.ok(sendIndex > reserveIndex)
  assert.ok(commitIndex > sendIndex)
  assert.ok(releaseIndex > commitIndex)
  assert.match(source, /同一コンテンツ版の重複/)
})

test('ops:mwf fallback occurs after the legacy topic pool is exhausted and before durable stocking', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const generationIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const fallbackIndex = source.indexOf('runThemeOpsFallback({')
  const prepareCallIndex = source.indexOf('const prepared = prepareGeneratedDraftForHumanPush', fallbackIndex)
  assert.ok(fallbackIndex > generationIndex)
  assert.ok(prepareCallIndex > fallbackIndex)
  assert.match(source, /isLegacyTopicPoolExhausted/)
  assert.match(source, /未生成 approved topic はありません/)
})

test('ops:mwf dry-run exits before queue, generation, Git, and notification effects', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const dryRunIndex = source.indexOf("const dryRun = cliArgs.includes('--dry-run')")
  const exitIndex = source.indexOf('process.exit(0)', dryRunIndex)
  for (const sideEffect of [
    'const runLock = acquireRunLock()',
    'loadEnv()',
    "run('convert-selected-topics.mjs'",
    "run('scheduled-article-flow.mjs'",
    'await sendOpsTelegram',
  ]) {
    assert.ok(source.indexOf(sideEffect) > exitIndex, sideEffect)
  }
  assert.ok(source.includes('"queue_mutated":false'))
  assert.ok(source.includes('"notified":false'))
})

test('review request requires stocking and exact local reflection evidence', () => {
  const missingSync = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    stockResult: { ok: true, stocked: true },
    draftSyncResult: { ok: true, committed: false },
  })
  assert.equal(missingSync.kind, 'stocked-pending-sync')
  assert.equal(missingSync.exitCode, 0)
  assert.equal(shouldSendDraftReviewNotification(missingSync), false)
  assert.equal(shouldSendStockUpdateNotification(missingSync), false)
})
