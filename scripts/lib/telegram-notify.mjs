// telegram-notify.mjs
// 事後通知用の薄いヘルパー。
// 二重ゲート: ① config/media-gate.json の通知flag (初期OFF) が true であること
//            ② TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID が設定済みであること
// **envが存在しても flag OFF なら送信しない (no-op)**。秘密値はログに出さない。
// 通知失敗で本処理を止めない。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, loadGateConfig } from './media-queue.mjs'

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

export async function notifyTelegramIfConfigured(text, {
  flag = 'telegram_notify', config = loadGateConfig(), fetchImpl = fetch,
} = {}) {
  // flagゲートが最優先。env有無より先に判定し、OFFなら一切送信しない。
  if (config?.flags?.[flag] !== true) {
    console.log(`  (Telegram通知スキップ: flag "${flag}" がOFF。ONは先生のみ)`)
    return false
  }
  loadEnv()
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) {
    console.log('  (Telegram通知スキップ: 環境変数未設定)')
    return false
  }
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.description ?? 'unknown')
    return true
  } catch (err) {
    console.warn(`  ⚠️ Telegram通知失敗 (本処理は継続): ${err.message}`)
    return false
  }
}
