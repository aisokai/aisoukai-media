#!/usr/bin/env node
// LINE WORKS Instruction Intake Stub (dry-run)。
// 実APIは呼ばない。送信・通知機能は存在しない。
// mock受信 (またはCLI入力) を content/lineworks-requests/ に保存し、
// media queue item (type: lineworks_instruction) に変換する。
// 将来は lib/lineworks-adapter を追加して受信部のみ差し替える。
//
// 使い方:
//   node scripts/lineworks-intake-dry-run.mjs --input "来週の休診案内を作って" [--dry-run]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ROOT, createJob, getJstTimestamp, redactSecrets, saveJob,
} from './lib/media-queue.mjs'

export const LINEWORKS_REQUESTS_DIR = join(ROOT, 'content', 'lineworks-requests')

export function buildLineworksRequest({ text, senderDisplay = '院内ユーザー' }) {
  const job = createJob({
    type: 'lineworks_instruction',
    source: 'lineworks',
    sourceText: text,
    targetChannels: ['telegram_internal', 'obsidian'],
    riskLevel: 'low',
  })
  const request = {
    id: `lw-${job.id}`,
    job_id: job.id,
    sender_display: String(senderDisplay),
    text: redactSecrets(String(text)),
    received_at: getJstTimestamp(),
    intake_mode: 'mock',
  }
  return { job, request }
}

export function intakeLineworksRequest({ text, senderDisplay, dryRun = false }) {
  const { job, request } = buildLineworksRequest({ text, senderDisplay })
  if (!dryRun) {
    mkdirSync(LINEWORKS_REQUESTS_DIR, { recursive: true })
    const path = join(LINEWORKS_REQUESTS_DIR, `${request.id}.json`)
    writeFileSync(path, `${JSON.stringify(request, null, 2)}\n`)
    saveJob({ ...job, output_paths: [relative(ROOT, path)] })
  }
  return { job, request }
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

function main() {
  const text = getArg('input') ?? '【mock】明日の午前は休診のお知らせを各媒体向けに作成してください'
  const dryRun = process.argv.includes('--dry-run')
  const { job, request } = intakeLineworksRequest({ text, dryRun })
  console.log(`✅ LINE WORKS指示を受付けました (mock / ${dryRun ? 'dry-run・保存なし' : '保存済み'})`)
  console.log(`   request: ${request.id} → job: ${job.id} [${job.status}]`)
  console.log('   実APIは呼びません。LINE WORKSへの送信機能は存在しません。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
