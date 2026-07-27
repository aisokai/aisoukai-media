#!/usr/bin/env node
// ops-mwf.mjs
// 月水金 08:30 の定期記事生成 CLI。
// やることは 1) selected ネタを承認済み topic に同期 2) 承認済み topic から1記事生成
// 3) Git が clean / origin 同期済みの時だけ画像設定済みの下書きとして保存
// 4) 生成下書きはローカル保存まで。Git commit / push は Human が明示操作する。
// 5) Telegram で Human review / approval を依頼、のみ。
// approve / publish / Telegram request 取得は実行しない。
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
import { shouldSendDraftReviewNotification } from './lib/scheduled-draft-notification.mjs'

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
const ignoredAutoPublish = cliArgs.includes('--auto-publish')

if (ignoredAutoPublish) {
  console.error('  ❌ ops:mwf では --auto-publish を受け付けません。本文確認後に承認してください。')
  process.exit(1)
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

function run(script, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts', script), ...extraArgs],
    { stdio: 'inherit', cwd: ROOT, env: process.env },
  )
  if (result.error) {
    console.error(`  ❌ 実行エラー (${script}): ${result.error.message}`)
  }
  return result.status ?? (result.error ? 1 : 0)
}

function runCommand(command, args, { stdio = 'pipe', cwd = ROOT } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio,
  })
  return {
    ok: result.status === 0,
    status: result.status ?? (result.error ? 1 : 0),
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    error: result.error,
  }
}

function checkScheduledGitReadiness({ ownedDraftPath = null } = {}) {
  const status = runCommand('git', ['status', '--porcelain'])
  const branch = runCommand('git', ['branch', '--show-current'])
  const head = runCommand('git', ['rev-parse', '--short', 'HEAD'])
  const statusLines = status.output.split('\n').filter((line) => line.trim().length > 0)
  const ownedDraftOnly = ownedDraftPath && classifyOwnedDraftStatus(status.output, ownedDraftPath)
  const base = {
    statusOk: status.ok,
    dirtyCount: ownedDraftOnly ? 0 : statusLines.length,
    indexLockPresent: existsSync(join(ROOT, '.git', 'index.lock')),
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
    return { ok: true, skipped: true, reason: 'generated=false' }
  }
  const remembered = rememberGeneratedDraft({ root: ROOT, scheduledResult })
  if (!remembered.ok) return remembered
  return recoverOwnedGeneratedDraft({
    root: ROOT,
    runCommand,
    assertGitReady: (marker) => checkScheduledGitReadiness({ ownedDraftPath: marker.path }),
  })
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

function buildReviewRequestNotification({ generateDecision, scheduledResult, contentStatus, draftSyncResult, gitReadiness }) {
  const dashboardUrl = `${resolveNotificationSiteUrl()}/admin/pending-review`
  const lines = ['📝 月水金の記事生成']

  if (!generateDecision.ok) {
    lines.push('記事生成は実行していません。')
    lines.push(`理由: ${generateDecision.reason}`)
    if (gitReadiness?.ok === false) {
      const details = gitReadiness.details ?? {}
      lines.push(`Git: branch ${details.branch ?? '不明'} / HEAD ${details.head ?? '不明'}`)
      if (details.aheadSummary) lines.push(details.aheadSummary)
      if (details.ahead > 0) lines.push('定期処理はGit pushを実行しません。Human push待ちです。')
    }
    return lines.join('\n')
  }

  if (!scheduledResult) {
    lines.push('⚠️ 記事生成結果を確認できませんでした。')
    lines.push('ログを確認してください。')
    return lines.join('\n')
  }

  if (scheduledResult.generated) {
    const imageOk = scheduledResult.image?.ok === true
    lines.push(imageOk
      ? '本日配信予定の記事を生成しました。本文確認・承認をお願いします。'
      : '記事は生成しましたが、画像設定の確認が必要です。')
    if (scheduledResult.title) lines.push(`記事: ${scheduledResult.title}`)
    if (scheduledResult.publishAt) lines.push(`公開予定日: ${scheduledResult.publishAt}`)
    if (scheduledResult.topicId) lines.push(`topic: ${scheduledResult.topicId}`)
    if (scheduledResult.slug) lines.push(`slug: ${scheduledResult.slug}`)
    lines.push(`画像: ${imageOk ? '設定済み' : '未設定または要確認'}`)
    lines.push('')
    lines.push('本文確認・承認:')
    lines.push(dashboardUrl)
    lines.push('')
    if (draftSyncResult?.ok && !draftSyncResult.skipped) {
      lines.push('Git同期: Human push待ち（定期処理はpushしません）')
    } else if (draftSyncResult?.ok && draftSyncResult.skipped) {
      lines.push(`Git同期: ${draftSyncResult.reason}`)
    } else if (draftSyncResult) {
      lines.push('Git同期準備: 失敗（ローカルのみの可能性があります）')
      lines.push(`同期エラー: ${draftSyncResult.reason}`)
    }

    const reasons = scheduledResult.reasons ?? []
    if (reasons.length > 0) {
      lines.push('')
      for (const reason of reasons.slice(0, 5)) lines.push(`確認事項: ${reason}`)
    }

    return lines.join('\n')
  }

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
let draftSyncResult = null
let gitReadiness = { ok: true, reason: '記事生成なし' }
let draftRecoveryResult = null

if (generateDecision.ok) {
  if (!existsSync(join(ROOT, '.git', 'index.lock'))) {
    draftRecoveryResult = recoverOwnedGeneratedDraft({
      root: ROOT,
      runCommand,
      assertGitReady: (marker) => checkScheduledGitReadiness({ ownedDraftPath: marker.path }),
    })
    if (!draftRecoveryResult.ok) {
      draftSyncResult = draftRecoveryResult
      generateDecision = { ok: false, reason: `管理対象draftの回復を停止: ${draftRecoveryResult.reason}` }
    } else if (draftRecoveryResult.recovered) {
      console.log(`  ✅ ${draftRecoveryResult.reason}`)
    }
  }
}

if (generateDecision.ok) {
  gitReadiness = checkScheduledGitReadiness()
  if (!gitReadiness.ok) {
    generateDecision = { ok: false, reason: `Git同期が安全でないため記事生成を停止: ${gitReadiness.reason}` }
  }
}

header('1/3  ネタリスト selected 同期')
let syncFailed = false
if (!gitReadiness.ok) {
  console.log(`  ⏭ ${gitReadiness.reason}`)
} else {
  for (const month of topicSyncMonths()) {
    const status = run('convert-selected-topics.mjs', ['--month', month, '--yes', '--if-exists', '--allow-empty'])
    if (status !== 0) syncFailed = true
  }
}

if (syncFailed) {
  generateDecision = { ok: false, reason: 'ネタリスト selected 同期に失敗したため記事生成を停止' }
}

header('2/3  承認済みネタから記事生成')
if (!generateDecision.ok) {
  console.log(`  ⏭ ${generateDecision.reason}`)
} else {
  const resultPath = join(tmpdir(), `aisoukai-scheduled-result-${process.pid}.json`)
  const status = run('scheduled-article-flow.mjs', ['--publish-today', '--no-notify', '--result-json', resultPath])
  scheduledResult = readJsonIfExists(resultPath)
  if (isLegacyTopicPoolExhausted(status, scheduledResult)) {
    console.log('  従来ネタCSVに候補がないため、テーマリサーチから補充します ...')
    scheduledResult = runThemeOpsFallback({
      today: TODAY,
      runProcess: runCommand,
    })
    if (!scheduledResult.ok) {
      console.log(`  ⚠️ ${scheduledResult.reason}`)
      process.exitCode = 1
    }
  } else if (status !== 0) {
    const reason = scheduledResult?.reasons?.[0] ?? `scheduled-article-flow.mjs が exit ${status} で停止`
    console.log(`  ⚠️ ${reason}`)
    process.exitCode = 1
  }
  if (scheduledResult?.generated) {
    header('2.5/3  生成下書きのHuman Git同期待ち')
    draftSyncResult = prepareGeneratedDraftForHumanPush(scheduledResult)
    if (draftSyncResult.ok) {
      console.log(`  ✅ ${draftSyncResult.reason}`)
    } else {
      console.log(`  ⚠️ ${draftSyncResult.reason}`)
      process.exitCode = 1
    }
  }
}

header('3/3  Telegram レビュー依頼')
const contentStatus = loadContentStatus(join(ROOT, 'content', 'posts'))
const notificationText = buildReviewRequestNotification({ generateDecision, scheduledResult, contentStatus, draftSyncResult, gitReadiness })
if (alreadyLiveTodayNoop({ scheduledResult, contentStatus })) {
  process.exitCode = 0
}
console.log(notificationText.split('\n').map((line) => `  ${line}`).join('\n'))
if (!shouldSendDraftReviewNotification(draftSyncResult)) {
  console.log('  ⏭ Git同期準備に失敗したためTelegramレビュー依頼は送信しません')
} else {
  try {
    await sendOpsTelegram(notificationText)
  } catch (error) {
    console.error(`  ❌ Telegram 送信失敗: ${error.message}`)
    process.exitCode = 1
  }
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
