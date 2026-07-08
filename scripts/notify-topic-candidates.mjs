#!/usr/bin/env node
// 月次ネタ候補の確認リマインドをTelegramへ送る。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveNotificationSiteUrl } from './lib/site-url.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CANDIDATE_DIR = join(ROOT, 'data', 'monthly-topic-candidates')

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key] = next && !next.startsWith('--') ? argv[++i] : true
    }
  }
  return args
}

function nextMonth(today = new Date()) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 7)
}

function siteUrl() {
  return resolveNotificationSiteUrl()
}

function buildText(file) {
  const selected = file.topics.filter((topic) => topic.status === 'selected').length
  const highRisk = file.topics.filter((topic) => topic.medicalRisk === 'high').length
  const duplicate = file.topics.filter((topic) => topic.duplicateRisk !== 'low').length
  const url = `${siteUrl()}/admin/topic-candidates?month=${file.month}`

  return [
    '【藍想会ブログ】翌月分のネタ候補ができました',
    '',
    `対象月: ${file.month}`,
    `候補: ${file.topics.length}件`,
    `必要採用数: ${file.targetPostCount}件`,
    `現在の採用: ${selected}件`,
    `高リスク候補: ${highRisk}件`,
    `重複注意: ${duplicate}件`,
    '',
    'スマホでもPCでも月次ネタ候補を確認できます。',
    `管理画面: ${url}`,
  ].join('\n')
}

async function sendTelegram(botToken, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
}

async function main() {
  loadEnv()
  const args = parseArgs(process.argv.slice(2))
  const month = String(args.month ?? nextMonth()).trim()
  const dryRun = args.dry_run === true || args.dryRun === true
  const filePath = join(CANDIDATE_DIR, `${month}.json`)

  if (!existsSync(filePath)) {
    console.error(`エラー: data/monthly-topic-candidates/${month}.json が見つかりません`)
    process.exit(1)
  }

  const file = JSON.parse(readFileSync(filePath, 'utf8'))
  const text = buildText(file)
  console.log(text)

  if (dryRun) {
    console.log('\nDRY-RUNです。Telegramには送信していません。')
    return
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) {
    console.warn('\n⚠️ Telegram 通知をスキップします（環境変数未設定）')
    return
  }

  await sendTelegram(botToken, chatId, text)
  console.log('\n✅ Telegram 通知を送信しました')
}

main().catch((error) => {
  console.error(`❌ ${error.message}`)
  process.exit(1)
})
