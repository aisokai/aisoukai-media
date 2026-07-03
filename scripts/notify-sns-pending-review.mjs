#!/usr/bin/env node
// notify-sns-pending-review.mjs
// SNS review 待ちドラフトの digest を console 出力 + Telegram 通知する。
// 通知のみ。approve / reject / 投稿とは接続しない (Telegram からの approve は禁止)。
//
// 使い方:
//   npm run sns:notify-pending-review [-- --dry-run]
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { SNS_DRAFTS_DIR, isDraftMarkdownFile } from './lib/sns-drafts.mjs'
import { ROOT } from './lib/media-queue.mjs'

const DIGEST_LIMIT = 10

export function listPendingSnsDrafts(dir = SNS_DRAFTS_DIR) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(isDraftMarkdownFile)
    .map((filename) => ({ filename, data: matter(readFileSync(join(dir, filename), 'utf8')).data }))
    .filter(({ data }) => data.status === 'pending_review')
    .sort((a, b) => a.filename.localeCompare(b.filename))
}

export function buildSnsPendingDigest(drafts) {
  if (drafts.length === 0) return null
  const lines = [`📱 SNS review 待ち: ${drafts.length} 件`, '']
  for (const { filename, data } of drafts.slice(0, DIGEST_LIMIT)) {
    lines.push(`- [${data.platform}] ${data.title} (risk: ${data.medical_risk}) — ${filename}`)
  }
  if (drafts.length > DIGEST_LIMIT) lines.push(`…ほか ${drafts.length - DIGEST_LIMIT} 件`)
  lines.push('')
  lines.push('承認は sns:approve、差し戻しは sns:reject を Human が実行してください。')
  lines.push('(この通知から承認・投稿はできません)')
  return lines.join('\n')
}

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!res.ok) throw new Error(`Telegram API error: ${res.status} ${await res.text()}`)
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const drafts = listPendingSnsDrafts()
  const digest = buildSnsPendingDigest(drafts)
  if (!digest) {
    console.log('✅ SNS review 待ちはありません。通知しません。')
    return
  }
  console.log(digest)
  if (dryRun) {
    console.log('\n(dry-run: Telegram 送信なし)')
    return
  }
  loadEnv()
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) {
    console.warn('⚠ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID が未設定のため送信をスキップしました。')
    return
  }
  await sendTelegram(botToken, chatId, digest)
  console.log('\n✅ Telegram に通知しました。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  })
}
