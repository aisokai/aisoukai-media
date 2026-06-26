#!/usr/bin/env node
// ops-mwf.mjs
// 月水金 08:30 の定期記事生成 CLI。
// やることは 1) selected ネタを承認済み topic に同期 2) 承認済み topic から1記事生成
// 3) 画像設定済みの下書きとして保存 4) Telegram で Human review / approval を依頼、のみ。
// approve / publish / push / Telegram request 取得は実行しない。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveNotificationSiteUrl } from './lib/site-url.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SEND_DAYS = new Set([1, 3, 5]) // 月=1, 水=3, 金=5 (JST UTC+9)
const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土']

const cliArgs = process.argv.slice(2)
const force = cliArgs.includes('--force')
const noGenerate = cliArgs.includes('--no-generate')
const ignoredAutoPublish = cliArgs.includes('--auto-publish')

const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
const TODAY = nowJst.toISOString().slice(0, 10)
const dayOfWeek = nowJst.getUTCDay()
const dayName = DAY_NAMES_JA[dayOfWeek]
const isSendDay = SEND_DAYS.has(dayOfWeek)

const WIDE = '═'.repeat(60)
const BAR = '─'.repeat(60)

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

async function sendOpsTelegram(text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.warn('  ⚠️ Telegram 通知をスキップします（環境変数未設定）')
    return false
  }

  await sendTelegram(botToken, chatId, text)
  console.log('  ✅ Telegram 通知を送信しました')
  return true
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: 'ANTHROPIC_API_KEY 未設定のため記事生成をスキップ' }
  }

  return { ok: true }
}

function buildReviewRequestNotification({ generateDecision, scheduledResult }) {
  const dashboardUrl = `${resolveNotificationSiteUrl()}/admin/pending-review`
  const lines = ['📝 月水金の記事生成']

  if (!generateDecision.ok) {
    lines.push('記事生成は実行していません。')
    lines.push(`理由: ${generateDecision.reason}`)
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
      ? '記事を生成し、画像を設定しました。レビューと承認をお願いします。'
      : '記事は生成しましたが、画像設定の確認が必要です。')
    if (scheduledResult.title) lines.push(`記事: ${scheduledResult.title}`)
    if (scheduledResult.publishAt) lines.push(`公開予定日: ${scheduledResult.publishAt}`)
    if (scheduledResult.topicId) lines.push(`topic: ${scheduledResult.topicId}`)
    if (scheduledResult.slug) lines.push(`slug: ${scheduledResult.slug}`)
    lines.push(`画像: ${imageOk ? '設定済み' : '未設定または要確認'}`)
    lines.push('')
    lines.push('承認画面:')
    lines.push(dashboardUrl)

    const reasons = scheduledResult.reasons ?? []
    if (reasons.length > 0) {
      lines.push('')
      for (const reason of reasons.slice(0, 5)) lines.push(`確認事項: ${reason}`)
    }

    return lines.join('\n')
  }

  lines.push('今日は生成対象の承認済みネタがありません。')
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

if (ignoredAutoPublish) {
  console.log()
  console.log('  ⚠️  ops:mwf では --auto-publish を使いません。Human review 待ちの下書きとして作成します。')
}

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

header('1/3  ネタリスト selected 同期')
let syncFailed = false
for (const month of topicSyncMonths()) {
  const status = run('convert-selected-topics.mjs', ['--month', month, '--yes', '--if-exists', '--allow-empty'])
  if (status !== 0) syncFailed = true
}

let generateDecision = shouldGenerateScheduledArticle()
let scheduledResult = null
if (syncFailed) {
  generateDecision = { ok: false, reason: 'ネタリスト selected 同期に失敗したため記事生成を停止' }
}

header('2/3  承認済みネタから記事生成')
if (!generateDecision.ok) {
  console.log(`  ⏭ ${generateDecision.reason}`)
} else {
  const resultPath = join(tmpdir(), `aisoukai-scheduled-result-${process.pid}.json`)
  const status = run('scheduled-article-flow.mjs', ['--no-notify', '--result-json', resultPath])
  scheduledResult = readJsonIfExists(resultPath)
  if (status !== 0) {
    const reason = scheduledResult?.reasons?.[0] ?? `scheduled-article-flow.mjs が exit ${status} で停止`
    console.log(`  ⚠️ ${reason}`)
    process.exitCode = 1
  }
}

header('3/3  Telegram レビュー依頼')
const notificationText = buildReviewRequestNotification({ generateDecision, scheduledResult })
console.log(notificationText.split('\n').map((line) => `  ${line}`).join('\n'))
try {
  await sendOpsTelegram(notificationText)
} catch (error) {
  console.error(`  ❌ Telegram 送信失敗: ${error.message}`)
  process.exitCode = 1
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
console.log('  approve / publish / push は実行していません')
console.log(WIDE)
