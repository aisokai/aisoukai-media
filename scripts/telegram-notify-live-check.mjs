#!/usr/bin/env node
// Telegram Bot への意図的な疎通確認専用CLI。
// 通常テストから隔離するため、test-* / *.test.* の名前は使わない。
// `--send` がない限り、環境変数を読まず、外部通信もしない。

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
export const EXPLICIT_SEND_FLAG = '--send'

function loadEnv(env = process.env) {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

async function sendTelegram(botToken, chatId, text, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
  return json
}

export async function runTelegramLiveCheck({
  argv = process.argv.slice(2), env = process.env, loadEnvImpl = loadEnv, sendTelegramImpl = sendTelegram,
} = {}) {
  if (!argv.includes(EXPLICIT_SEND_FLAG)) return { sent: false, reason: 'explicit-send-required' }

  loadEnvImpl(env)
  const botToken = env.TELEGRAM_BOT_TOKEN
  const chatId = env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) return { sent: false, reason: 'missing-credentials' }

  await sendTelegramImpl(botToken, chatId, 'aisoukai-media Telegram notification test')
  return { sent: true, reason: 'sent' }
}

async function main() {
  const result = await runTelegramLiveCheck()
  if (result.reason === 'explicit-send-required') {
    console.error('外部送信を行うには --send を明示してください。通常テストではこのCLIを実行しません。')
    process.exitCode = 1
    return
  }
  if (result.reason === 'missing-credentials') {
    console.error('エラー: TELEGRAM_BOT_TOKEN または TELEGRAM_CHAT_ID が未設定です')
    process.exitCode = 1
    return
  }
  console.log('✅ Telegram テスト通知を送信しました')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`❌ Telegram送信失敗: ${err.message}`)
    process.exitCode = 1
  })
}
