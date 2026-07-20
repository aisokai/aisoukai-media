#!/usr/bin/env node
// Telegram Bot への意図的な疎通確認専用CLI。
// 通常テストから隔離するため、test-* / *.test.* の名前は使わない。
// `--send` がない限り、環境変数を読まず、外部通信もしない。

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { EXPLICIT_SEND_FLAG, hasExplicitHumanGate, HUMAN_APPROVAL_FLAG } from './lib/explicit-execution-gate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEnv(env = process.env) {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

export async function runTelegramLiveCheck({
  argv = process.argv.slice(2), env = process.env, loadEnvImpl = loadEnv,
  loadSenderImpl = async () => (await import('./telegram-live-send.mjs')).sendTelegram,
} = {}) {
  if (!hasExplicitHumanGate(argv)) return { sent: false, reason: 'explicit-human-gate-required' }

  loadEnvImpl(env)
  const botToken = env.TELEGRAM_BOT_TOKEN
  const chatId = env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) return { sent: false, reason: 'missing-credentials' }

  const sendTelegram = await loadSenderImpl()
  await sendTelegram(botToken, chatId, 'aisoukai-media Telegram notification test')
  return { sent: true, reason: 'sent' }
}

async function main() {
  const result = await runTelegramLiveCheck()
  if (result.reason === 'explicit-human-gate-required') {
    console.error(`外部送信には ${EXPLICIT_SEND_FLAG} と ${HUMAN_APPROVAL_FLAG} の明示が必要です。通常テストではこのCLIを実行しません。`)
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
