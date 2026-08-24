#!/usr/bin/env node
// 月水金の単純な記事フロー: 未使用CSVネタを1件生成 → 永続ストック → Telegram通知。
// 記事の承認と掲載はこのjobでは行わない。Git同期や管理画面反映は通知を止めない診断情報である。
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reserveNotificationSend } from './lib/notification-dedupe.mjs'
import { loadGateConfig } from './lib/media-queue.mjs'
import { readOwnedGeneratedDraftLedger, rememberGeneratedDraft, syncOwnedGeneratedDraft } from './lib/scheduled-draft-commit.mjs'
import {
  buildScheduledFailureNotification,
  buildScheduledReviewNotification,
  buildScheduledStockNotification,
  classifyScheduledDraftOutcome,
  isTelegramNotificationEnabled,
  notifySyncedDraftLedger,
  reconcileBeforeGeneration,
  scheduledDraftNotificationBoundary,
  stuckDraftLedgerNotice,
} from './lib/scheduled-draft-notification.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LOG_DIR = join(ROOT, 'logs')
const LOCK_PATH = join(LOG_DIR, 'ops-mwf.lock')
const LOCK_STALE_MS = 2 * 60 * 60 * 1000
const SEND_DAYS = new Set([1, 3, 5])
const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土']
const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
const TODAY = nowJst.toISOString().slice(0, 10)
const dayOfWeek = nowJst.getUTCDay()

function acquireRunLock() {
  mkdirSync(LOG_DIR, { recursive: true })
  try {
    const fd = openSync(LOCK_PATH, 'wx')
    writeFileSync(fd, JSON.stringify({ startedAt: new Date().toISOString() }) + '\n')
    return { acquired: true, fd }
  } catch (error) {
    if (error?.code !== 'EEXIST') return { acquired: false, reason: `ロック作成に失敗: ${error.message}` }
    try {
      const startedAt = Date.parse(JSON.parse(readFileSync(LOCK_PATH, 'utf8')).startedAt)
      if (Number.isFinite(startedAt) && Date.now() - startedAt > LOCK_STALE_MS) {
        unlinkSync(LOCK_PATH)
        return acquireRunLock()
      }
    } catch {}
    return { acquired: false, reason: '別の ops:mwf が実行中です' }
  }
}

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (match) process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '')
  }
}

function runScheduledArticle(resultPath) {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'scheduled-article-flow.mjs'), '--publish-today', '--no-notify', '--result-json', resultPath], {
    cwd: ROOT, stdio: 'inherit', env: process.env,
  })
  return Number.isInteger(result.status) ? result.status : 1
}

function readJsonIfExists(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

// launchd can provide a restricted PATH. Node and git are invoked by their
// absolute executable paths; this wrapper never shells out or reads Git auth.
function runGitCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PATH: process.env.PATH ?? '/usr/bin:/bin' },
  })
  return {
    ok: !result.error && result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

async function sendTelegram(botToken, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error('Telegram API が送信を受理しませんでした')
}

async function sendOpsTelegram(text, { date = TODAY, job = 'ops-mwf-stock-notice', contentVersion } = {}) {
  // notifyTelegramIfConfigured cannot be reused here: it owns send success but
  // not this workflow's reservation.commit/fail lifecycle. Reuse its shared
  // loadGateConfig policy instead, before creating any dedupe reservation.
  if (!isTelegramNotificationEnabled(loadGateConfig())) return { sent: false, suppressed: true }
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  const reservation = reserveNotificationSend({ root: ROOT, date, job, text, contentVersion })
  if (!reservation.shouldSend) return { sent: false, duplicate: true }
  if (!botToken || !chatId) {
    reservation.fail({ text, error: 'Telegram送信設定がないため未送信として再試行待ちです' })
    throw new Error('Telegram送信設定がないため未送信として再試行待ちです')
  }
  try {
    await sendTelegram(botToken, chatId, text)
    reservation.commit({ text })
    return { sent: true, duplicate: false }
  } catch (error) {
    reservation.fail({ text, error: String(error.message ?? 'send failed') })
    throw error
  }
}

function notificationText(outcome) {
  return outcome.kind === 'synced'
    ? buildScheduledReviewNotification()
    : outcome.kind === 'stocked'
      ? buildScheduledStockNotification()
      : buildScheduledFailureNotification()
}

async function notifyOutcome(outcome, draftSyncResult) {
  if (outcome.kind === 'synced' && draftSyncResult?.ledgerPending === true) {
    const result = await notifySyncedDraftLedger({
      root: ROOT,
      draftSyncResult,
      sendNotification: sendOpsTelegram,
    })
    if (!result.ok) {
      // 通知失敗時はledgerを保持し、次回の無条件突合で安全に再試行する。
      console.error(`❌ 同期済みledgerの通知または消込に失敗: ${result.reason}`)
      process.exitCode = 1
      return result
    }
    if (result.suppressed === true) {
      console.log('⏭ Telegram通知は media-gate の設定により送信しません')
      return result
    }
    console.log('✅ Telegram通知処理を完了しました')
    return result
  }
  const boundary = scheduledDraftNotificationBoundary(outcome)
  if (!boundary.shouldSend) return { notified: false }
  const text = notificationText(outcome)
  try {
    const notificationResult = await sendOpsTelegram(text, boundary)
    if (notificationResult.suppressed === true) {
      console.log('⏭ Telegram通知は media-gate の設定により送信しません')
      return { notified: false, suppressed: true }
    }
    console.log('✅ Telegram通知処理を完了しました')
    return { notified: true }
  } catch (error) {
    // 通知失敗時はledgerを保持し、次回の無条件突合で安全に再試行する。
    console.error(`❌ Telegram送信失敗: ${error.message}`)
    process.exitCode = 1
    return { notified: false }
  }
}

async function main() {
  const cliArgs = process.argv.slice(2)
  const force = cliArgs.includes('--force')
  const noGenerate = cliArgs.includes('--no-generate')
  const dryRun = cliArgs.includes('--dry-run')
  if (cliArgs.includes('--auto-publish')) {
    console.error('❌ ops:mwf では --auto-publish を受け付けません。承認前の記事は掲載しません。')
    process.exit(1)
  }
  if (dryRun) {
    console.log('ops:mwf dry-run: 生成・ストック・通知は実行していません')
    process.exit(0)
  }
  const runLock = acquireRunLock()
  if (!runLock.acquired) {
    console.log(`⏭ ${runLock.reason}`)
    process.exit(0)
  }
  process.on('exit', () => {
    try { closeSync(runLock.fd) } catch {}
    try { unlinkSync(LOCK_PATH) } catch {}
  })

  loadEnv()
console.log(`ops:mwf ${TODAY}（${DAY_NAMES_JA[dayOfWeek]}）: CSV → 記事 → ストック → Telegram → Human承認 → 掲載`)
// Git同期はAI生成に依存しないため、生成設定がない実行でも先に突合する。
const reconciled = await reconcileBeforeGeneration({
  root: ROOT,
  runCommand: runGitCommand,
  notify: async ({ root, draftSyncResult }) => notifySyncedDraftLedger({ root, draftSyncResult, sendNotification: sendOpsTelegram }),
})
if (!reconciled.notification.ok) console.error(`❌ 同期済みledgerの通知または消込に失敗: ${reconciled.notification.reason}`)
// 同期保留が滞留として残る場合は毎回知らせる。沈黙したまま停止し続けないための観測専用通知で、
// 承認・公開・同期状態のいずれも変更しない。
const stuck = stuckDraftLedgerNotice({
  draftSyncResult: reconciled.draftSyncResult,
  ledgerEntries: readOwnedGeneratedDraftLedger(ROOT)?.entries ?? [],
})
if (stuck.shouldSend) {
  console.error(`⚠️ 本番へ未同期の下書きが${stuck.stuckCount}件滞留しています: ${reconciled.draftSyncResult.reason}`)
  try {
    const stuckSend = await sendOpsTelegram(stuck.text, { job: stuck.job })
    if (stuckSend.suppressed === true) console.log('⏭ Telegram通知は media-gate の設定により送信しません')
  } catch (error) {
    console.error(`❌ 滞留通知の送信に失敗しました: ${error.message}`)
  }
}
if (!SEND_DAYS.has(dayOfWeek) && !force) {
  console.log('⏭ 月・水・金以外のため実行しません')
  process.exit(0)
}

if (noGenerate) {
  console.log('⏭ --no-generate 指定のため生成しません')
} else if (!process.env.OPENAI_API_KEY) {
  console.error('❌ 記事生成設定がないため生成できません')
  process.exitCode = 1
} else {
  const resultPath = join(tmpdir(), `aisoukai-scheduled-result-${process.pid}.json`)
  const childStatus = runScheduledArticle(resultPath)
  const scheduledResult = readJsonIfExists(resultPath)
  let outcome = classifyScheduledDraftOutcome({ childStatus, scheduledResult })
  let draftSyncResult
  if (outcome.kind === 'generated-awaiting-stock') {
    const stockResult = rememberGeneratedDraft({ root: ROOT, scheduledResult })
    draftSyncResult = stockResult.ok === true && stockResult.stocked === true
      ? syncOwnedGeneratedDraft({
          root: ROOT,
          runCommand: runGitCommand,
          // The sync helper performs the stricter fetch, divergence, staged
          // path, index-lock, commit, push, and remote-SHA checks itself.
          assertGitReady: () => ({ ok: true }),
        })
      : undefined
    outcome = classifyScheduledDraftOutcome({ childStatus, scheduledResult, stockResult, draftSyncResult })
  }

  const boundary = scheduledDraftNotificationBoundary(outcome)
  if (boundary.shouldSend) {
    await notifyOutcome(outcome, draftSyncResult)
  } else if (outcome.kind === 'no-draft') {
    console.log('⏭ 未使用ネタがないため生成しません')
  } else {
    console.error(`❌ ${outcome.reason}`)
    process.exitCode = outcome.exitCode || 1
  }
}

console.log('approve / publish は実行していません。掲載に進める唯一の条件はHuman承認です。')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
