#!/usr/bin/env node
// notify-requests.mjs
// 記事リクエストの状態を Telegram に送信する。
// Human がトリガーする。AI が自動実行してはならない。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname     = dirname(fileURLToPath(import.meta.url))
const ROOT          = join(__dirname, '..')
const REQUESTS_PATH = join(ROOT, 'data', 'article-requests.json')

// .env.local を読んで process.env に反映（既存の環境変数は上書きしない）
function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function loadRequests() {
  if (!existsSync(REQUESTS_PATH)) return { last_update_id: 0, requests: [] }
  try {
    return JSON.parse(readFileSync(REQUESTS_PATH, 'utf8'))
  } catch {
    return { last_update_id: 0, requests: [] }
  }
}

function buildNotificationText(store) {
  const { requests } = store

  const byStatus = { requested: [], drafted: [], ignored: [], archived: [] }
  for (const r of requests) {
    const bucket = byStatus[r.status]
    if (bucket) bucket.push(r)
  }

  const lines = ['📨 記事リクエスト状態サマリー', '']
  lines.push(`🔔 未処理(requested):  ${byStatus.requested.length}件`)
  lines.push(`📝 下書き生成済み:     ${byStatus.drafted.length}件`)
  lines.push(`🚫 見送り(ignored):    ${byStatus.ignored.length}件`)
  lines.push(`📦 アーカイブ済み:     ${byStatus.archived.length}件`)

  // 未処理リクエストを最大10件表示（受信日時の新しい順）
  const pending = [...byStatus.requested].sort((a, b) => b.update_id - a.update_id)
  if (pending.length > 0) {
    lines.push('')
    lines.push('未処理リクエスト:')
    for (const [i, r] of pending.slice(0, 10).entries()) {
      const preview = r.text.slice(0, 35).replace(/\n/g, ' ')
      const suffix  = r.text.length > 35 ? '…' : ''
      lines.push(`${i + 1}. [${r.update_id}] "${preview}${suffix}"`)
    }
    if (pending.length > 10) {
      lines.push(`  ...他 ${pending.length - 10} 件`)
    }
    lines.push('')
    lines.push('下書き生成: npm run request:draft -- <update_id> --category "カテゴリ"')
  } else {
    lines.push('')
    lines.push('未処理リクエストはありません。')
  }

  return lines.join('\n')
}

async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text }),
  })
  const json = await res.json()
  if (!json.ok) {
    throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
  }
  return json
}

async function main() {
  loadEnv()

  const store = loadRequests()
  const text  = buildNotificationText(store)

  // ── console 出力 ──
  console.log('━'.repeat(56))
  console.log('記事リクエスト通知')
  console.log('━'.repeat(56))
  console.log(text)
  console.log('━'.repeat(56))

  // ── Telegram 送信 ──
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId   = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.warn()
    console.warn('⚠️  Telegram 通知をスキップします（環境変数未設定）')
    if (!botToken) console.warn('   TELEGRAM_BOT_TOKEN が未設定です')
    if (!chatId)   console.warn('   TELEGRAM_CHAT_ID が未設定です')
    return
  }

  try {
    await sendTelegram(botToken, chatId, text)
    console.log()
    console.log('✅ Telegram 通知を送信しました')
  } catch (err) {
    console.error()
    console.error(`❌ Telegram 送信失敗: ${err.message}`)
    process.exit(1)
  }
}

main()
