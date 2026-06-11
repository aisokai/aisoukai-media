#!/usr/bin/env node
// Media Queue の review_pending / human_required digest 通知。
// デフォルトは console 表示のみ (外部通信なし)。--apply 指定時のみ送信する。
// 送信先別の二重ゲート:
//   Telegram   : --apply + telegram_notify flag ON
//   LINE WORKS : --apply + --lineworks + lineworks_internal_auto flag ON (院内チャンネル限定)
// 通知のみ。approve / reject / 外部実行とは接続しない。
//
// 使い方:
//   node scripts/notify-media-pending.mjs                      # console のみ
//   node scripts/notify-media-pending.mjs --apply              # Telegram 送信 (launchd 運用用)
//   node scripts/notify-media-pending.mjs --apply --lineworks  # LINE WORKS 院内チャンネルにも送信

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, listJobs, loadGateConfig } from './lib/media-queue.mjs'

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
  if (!json.ok) throw new Error(`Telegram API エラー: ${json.description ?? 'unknown'}`)
  return json
}

export function buildMediaPendingDigest() {
  const pending = listJobs().filter((j) => ['review_pending', 'human_required'].includes(j.status))
  if (pending.length === 0) return { count: 0, text: '📊 Media Queue: 承認待ちはありません' }

  const lines = pending.slice(0, 10).map((j) => {
    const mark = j.status === 'human_required' ? '🔴' : '🟡'
    return `${mark} ${j.id} ${j.type}\n   ${String(j.source_text).slice(0, 60)}`
  })
  const more = pending.length > 10 ? `\n…ほか ${pending.length - 10} 件` : ''
  const text = [
    `📊 Media Queue 承認待ち: ${pending.length} 件`,
    '',
    ...lines,
    more,
    '',
    '承認: /approve <id> ・差し戻し: /reject <id> <理由>',
  ].filter(Boolean).join('\n')
  return { count: pending.length, text }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const { count, text } = buildMediaPendingDigest()

  console.log('━'.repeat(56))
  console.log(text)
  console.log('━'.repeat(56))

  if (!apply) {
    console.log('(console表示のみ。Telegram送信は --apply + telegram_notify flag ON 時)')
    return
  }
  // flagゲート: envより先に判定。OFFなら送信しない (no-op)。
  if (loadGateConfig()?.flags?.telegram_notify !== true) {
    console.log('⏭ telegram_notify flag がOFFのため送信しません (ONは先生のみ)')
    return
  }
  if (count === 0) {
    console.log('承認待ち0件のため送信しません')
    return
  }

  loadEnv()
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) {
    console.warn('⚠️  Telegram 通知をスキップします (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 未設定)')
    return
  }
  try {
    await sendTelegram(botToken, chatId, text)
    console.log('✅ Telegram 通知を送信しました')
  } catch (err) {
    console.error(`❌ Telegram 送信失敗: ${err.message}`)
    process.exit(1)
  }

  // LINE WORKS 院内チャンネルへのdigest (任意。flag OFFならno-op)
  if (process.argv.includes('--lineworks')) {
    if (loadGateConfig()?.flags?.lineworks_internal_auto !== true) {
      console.log('⏭ lineworks_internal_auto flag がOFFのため LINE WORKS送信はスキップします')
      return
    }
    try {
      const { sendInternalMessage } = await import('./lib/lineworks-adapter.mjs')
      await sendInternalMessage({ text })
      console.log('✅ LINE WORKS 院内チャンネルへ送信しました')
    } catch (err) {
      console.warn(`⚠️ LINE WORKS送信失敗 (Telegram送信は成功済み): ${err.message}`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
