#!/usr/bin/env node
// 月水金の単純な記事フロー: 未使用CSVネタを1件生成 → 永続ストック → Telegram通知。
// 記事の承認と掲載はこのjobでは行わない。Git同期や管理画面反映は通知を止めない診断情報である。
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { resolveNotificationSiteUrl } from './lib/site-url.mjs'
import { readRetryableNotification, reserveNotificationSend } from './lib/notification-dedupe.mjs'
import { rememberGeneratedDraft } from './lib/scheduled-draft-commit.mjs'
import {
  buildScheduledFailureNotification,
  buildScheduledStockNotification,
  classifyScheduledDraftOutcome,
  scheduledDraftNotificationBoundary,
} from './lib/scheduled-draft-notification.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LOG_DIR = join(ROOT, 'logs')
const LOCK_PATH = join(LOG_DIR, 'ops-mwf.lock')
const LOCK_STALE_MS = 2 * 60 * 60 * 1000
const SEND_DAYS = new Set([1, 3, 5])
const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土']
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

const runLock = acquireRunLock()
if (!runLock.acquired) {
  console.log(`⏭ ${runLock.reason}`)
  process.exit(0)
}
process.on('exit', () => {
  try { closeSync(runLock.fd) } catch {}
  try { unlinkSync(LOCK_PATH) } catch {}
})

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

async function sendTelegram(botToken, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error('Telegram API が送信を受理しませんでした')
}

async function sendOpsTelegram(text, { date = TODAY, job = 'ops-mwf-review-request', contentVersion } = {}) {
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

async function retryFailedReviewNotification() {
  const pending = readRetryableNotification({ root: ROOT, job: 'ops-mwf-review-request' })
  if (!pending) return false
  await sendOpsTelegram(pending.text, { job: pending.job, contentVersion: pending.contentVersion })
  return true
}

loadEnv()
console.log(`ops:mwf ${TODAY}（${DAY_NAMES_JA[dayOfWeek]}）: CSV → 記事 → ストック → Telegram → Human承認 → 掲載`)
if (!SEND_DAYS.has(dayOfWeek) && !force) {
  console.log('⏭ 月・水・金以外のため実行しません')
  process.exit(0)
}

try {
  if (await retryFailedReviewNotification()) console.log('✅ 以前の未送信Telegram通知を再試行しました')
} catch (error) {
  console.error(`❌ Telegram 再試行失敗: ${error.message}`)
  process.exitCode = 1
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
  if (outcome.kind === 'generated-awaiting-stock') {
    const stockResult = rememberGeneratedDraft({ root: ROOT, scheduledResult })
    let draftData = {}
    let draftContent = ''
    try {
      const parsed = matter(readFileSync(join(ROOT, scheduledResult.path), 'utf8'))
      draftData = parsed.data
      draftContent = parsed.content
    } catch {}
    outcome = classifyScheduledDraftOutcome({ childStatus, scheduledResult, stockResult, draftData, draftContent })
  }

  const boundary = scheduledDraftNotificationBoundary(outcome)
  if (boundary.shouldSend) {
    const text = outcome.kind === 'stocked'
      ? buildScheduledStockNotification({ dashboardUrl: `${resolveNotificationSiteUrl()}/admin/pending-review` })
      : buildScheduledFailureNotification()
    try {
      await sendOpsTelegram(text, boundary)
      console.log('✅ Telegram通知処理を完了しました')
    } catch (error) {
      console.error(`❌ Telegram送信失敗: ${error.message}`)
      process.exitCode = 1
    }
  } else if (outcome.kind === 'no-draft') {
    console.log('⏭ 未使用ネタがないため生成しません')
  } else {
    console.error(`❌ ${outcome.reason}`)
    process.exitCode = outcome.exitCode || 1
  }
}

console.log('approve / publish は実行していません。掲載に進める唯一の条件はHuman承認です。')
