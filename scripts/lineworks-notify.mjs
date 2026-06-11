#!/usr/bin/env node
// LINE WORKS 院内通知CLI (Phase 5)。院内チャンネル限定。
// 三重ゲート (すべて満たさないと送信しない):
//   ① 送信対象は**承認済み queue item** (--from-notice <mj-id> で status=approved|executed) のみ
//   ② config/media-gate.json の lineworks_internal_auto フラグON
//   ③ --apply 明示
// 自由文 (--text) は dry-run プレビュー専用で、--apply しても送信できない。
//
// 使い方:
//   node scripts/lineworks-notify.mjs --text "..."                          # dry-runプレビューのみ (送信不可)
//   node scripts/lineworks-notify.mjs --from-notice <mj-id>                 # dry-run
//   node scripts/lineworks-notify.mjs --from-notice <mj-id> --apply         # 承認済みjob + フラグONなら送信

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, appendMediaLog, loadGateConfig } from './lib/media-queue.mjs'
import { loadJob } from './lib/telegram-media-commands.mjs'

// 送信前提条件の検証 (テスト可能な純関数)。理由を返す。
export function validateLineworksSend({ job, flagOn }) {
  if (!job) return { ok: false, reason: '送信は --from-notice <mj-id> (承認済みjob) のみ可能です。--text はプレビュー専用です' }
  if (!['approved', 'executed'].includes(job.status)) {
    return { ok: false, reason: `job が承認されていません: status=${job.status} (approved|executed が必要)` }
  }
  if (!job.approved_by) return { ok: false, reason: 'approved_by が記録されていません (承認経路を通っていません)' }
  if (!flagOn) return { ok: false, reason: 'lineworks_internal_auto フラグがOFFです (ONは先生のみ)' }
  return { ok: true, reason: null }
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

async function main() {
  const apply = process.argv.includes('--apply')
  const noticeId = getArg('from-notice')
  let text = getArg('text')
  let job = null

  if (noticeId) {
    job = loadJob(noticeId)
    const path = join(ROOT, 'content', 'emergency-drafts', noticeId, 'internal_print.md')
    if (!existsSync(path)) {
      console.error(`❌ 院内向け文面が見つかりません: ${noticeId}`)
      process.exit(1)
    }
    text = readFileSync(path, 'utf8').trim()
  }
  if (!text) {
    console.error('使い方: --from-notice <mj-id> [--apply] (--text はプレビュー専用)')
    process.exit(1)
  }

  console.log('━'.repeat(56))
  console.log('LINE WORKS 院内通知')
  console.log(text)
  console.log('━'.repeat(56))

  const config = loadGateConfig()
  const flagOn = config?.flags?.lineworks_internal_auto === true
  const gate = validateLineworksSend({ job, flagOn })

  if (!apply) {
    console.log(`[dry-run] 送信しません (送信条件: ${gate.ok ? '✅ 充足 (--applyで送信可)' : `⛔ ${gate.reason}`})`)
    return
  }
  if (!gate.ok) {
    console.error(`⛔ 送信しません: ${gate.reason}`)
    process.exit(1)
  }

  const { sendInternalMessage } = await import('./lib/lineworks-adapter.mjs')
  await sendInternalMessage({ text })
  appendMediaLog({ event: 'lineworks_internal_sent', notice_id: noticeId, job_status: job.status, length: text.length })
  console.log('✅ LINE WORKS 院内チャンネルへ送信しました')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  })
}
