#!/usr/bin/env node
// Telegram Instruction Adapter Stub (dry-run)。
// 既存 telegram-ops.mjs には触れない。Telegram送信はしない。
// コマンド文字列 (mock入力) を解釈し、allowlist内なら media queue item に変換する。
// /approve /reject /post /publish の実行系は本Batch対象外として blocked。
//
// 使い方:
//   node scripts/telegram-instruction-dry-run.mjs --input "/notice 本日午後休診" [--dry-run]

import { pathToFileURL } from 'node:url'
import { classifyNoticeType, generateEmergencyNotice } from './generate-emergency-notice.mjs'
import { createJob, getJstTimestamp, listJobs, saveJob } from './lib/media-queue.mjs'

// 受付可能コマンドの固定allowlist。これ以外は変換しない。
export const COMMAND_ALLOWLIST = Object.freeze(['notice', 'gmb', 'review', 'sns', 'status'])
export const BLOCKED_COMMANDS = Object.freeze(['approve', 'reject', 'post', 'publish'])

export function parseInstruction(input) {
  const text = String(input ?? '').trim()
  const match = text.match(/^\/([a-z]+)\s*(.*)$/s)
  const received_at = getJstTimestamp()
  if (!match) {
    return { command: 'unknown', allowed: false, payload: text, mapped_job_type: null, job_id: null, blocked_reason: 'コマンド形式ではありません (/notice 等で始めてください)', received_at }
  }
  const [, command, payload] = match
  if (BLOCKED_COMMANDS.includes(command)) {
    return { command, allowed: false, payload, mapped_job_type: null, job_id: null, blocked_reason: `blocked: /${command} は実行系コマンドのため本Batchでは対象外です (Human Gate)`, received_at }
  }
  if (!COMMAND_ALLOWLIST.includes(command)) {
    return { command: 'unknown', allowed: false, payload, mapped_job_type: null, job_id: null, blocked_reason: `不明なコマンドです: /${command}`, received_at }
  }
  const mapped = {
    notice: payload ? classifyNoticeType(payload) : null,
    gmb: 'gmb_update',
    sns: 'sns_repurpose',
    review: null, // 照会系: jobを作らない
    status: null, // 照会系: jobを作らない
  }[command]
  return { command, allowed: true, payload, mapped_job_type: mapped, job_id: null, blocked_reason: null, received_at }
}

export function handleInstruction(input, { dryRun = false } = {}) {
  const instruction = parseInstruction(input)
  if (!instruction.allowed || !instruction.mapped_job_type) return { instruction, job: null }

  if (instruction.command === 'notice') {
    const { job } = generateEmergencyNotice({ inputText: instruction.payload, dryRun })
    return { instruction: { ...instruction, job_id: job.id }, job }
  }

  let job = createJob({
    type: instruction.mapped_job_type,
    source: 'telegram',
    sourceText: instruction.payload,
    targetChannels: instruction.command === 'gmb' ? ['gmb'] : ['instagram', 'x', 'line_official'],
    riskLevel: 'low',
  })
  if (!dryRun) saveJob(job)
  return { instruction: { ...instruction, job_id: job.id }, job }
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

function main() {
  const input = getArg('input') ?? '/notice 本日午後休診'
  const dryRun = process.argv.includes('--dry-run')
  const { instruction, job } = handleInstruction(input, { dryRun })

  console.log(`✅ Telegram指示を解釈しました (mock / Telegram送信なし)`)
  console.log(`   command: /${instruction.command} allowed=${instruction.allowed}`)
  if (instruction.blocked_reason) console.log(`   ⛔ ${instruction.blocked_reason}`)
  if (job) console.log(`   job: ${job.id} [${job.status}] type=${job.type} gate=${job.gate_policy}`)
  if (instruction.command === 'review') {
    const pending = listJobs({ type: 'review_reply' }).filter((j) => ['review_pending', 'human_required'].includes(j.status))
    console.log(`   未返信口コミ対応待ち: ${pending.length} 件`)
    for (const p of pending) console.log(`   - ${p.id} [${p.status}] "${String(p.source_text).slice(0, 50)}"`)
  }
  if (instruction.command === 'status') {
    const jobs = listJobs()
    console.log(`   queue合計: ${jobs.length} 件`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
