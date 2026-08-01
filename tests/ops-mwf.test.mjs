import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyScheduledDraftOutcome,
  shouldSendDraftReviewNotification,
} from '../scripts/lib/scheduled-draft-notification.mjs'

function loadPureFunction(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} declaration is missing`)
  const bodyStart = source.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] !== '}') continue
    depth -= 1
    if (depth === 0) {
      const declaration = source.slice(start, index + 1)
      return Function(`"use strict"; ${declaration}; return ${name}`)()
    }
  }
  throw new Error(`${name} declaration is incomplete`)
}

test('ops:mwf generates one scheduled draft before Telegram review notification', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /月水金 08:30 の定期記事生成 CLI/)
  assert.match(source, /scheduled-article-flow\.mjs/)
  assert.match(source, /runThemeOpsFallback/)
  assert.match(source, /--no-generate/)
  assert.match(source, /--auto-publish/)
  assert.match(source, /--result-json/)
  assert.match(source, /--no-notify/)
  assert.match(source, /--publish-today/)
  assert.match(source, /OPENAI_API_KEY 未設定/)
  assert.doesNotMatch(source, /ANTHROPIC_API_KEY/)
  assert.match(source, /本文確認・承認/)
  assert.match(source, /checkScheduledGitReadiness/)
  assert.match(source, /prepareGeneratedDraftForHumanPush/)
  assert.match(source, /生成下書きのHuman Git同期待ち/)
  assert.match(source, /approve \/ publish は実行していません/)

  const readinessIndex = source.indexOf('gitReadiness = checkScheduledGitReadiness')
  const scheduledIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const classificationIndex = source.indexOf('scheduledOutcome = attachChildRunEvidence(classifyScheduledDraftOutcome')
  const syncIndex = source.indexOf('draftSyncResult = prepareGeneratedDraftForHumanPush')
  const notificationBuildIndex = source.indexOf('const notificationText = shouldSendScheduledIncidentNotification')
  const sendIndex = source.lastIndexOf('await sendOpsTelegram')
  assert.ok(readinessIndex > 0)
  assert.ok(scheduledIndex > 0)
  assert.ok(readinessIndex < scheduledIndex)
  assert.ok(classificationIndex > scheduledIndex)
  assert.ok(classificationIndex < syncIndex)
  assert.ok(syncIndex > scheduledIndex)
  assert.ok(notificationBuildIndex > scheduledIndex)
  assert.ok(sendIndex > notificationBuildIndex)
})

test('ops:mwf falls back to the canonical theme CSV only after the legacy topic pool is exhausted', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  const scheduledIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const fallbackIndex = source.indexOf('runThemeOpsFallback({')
  const syncIndex = source.indexOf('draftSyncResult = prepareGeneratedDraftForHumanPush')
  assert.ok(fallbackIndex > scheduledIndex)
  assert.ok(syncIndex > fallbackIndex)
  assert.match(source, /function isLegacyTopicPoolExhausted/)
  assert.match(source, /isLegacyTopicPoolExhausted\(scheduledChildStatus, scheduledResult\)/)
  assert.match(source, /未生成 approved topic はありません/)
  assert.match(source, /テーマリサーチから補充します/)
})

test('ops:mwf rejects auto-publish and keeps article approval as body review only', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /ops:mwf では --auto-publish を受け付けません/)
  assert.match(source, /process\.exit\(1\)/)
  assert.match(source, /本文確認後に承認/)
  assert.doesNotMatch(source, /--auto-publish', '--no-notify/)
})

test('ops:mwf dry-run exits before all queue, generation, Git, and notification effects', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  const dryRunIndex = source.indexOf("const dryRun = cliArgs.includes('--dry-run')")
  const exitIndex = source.indexOf('process.exit(0)', dryRunIndex)
  const lockIndex = source.indexOf('const runLock = acquireRunLock()')
  const envIndex = source.indexOf('loadEnv()')
  const queueSyncIndex = source.indexOf("run('convert-selected-topics.mjs'")
  const generationIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const notificationIndex = source.indexOf('await sendOpsTelegram')

  assert.ok(dryRunIndex > 0)
  assert.ok(exitIndex > dryRunIndex)
  for (const sideEffectIndex of [lockIndex, envIndex, queueSyncIndex, generationIndex, notificationIndex]) {
    assert.ok(sideEffectIndex > exitIndex)
  }
  assert.ok(source.includes('"queue_mutated":false'))
  assert.ok(source.includes('"notified":false'))
})

test('ops:mwf guards selected-topic persistence behind the generation decision and Git preflight', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  const syncHeaderIndex = source.indexOf("header('1/3  ネタリスト selected 同期')")
  const generationGuardIndex = source.indexOf('if (!generateDecision.ok)', syncHeaderIndex)
  const gitGuardIndex = source.indexOf('else if (!gitReadiness.ok)', generationGuardIndex)
  const queueSyncIndex = source.indexOf("run('convert-selected-topics.mjs'", gitGuardIndex)

  assert.ok(syncHeaderIndex > 0)
  assert.ok(generationGuardIndex > syncHeaderIndex)
  assert.ok(gitGuardIndex > generationGuardIndex)
  assert.ok(queueSyncIndex > gitGuardIndex)
})

test('ops:mwf promotes a nonzero selected-topic sync result to a fail-closed incident', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const classifyTopicSyncFailure = loadPureFunction(source, 'classifyTopicSyncFailure')

  const incident = classifyTopicSyncFailure({ status: 17, signal: null, termination: null })
  assert.deepEqual(incident, {
    kind: 'incident',
    reviewReady: false,
    exitCode: 17,
    reason: 'selected topic sync が exit 17 で停止しました',
  })

  const syncIndex = source.indexOf("run('convert-selected-topics.mjs'")
  const incidentIndex = source.indexOf('syncIncident = classifyTopicSyncFailure', syncIndex)
  const exitIndex = source.indexOf('process.exitCode = syncIncident.exitCode', incidentIndex)
  const generationIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  assert.ok(syncIndex > 0)
  assert.ok(incidentIndex > syncIndex)
  assert.ok(exitIndex > incidentIndex)
  assert.ok(exitIndex < generationIndex)
})

test('ops:mwf promotes owned-draft recovery failure to a fail-closed incident', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const classifyPreGenerationFailure = loadPureFunction(source, 'classifyPreGenerationFailure')

  assert.deepEqual(classifyPreGenerationFailure({
    stage: 'owned_draft_recovery',
    reason: 'marker_unreadable',
  }), {
    kind: 'incident',
    reviewReady: false,
    exitCode: 1,
    reason: 'owned_draft_recovery_failed:marker_unreadable',
  })
  assert.equal(classifyPreGenerationFailure({
    stage: 'no_generate',
    reason: 'manual_skip',
  }), null)

  const recoveryFailureIndex = source.indexOf('if (!draftRecoveryResult.ok)')
  const incidentIndex = source.indexOf('scheduledOutcome = classifyPreGenerationFailure({', recoveryFailureIndex)
  const stageIndex = source.indexOf("stage: 'owned_draft_recovery'", incidentIndex)
  const exitIndex = source.indexOf('process.exitCode = scheduledOutcome.exitCode', stageIndex)
  const gitReadinessIndex = source.indexOf('gitReadiness = checkScheduledGitReadiness()')
  assert.ok(recoveryFailureIndex > 0)
  assert.ok(incidentIndex > recoveryFailureIndex)
  assert.ok(stageIndex > incidentIndex)
  assert.ok(exitIndex > stageIndex)
  assert.ok(exitIndex < gitReadinessIndex)
})

test('ops:mwf promotes Git readiness failure to a fail-closed incident', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const classifyPreGenerationFailure = loadPureFunction(source, 'classifyPreGenerationFailure')

  assert.deepEqual(classifyPreGenerationFailure({
    stage: 'git_readiness',
    reason: 'origin_behind',
  }), {
    kind: 'incident',
    reviewReady: false,
    exitCode: 1,
    reason: 'git_readiness_failed:origin_behind',
  })

  const gitReadinessIndex = source.indexOf('gitReadiness = checkScheduledGitReadiness()')
  const readinessFailureIndex = source.indexOf('if (!gitReadiness.ok)', gitReadinessIndex)
  const incidentIndex = source.indexOf('scheduledOutcome = classifyPreGenerationFailure({', readinessFailureIndex)
  const stageIndex = source.indexOf("stage: 'git_readiness'", incidentIndex)
  const exitIndex = source.indexOf('process.exitCode = scheduledOutcome.exitCode', stageIndex)
  const syncHeaderIndex = source.indexOf("header('1/3  ネタリスト selected 同期')")
  assert.ok(gitReadinessIndex > 0)
  assert.ok(readinessFailureIndex > gitReadinessIndex)
  assert.ok(incidentIndex > readinessFailureIndex)
  assert.ok(stageIndex > incidentIndex)
  assert.ok(exitIndex > stageIndex)
  assert.ok(exitIndex < syncHeaderIndex)
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

test('ops:mwf locally commits only provenance-marked drafts after Git preflight and never pushes', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const gitignore = readFileSync('.gitignore', 'utf8')

  assert.match(source, /rememberGeneratedDraft/)
  assert.match(source, /recoverOwnedGeneratedDraft/)
  assert.match(source, /classifyOwnedDraftStatus/)
  assert.match(source, /classifyOwnedDraftStatus\(status\.output, ownedDraftPath\)/)
  assert.match(source, /prepareGeneratedDraftForHumanPush/)
  assert.match(source, /assertGitReady: \(marker\) => checkScheduledGitReadiness\(\{ ownedDraftPath: marker\.path \}\)/)
  assert.match(source, /Human push待ち/)
  assert.match(gitignore, /^logs\/ops-mwf-owned-draft\.json$/m)
  assert.match(gitignore, /^logs\/ops-mwf-owned-draft\.json\.\*\.tmp$/m)
  assert.doesNotMatch(source, /git', \['add'/)
  assert.doesNotMatch(source, /git', \['commit'/)
  assert.doesNotMatch(source, /git', \['push'/)
})

test('ops:mwf suppresses the review request when owned-draft recovery fails', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /draftSyncResult = draftRecoveryResult/)
  assert.match(source, /shouldSendDraftReviewNotification\(scheduledOutcome\)/)
  assert.match(source, /レビュー可能な生成下書きがないためTelegramレビュー依頼は送信しません/)
  const syncFailure = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    draftSyncResult: { ok: false },
  })
  assert.equal(shouldSendDraftReviewNotification(syncFailure), false)
})

test('ops:mwf requires a confirmed local draft commit before review notification classification', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /function requireCommittedDraftSync/)
  assert.match(source, /draftSyncResult\.committed !== true/)
  assert.match(source, /local commitを確認できないためレビュー通知を停止/)
  assert.match(source, /draftSyncResult = requireCommittedDraftSync\(draftSyncResult\)/)

  const guardIndex = source.indexOf('draftSyncResult.committed !== true')
  const classifyIndex = source.lastIndexOf('scheduledOutcome = classifyScheduledDraftOutcome')
  assert.ok(guardIndex > 0)
  assert.ok(classifyIndex > guardIndex)
})

test('ops:mwf stops before generation only when Git is dirty, behind, diverged, or unreadable', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const readinessSource = readFileSync('scripts/lib/scheduled-git-readiness.mjs', 'utf8')

  assert.match(source, /git', \['status', '--porcelain'\]/)
  assert.match(source, /git', \['fetch', 'origin', 'main'\]/)
  assert.match(source, /git', \['rev-list', '--left-right', '--count', 'HEAD\.\.\.origin\/main'\]/)
  assert.match(source, /Git同期が安全でないため記事生成を停止/)
  assert.match(source, /Git: branch \$\{details\.branch/)
  assert.match(source, /Human push待ち/)
  assert.match(readinessSource, /未commit変更があります/)
  assert.match(readinessSource, /GitHub側に未取得commitがあります/)
  assert.match(readinessSource, /origin\/mainと整合しています/)
  assert.match(readinessSource, /Human push待ち/)

  const readinessIndex = source.indexOf('gitReadiness = checkScheduledGitReadiness')
  const scheduledIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  assert.ok(readinessIndex > 0)
  assert.ok(scheduledIndex > readinessIndex)
})

test('ops:mwf launchd setup uses the GUI domain APIs for only its own job', () => {
  const source = readFileSync('scripts/setup-launchd-mwf.mjs', 'utf8')

  assert.match(source, /return `gui\/\$\{process\.getuid\(\)\}`/)
  assert.match(source, /runLaunchctl\(\['print', `\$\{launchdDomain\(\)\}\/\$\{LABEL\}`\]\)/)
  assert.match(source, /runLaunchctl\(\['bootout', launchdDomain\(\), PLIST_PATH\]\)/)
  assert.match(source, /runLaunchctl\(\['bootstrap', launchdDomain\(\), PLIST_PATH\]\)/)
  assert.doesNotMatch(source, /runLaunchctl\(\['(?:list|load|unload)'/)
  assert.doesNotMatch(source, /com\.mitani\.aisoukai-media-(?:telegram-ops|media)/)
})

test('ops:mwf launchd uses the approved normal mode without bypassing review safeguards', () => {
  const source = readFileSync('scripts/setup-launchd-mwf.mjs', 'utf8')

  assert.ok(source.includes('<string>--force</string>'))
  assert.doesNotMatch(source, /<string>--dry-run<\/string>/)
  assert.match(source, /Git preflight と記事レビュー境界は ops-mwf 側で維持/)
  assert.match(source, /通常生成/)
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

test('ops:mwf uses separate copy and dedupe identity for incident notifications', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const notificationSource = readFileSync('scripts/lib/scheduled-draft-notification.mjs', 'utf8')

  assert.match(source, /buildScheduledIncidentNotification/)
  assert.match(source, /月水金の記事生成インシデント/)
  assert.match(source, /Telegramレビュー依頼は送信していません/)
  assert.match(notificationSource, /ops-mwf-incident/)
  assert.match(notificationSource, /ops-mwf-review-request/)
  assert.match(source, /shouldSendScheduledIncidentNotification/)
})

test('ops:mwf preserves child exit ordering and never lets already-live reset an incident', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  const childRunIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const outcomeIndex = source.indexOf('scheduledOutcome = attachChildRunEvidence(classifyScheduledDraftOutcome')
  const syncIndex = source.indexOf('draftSyncResult = prepareGeneratedDraftForHumanPush')
  const alreadyLiveIndex = source.indexOf('const alreadyLiveNoop = alreadyLiveTodayNoop')

  assert.ok(childRunIndex < outcomeIndex)
  assert.ok(outcomeIndex < syncIndex)
  assert.ok(syncIndex < alreadyLiveIndex)
  assert.match(source, /normalizeSpawnSyncResult\(result\)/)
  assert.match(source, /process\.exitCode = scheduledOutcome\.exitCode/)
  assert.doesNotMatch(source, /if \(alreadyLiveTodayNoop[\s\S]{0,120}process\.exitCode = 0/)
  assert.doesNotMatch(source, /process\.exitCode = 0/)

  const incident = classifyScheduledDraftOutcome({
    childStatus: 17,
    scheduledResult: { ok: false, generated: false },
  })
  assert.equal(incident.exitCode, 17)
  assert.equal(shouldSendDraftReviewNotification(incident), false)
})

test('ops:mwf preserves signal, nonzero, and malformed child results as distinct fail-closed incidents', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  const normalizeSpawnSyncResult = loadPureFunction(source, 'normalizeSpawnSyncResult')
  const attachChildRunEvidence = loadPureFunction(source, 'attachChildRunEvidence')

  for (const [signal, expectedExit] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const childRunResult = normalizeSpawnSyncResult({ status: null, signal, error: undefined })
    const outcome = attachChildRunEvidence(classifyScheduledDraftOutcome({
      childStatus: childRunResult.status,
      scheduledResult: { ok: false, generated: false },
    }), childRunResult)

    assert.equal(childRunResult.status, expectedExit)
    assert.equal(childRunResult.termination, `signal_${signal}`)
    assert.equal(outcome.kind, 'incident')
    assert.equal(outcome.exitCode, expectedExit)
    assert.equal(outcome.childSignal, signal)
    assert.match(outcome.reason, new RegExp(`${signal}.*exit ${expectedExit}`))
    assert.equal(shouldSendDraftReviewNotification(outcome), false)
  }

  const nonzero = normalizeSpawnSyncResult({ status: 17, signal: null, error: undefined })
  const nonzeroOutcome = classifyScheduledDraftOutcome({
    childStatus: nonzero.status,
    scheduledResult: { ok: false, generated: false },
  })
  assert.deepEqual(nonzero, { status: 17, signal: null, termination: null })
  assert.equal(nonzeroOutcome.kind, 'incident')
  assert.equal(nonzeroOutcome.exitCode, 17)

  const unknown = normalizeSpawnSyncResult({ status: null, signal: null, error: undefined })
  const malformedOutcome = classifyScheduledDraftOutcome({ childStatus: 0, scheduledResult: {} })
  assert.deepEqual(unknown, { status: 1, signal: null, termination: 'unknown_result' })
  assert.equal(malformedOutcome.kind, 'incident')
  assert.equal(malformedOutcome.exitCode, 1)
  assert.match(malformedOutcome.reason, /結果JSONが不正/)
})

test('ops:mwf reports already-live today posts before no-topic notifications', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /loadContentStatus/)
  assert.match(source, /findTodayLivePosts/)
  assert.match(source, /alreadyLiveTodayNoop/)
  assert.match(source, /本日公開対象の記事は既に公開中です/)
  assert.match(source, /新規下書き生成: なし/)
  assert.match(source, /本日分は公開済みのためTelegramレビュー依頼は送信しません/)
  assert.doesNotMatch(source, /process\.exitCode = 0/)

  const todayLiveIndex = source.indexOf('const todayLivePosts = findTodayLivePosts')
  const alreadyLiveIndex = source.indexOf('本日公開対象の記事は既に公開中です')
  const noTopicIndex = source.indexOf('本日配信予定の未承認記事はありません。')
  assert.ok(todayLiveIndex > 0)
  assert.ok(alreadyLiveIndex > todayLiveIndex)
  assert.ok(noTopicIndex > alreadyLiveIndex)
})
