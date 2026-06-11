#!/usr/bin/env node
// LINE WORKS 院内通知CLI (Phase 5)。院内チャンネル限定。
// 二重ゲート: config/media-gate.json の lineworks_internal_auto フラグON + --apply 明示。
// どちらか欠けると送信しない (dry-run表示のみ)。
//
// 使い方:
//   node scripts/lineworks-notify.mjs --text "明日午前は休診です"            # dry-run
//   node scripts/lineworks-notify.mjs --text "..." --apply                  # フラグONなら送信
//   node scripts/lineworks-notify.mjs --from-notice <mj-id> [--apply]       # 緊急お知らせの院内文面を送信

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, appendMediaLog, loadGateConfig } from './lib/media-queue.mjs'

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

async function main() {
  const apply = process.argv.includes('--apply')
  const noticeId = getArg('from-notice')
  let text = getArg('text')

  if (noticeId) {
    const path = join(ROOT, 'content', 'emergency-drafts', noticeId, 'internal_print.md')
    if (!existsSync(path)) {
      console.error(`❌ 院内向け文面が見つかりません: ${noticeId}`)
      process.exit(1)
    }
    text = readFileSync(path, 'utf8').trim()
  }
  if (!text) {
    console.error('使い方: --text "本文" または --from-notice <mj-id> [--apply]')
    process.exit(1)
  }

  console.log('━'.repeat(56))
  console.log('LINE WORKS 院内通知')
  console.log(text)
  console.log('━'.repeat(56))

  const config = loadGateConfig()
  const flagOn = config?.flags?.lineworks_internal_auto === true

  if (!apply) {
    console.log(`[dry-run] 送信しません (フラグ: ${flagOn ? 'ON' : 'OFF'} / 実行は --apply)`)
    return
  }
  if (!flagOn) {
    console.log('⛔ lineworks_internal_auto フラグがOFFのため送信しません (ONは先生のみ)')
    process.exit(1)
  }

  const { sendInternalMessage } = await import('./lib/lineworks-adapter.mjs')
  await sendInternalMessage({ text })
  appendMediaLog({ event: 'lineworks_internal_sent', notice_id: noticeId ?? null, length: text.length })
  console.log('✅ LINE WORKS 院内チャンネルへ送信しました')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  })
}
