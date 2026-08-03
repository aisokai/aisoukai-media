#!/usr/bin/env node
// ops-mwf.mjs
// 月水金 08:30 の定期記事生成 CLI。
// やることは 1) selected ネタを承認済み topic に同期 2) 承認済み topic から1記事生成
// 3) Git 状態にかかわらず画像設定済みの下書きをローカルにストック
// 4) ストック後に安全な場合だけ管理対象draftをlocal commit（pushは常にHuman操作）
// 5) Telegram ではストック結果と管理画面への反映有無だけを通知。
// approve / publish / Telegram request 取得は実行しない。
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveNotificationSiteUrl } from './lib/site-url.mjs'
import { reserveNotificationSend } from './lib/notification-dedupe.mjs'
import { loadContentStatus } from './lib/content-status.mjs'
import { runThemeOpsFallback } from './lib/theme-ops-fallback.mjs'
import { assessScheduledGitReadiness } from './lib/scheduled-git-readiness.mjs'
import {
  classifyOwnedDraftStatus,
  recoverOwnedGeneratedDraft,
  rememberGeneratedDraft,
} from './lib/scheduled-draft-commit.mjs'
import {
  buildScheduledFailureNotification,
  buildScheduledStockNotification,
  classifyScheduledDraftOutcome,
  scheduledDraftNotificationBoundary,
  shouldSendDraftReviewNotification,
  shouldSendStockUpdateNotification,
  shouldSendScheduledIncidentNotification,
} from './lib/scheduled-draft-notification.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LOG_DIR = join(ROOT, 'logs')
const LOCK_PATH = join(LOG_DIR, 'ops-mwf.lock')
const LOCK_STALE_MS = 2 * 60 * 60 * 1000
const SEND_DAYS = new Set([1, 3, 5]) // 月=1, 水=3, 金=5 (JST UTC+9)
const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土']

const cliArgs = process.argv.slice(2)
const force = cliArgs.includes('--force')
const noGenerate = cliArgs.includes('--no-generate')
const dryRun = cliArgs.includes('--dry-run')
const ignoredAutoPublish = cliArgs.includes('--auto-publish')

if (ignoredAutoPublish) {
  console.error('  ❌ ops:mwf では --auto-publish を受け付けません。本文確認後に承認してください。')
  process.exit(1)
}

// launchd の復旧確認用。実キュー・環境変数・Git・外部サービスへは触れずに終了する。
// 本文生成を伴う通常モードへの切替は、別の Human Gate を必要とする。
if (dryRun) {
  console.log('ops:mwf dry-run: 安全確認のみ完了（生成・CSV更新・Git・通知は実行していません）')
  console.log('DRY_RUN_RESULT {"ok":true,"generated":false,"queue_mutated":false,"notified":false}')
  process.exit(0)
}

const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
const TODAY = nowJst.toISOString().slice(0, 10)
const dayOfWeek = nowJst.getUTCDay()
const dayName = DAY_NAMES_JA[dayOfWeek]
const isSendDay = SEND_DAYS.has(dayOfWeek)

const WIDE = '═'.repeat(60)
const BAR = '─'.repeat(60)

function acquireRunLock() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
  try {
    const fd = openSync(LOCK_PATH, 'wx')
    writeFileSync(fd, JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }) + '\n')
    return { acquired: true, fd }
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      return { acquired: false, reason: `ロック作成に失敗: ${error.message}` }
    }
    try {
      const raw = readFileSync(LOCK_PATH, 'utf8')
      const parsed = JSON.parse(raw)
      const startedAt = Date.parse(parsed.startedAt)
      if (Number.isFinite(startedAt) && Date.now() - startedAt > LOCK_STALE_MS) {
        unlinkSync(LOCK_PATH)
        return acquireRunLock()
      }
    } catch {
      // 壊れた lock は二重起動防止を優先して残す。
    }
    return { acquired: false, reason: '別の ops:mwf が実行中です' }
  }
}

const runLock = acquireRunLock()
if (!runLock.acquired) {
  console.log(`  ⏭ ${runLock.reason}`)
  process.exit(0)
}

function releaseRunLock() {
  try {
    if (runLock.fd !== undefined) closeSync(runLock.fd)
  } catch {}
  try {
    if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH)
  } catch {}
}

process.on('exit', releaseRunLock)
process.on('SIGINT', () => {
  releaseRunLock()
  process.exit(130)
})
process.on('SIGTERM', () => {
  releaseRunLock()
  process.exit(143)
})

function header(title) {
  console.log()
  console.log('━'.repeat(60))
  console.log(`  ${title}`)
  console.log('━'.repeat(60))
}

function normalizeSpawnSyncResult(result) {
  const signalExitCodes = { SIGINT: 130, SIGTERM: 143 }
  const signal = typeof result?.signal === 'string' && result.signal ? result.signal : null
  if (signal) {
    return {
      status: signalExitCodes[signal] ?? 1,
      signal,
      termination: 'signal_' + signal,
    }
  }
  if (Number.isInteger(result?.status) && result.status >= 0) {
    return { status: result.status, signal: null, termination: null }
  }
  if (result?.error) {
    return { status: 1, signal: null, termination: 'spawn_error' }
  }
  return { status: 1, signal: null, termination: 'unknown_result' }
}

function attachChildRunEvidence(outcome, childRunResult) {
  if (outcome?.kind !== 'incident' || !childRunResult?.termination) return outcome
  const reason = childRunResult.signal
    ? 'scheduled child が ' + childRunResult.signal + ' で停止しました (exit ' + childRunResult.status + ')'
    : 'scheduled child の実行結果が ' + childRunResult.termination + ' でした'
  return {
    ...outcome,
    childSignal: childRunResult.signal,
    childTermination: childRunResult.termination,
    reason,
  }
}

function classifyTopicSyncFailure(childRunResult) {
  if (childRunResult?.status === 0) return null
  const exitCode = Number.isInteger(childRunResult?.status) && childRunResult.status > 0
    ? childRunResult.status
    : 1
  const signal = typeof childRunResult?.signal === 'string' && childRunResult.signal
    ? childRunResult.signal
    : null
  const termination = typeof childRunResult?.termination === 'string' && childRunResult.termination
    ? childRunResult.termination
    : null
  const incident = {
    kind: 'incident',
    reviewReady: false,
    exitCode,
    reason: signal
      ? `selected topic sync が ${signal} で停止しました (exit ${exitCode})`
      : `selected topic sync が exit ${exitCode} で停止しました`,
  }
  if (signal) incident.childSignal = signal
  if (termination) incident.childTermination = termination
  return incident
}

function run(script, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts', script), ...extraArgs],
    { stdio: 'inherit', cwd: ROOT, env: process.env },
  )
  const normalized = normalizeSpawnSyncResult(result)
  if (normalized.signal) {
    console.error(`  ❌ 実行停止 (${script}): ${normalized.signal} / exit ${normalized.status}`)
  } else if (result.error) {
    console.error(`  ❌ 実行エラー (${script}): ${result.error.message}`)
  } else if (normalized.termination) {
    console.error(`  ❌ 実行状態不明 (${script}): ${normalized.termination}`)
  }
  return normalized
}

function runCommand(command, args, { stdio = 'pipe', cwd = ROOT } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio,
  })
  const normalized = normalizeSpawnSyncResult(result)
  return {
    ok: normalized.status === 0,
    status: normalized.status,
    signal: normalized.signal,
    termination: normalized.termination,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    error: result.error,
  }
}

function checkScheduledGitReadiness({ ownedDraftPaths = [] } = {}) {
  const status = runCommand('git', ['status', '--porcelain'])
  const branch = runCommand('git', ['branch', '--show-current'])
  const head = runCommand('git', ['rev-parse', '--short', 'HEAD'])
  const gitPath = runCommand('git', ['rev-parse', '--git-path', 'index.lock'])
  const resolvedGitPath = gitPath.ok && gitPath.output
    ? (isAbsolute(gitPath.output) ? gitPath.output : resolve(ROOT, gitPath.output))
    : join(ROOT, '.git', 'index.lock')
  const statusLines = status.output.split('\n').filter((line) => line.trim().length > 0)
  const ownedDraftOnly = ownedDraftPaths.length > 0
    ? classifyOwnedDraftStatus(status.output, ownedDraftPaths)
    : (statusLines.length === 0 ? {} : null)
  const base = {
    statusOk: status.ok,
    dirtyCount: ownedDraftOnly ? 0 : statusLines.length,
    indexLockPresent: existsSync(resolvedGitPath),
    branch: branch.ok && branch.output ? branch.output : '不明',
    head: head.ok && head.output ? head.output : '不明',
  }
  if (!base.statusOk || base.dirtyCount > 0) {
    return assessScheduledGitReadiness(base)
  }

  const fetch = runCommand('git', ['fetch', 'origin', 'main'])
  if (!fetch.ok) {
    return assessScheduledGitReadiness({ ...base, fetchOk: false })
  }
  const divergence = runCommand('git', ['rev-list', '--left-right', '--count', 'HEAD...origin/main'])
  return assessScheduledGitReadiness({
    ...base,
    fetchOk: fetch.ok,
    divergenceOk: divergence.ok,
    divergenceOutput: divergence.output,
    branch: branch.ok && branch.output ? branch.output : '不明',
    head: head.ok && head.output ? head.output : '不明',
  })
}

function isLegacyTopicPoolExhausted(status, result) {
  if (status !== 2 || String(result?.topicId ?? '').trim() || String(result?.path ?? '').trim()) {
    return false
  }
  return (result?.reasons ?? []).some((reason) =>
    String(reason).includes('公開日が今日以前の未生成 approved topic はありません'),
  )
}

function prepareGeneratedDraftForHumanPush(scheduledResult) {
  if (!scheduledResult?.generated) {
    return {
      stockResult: { ok: true, stocked: false, skipped: true, reason: 'generated=false' },
      draftSyncResult: { ok: true, skipped: true, reason: 'generated=false' },
      gitReadiness: { ok: true, reason: 'generated=false' },
    }
  }
  const stockResult = rememberGeneratedDraft({ root: ROOT, scheduledResult })
  if (!stockResult.ok) {
    return { stockResult, draftSyncResult: null, gitReadiness: null }
  }
  const ownedDraftPaths = stockResult.ledger.entries.map((entry) => entry.path)
  const gitReadiness = checkScheduledGitReadiness({ ownedDraftPaths })
  const draftSyncResult = recoverOwnedGeneratedDraft({
    root: ROOT,
    runCommand,
    assertGitReady: () => gitReadiness,
  })
  return { stockResult, draftSyncResult, gitReadiness }
}

function readJsonIfExists(path) {
  if (!path || !existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return {
      ok: false,
      generated: false,
      reasons: [`結果JSONの読み込みに失敗: ${error.message}`],
    }
  }
}

async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
  })
  const json = await res.json()
  if (!json.ok) {
    throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
  }
  return json
}

async function sendOpsTelegram(text, { date = TODAY, job = 'ops-mwf-review-request' } = {}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.warn('  ⚠️ Telegram 通知をスキップします（環境変数未設定）')
    return false
  }

  const reservation = reserveNotificationSend({ root: ROOT, date, job, text })
  if (!reservation.shouldSend) {
    console.log(`  ⏭ Telegram 通知をスキップしました（同一日・同一job・同一本文の重複: ${reservation.key}）`)
    return false
  }

  try {
    await sendTelegram(botToken, chatId, text)
    reservation.commit()
    console.log('  ✅ Telegram 通知を送信しました')
    return true
  } catch (error) {
    reservation.release()
    throw error
  }
}

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function addMonths(month, amount) {
  const [year, monthIndex] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthIndex - 1 + amount, 1)).toISOString().slice(0, 7)
}

function currentMonthJst() {
  return TODAY.slice(0, 7)
}

function topicSyncMonths() {
  const current = currentMonthJst()
  return [current, addMonths(current, 1)]
}

function shouldGenerateScheduledArticle() {
  if (noGenerate) {
    return { ok: false, reason: '--no-generate 指定のため記事生成をスキップ' }
  }

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, reason: 'OPENAI_API_KEY 未設定のため記事生成をスキップ' }
  }

  return { ok: true }
}

function findTodayLivePosts(contentStatus, today = TODAY) {
  return (contentStatus?.live ?? []).filter((post) => post.publishAt === today)
}

function alreadyLiveTodayNoop({ scheduledResult, contentStatus }) {
  return scheduledResult?.generated === false && findTodayLivePosts(contentStatus).length > 0
}

function buildReviewRequestNotification({ generateDecision, scheduledResult, contentStatus, scheduledOutcome }) {
  const dashboardUrl = `${resolveNotificationSiteUrl()}/admin/pending-review`

  if (!generateDecision.ok) {
    return buildScheduledFailureNotification()
  }

  if (!scheduledResult) {
    return buildScheduledFailureNotification()
  }

  if (scheduledResult.generated) {
    return buildScheduledStockNotification({ outcome: scheduledOutcome, dashboardUrl })
  }

  const lines = ['📝 月水金の記事生成']
  const todayLivePosts = findTodayLivePosts(contentStatus)
  if (todayLivePosts.length > 0) {
    lines.push('本日公開対象の記事は既に公開中です。')
    for (const post of todayLivePosts.slice(0, 3)) {
      lines.push(`記事: ${post.title}`)
      lines.push(`公開日: ${post.publishAt}`)
    }
    if (todayLivePosts.length > 3) {
      lines.push(`他 ${todayLivePosts.length - 3}件`)
    }
    lines.push('新規下書き生成: なし')
    for (const reason of (scheduledResult.reasons ?? []).slice(0, 3)) {
      lines.push(`補足: ${reason}`)
    }
    return lines.join('\n')
  }

  lines.push('本日配信予定の未承認記事はありません。')
  for (const reason of (scheduledResult.reasons ?? ['公開日到来済み・未生成の approved topic がありません']).slice(0, 5)) {
    lines.push(`理由: ${reason}`)
  }
  return lines.join('\n')
}

function buildScheduledIncidentNotification({ scheduledOutcome, scheduledResult }) {
  void scheduledOutcome
  void scheduledResult
  return buildScheduledFailureNotification()
}

loadEnv()

console.log(WIDE)
const jstStr = nowJst.toISOString().slice(0, 16).replace('T', ' ')
console.log('  ops:mwf — 月水金 記事生成・レビュー依頼')
console.log(`  ${jstStr} JST  (${dayName}曜日)`)
console.log(`  記事生成: ${noGenerate ? '無効' : '有効（draft / Human review）'}`)
console.log(WIDE)

if (!isSendDay && !force) {
  console.log()
  console.log(`  ⚠️  今日は${dayName}曜日です。月・水・金以外は実行しません。`)
  console.log()
  console.log('  月水金以外に実行したい場合は --force をつけてください:')
  console.log('    npm run ops:mwf -- --force')
  console.log()
  process.exit(0)
}

if (force && !isSendDay) {
  console.log()
  console.log(`  ⚠️  --force 指定のため${dayName}曜日ですが実行します`)
}

let generateDecision = shouldGenerateScheduledArticle()
let scheduledResult = null
let stockResult = null
let draftSyncResult = null
let gitReadiness = null
let scheduledChildStatus = null
let scheduledChildRunResult = null
let scheduledOutcome = null

header('1/3  ネタリスト selected 同期')
let syncIncident = null
if (!generateDecision.ok) {
  console.log(`  ⏭ ${generateDecision.reason}`)
} else {
  for (const month of topicSyncMonths()) {
    const childRunResult = run('convert-selected-topics.mjs', ['--month', month, '--yes', '--if-exists', '--allow-empty'])
    syncIncident = classifyTopicSyncFailure(childRunResult)
    if (syncIncident) break
  }
}

if (syncIncident) {
  generateDecision = { ok: false, reason: 'ネタリスト selected 同期に失敗したため記事生成を停止' }
  scheduledOutcome = syncIncident
  process.exitCode = syncIncident.exitCode
}

header('2/3  承認済みネタから記事生成')
if (!generateDecision.ok) {
  console.log(`  ⏭ ${generateDecision.reason}`)
} else {
  const resultPath = join(tmpdir(), `aisoukai-scheduled-result-${process.pid}.json`)
  scheduledChildRunResult = run('scheduled-article-flow.mjs', ['--publish-today', '--no-notify', '--result-json', resultPath])
  scheduledChildStatus = scheduledChildRunResult.status
  scheduledResult = readJsonIfExists(resultPath)
  if (isLegacyTopicPoolExhausted(scheduledChildStatus, scheduledResult)) {
    console.log('  従来ネタCSVに候補がないため、テーマリサーチから補充します ...')
    scheduledResult = runThemeOpsFallback({
      today: TODAY,
      runProcess: runCommand,
    })
    scheduledChildStatus = scheduledResult?.ok === true ? 0 : 1
    scheduledChildRunResult = {
      status: scheduledChildStatus,
      signal: null,
      termination: scheduledResult?.ok === true ? null : 'fallback_failure',
    }
    if (!scheduledResult.ok) {
      console.log(`  ⚠️ ${scheduledResult.reason}`)
    }
  }

  scheduledOutcome = attachChildRunEvidence(classifyScheduledDraftOutcome({
    childStatus: scheduledChildStatus,
    scheduledResult,
  }), scheduledChildRunResult)
  if (scheduledOutcome.kind === 'incident') {
    const detail = scheduledResult?.reasons?.[0] ?? scheduledOutcome.reason
    console.log(`  ⚠️ ${detail}`)
    process.exitCode = scheduledOutcome.exitCode
  }

  if (scheduledOutcome.kind === 'generated-awaiting-stock') {
    header('2.5/3  生成下書きのストック記録・ローカル反映')
    const prepared = prepareGeneratedDraftForHumanPush(scheduledResult)
    stockResult = prepared.stockResult
    draftSyncResult = prepared.draftSyncResult
    gitReadiness = prepared.gitReadiness
    scheduledOutcome = classifyScheduledDraftOutcome({
      childStatus: scheduledChildStatus,
      scheduledResult,
      stockResult,
      draftSyncResult,
    })
    if (scheduledOutcome.kind === 'review-ready') {
      console.log(`  ✅ ${draftSyncResult.reason}`)
    } else if (scheduledOutcome.kind === 'stocked-pending-sync') {
      console.log('  ✅ 新しい記事を安全にストックしました')
      console.log(`  ⏳ ${draftSyncResult?.reason ?? gitReadiness?.reason ?? '管理画面への反映待ちです'}`)
    } else {
      console.log(`  ⚠️ ${stockResult?.reason ?? scheduledOutcome.reason}`)
      process.exitCode = scheduledOutcome.exitCode
    }
  }
}

header('3/3  Telegram レビュー依頼')
const contentStatus = loadContentStatus(join(ROOT, 'content', 'posts'))
const notificationBoundary = scheduledDraftNotificationBoundary(scheduledOutcome)
const notificationText = shouldSendScheduledIncidentNotification(scheduledOutcome)
  ? buildScheduledIncidentNotification({ scheduledOutcome, scheduledResult })
  : buildReviewRequestNotification({ generateDecision, scheduledResult, contentStatus, scheduledOutcome })
const alreadyLiveNoop = alreadyLiveTodayNoop({ scheduledResult, contentStatus })
console.log(notificationText.split('\n').map((line) => `  ${line}`).join('\n'))
if (shouldSendDraftReviewNotification(scheduledOutcome) || shouldSendStockUpdateNotification(scheduledOutcome)) {
  try {
    await sendOpsTelegram(notificationText, { job: notificationBoundary.job })
  } catch (error) {
    console.error(`  ❌ Telegram 送信失敗: ${error.message}`)
    process.exitCode = 1
  }
} else if (shouldSendScheduledIncidentNotification(scheduledOutcome)) {
  try {
    await sendOpsTelegram(notificationText, { job: notificationBoundary.job })
  } catch (error) {
    console.error(`  ❌ Telegram インシデント通知失敗: ${error.message}`)
    if (!process.exitCode) process.exitCode = 1
  }
} else if (alreadyLiveNoop) {
  console.log('  ⏭ 本日分は公開済みのためTelegramレビュー依頼は送信しません')
} else {
  console.log('  ⏭ レビュー可能な生成下書きがないためTelegramレビュー依頼は送信しません')
}

console.log()
console.log(WIDE)
console.log('  ops:mwf 完了')
console.log(BAR)
if (scheduledResult?.generated) {
  console.log(`  生成記事: ${scheduledResult.path}`)
  console.log('  次: /admin/pending-review で Human review')
} else {
  console.log('  生成記事: なし')
}
console.log('  approve / publish は実行していません')
console.log(WIDE)
