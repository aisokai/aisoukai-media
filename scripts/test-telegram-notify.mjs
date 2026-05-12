#!/usr/bin/env node
// test-telegram-notify.mjs
// Telegram Bot への疎通確認スクリプト。
// 記事生成・approve/reject・publish とは接続しない。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// .env.local を読んで process.env に反映（既存の環境変数は上書きしない）
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
  const json = await res.json()
  if (!json.ok) {
    throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
  }
  return json
}

async function main() {
  loadEnv()

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId   = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.error('エラー: 環境変数が未設定です')
    if (!botToken) console.error('  TELEGRAM_BOT_TOKEN が未設定です')
    if (!chatId)   console.error('  TELEGRAM_CHAT_ID が未設定です')
    console.error()
    console.error('.env.local に以下を追加してください:')
    console.error('  TELEGRAM_BOT_TOKEN=<BotFather から取得したトークン>')
    console.error('  TELEGRAM_CHAT_ID=<通知先のチャット ID>')
    process.exit(1)
  }

  const message = 'aisoukai-media Telegram notification test'

  console.log('Telegram にテスト通知を送信します...')
  console.log(`  chat_id: ${chatId}`)
  console.log(`  message: ${message}`)

  try {
    const result = await sendTelegram(botToken, chatId, message)
    console.log()
    console.log('✅ 送信成功')
    console.log(`   message_id: ${result.result?.message_id}`)
  } catch (err) {
    console.error()
    console.error(`❌ 送信失敗: ${err.message}`)
    process.exit(1)
  }
}

main()
