#!/usr/bin/env node
// 緊急お知らせ draft generator。
// 1つの入力 (例: 「本日午後休診」) から媒体別の文面を一括生成し、
// content/emergency-drafts/ に保存して Human Gate 付き queue item を作る。
// 外部投稿・外部送信は一切しない。テンプレートベースで AI 推論なし。
//
// 使い方:
//   node scripts/generate-emergency-notice.mjs --input "本日午後休診" [--date YYYY-MM-DD] [--dry-run]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ROOT, createJob, detectMedicalAdWarnings, getJstTimestamp, getTodayJst,
  redactSecrets, saveJob, transitionJob,
} from './lib/media-queue.mjs'

export const EMERGENCY_DRAFTS_DIR = join(ROOT, 'content', 'emergency-drafts')

const CLINIC_NAME = '医療法人藍想会'
const CONTACT_NOTE = '詳細はお電話にてお問い合わせください。'

// 入力キーワード → notice type の固定分類表 (上から順に評価)
export function classifyNoticeType(inputText) {
  const text = String(inputText ?? '')
  if (text.includes('休診')) return 'temporary_closure_notice'
  if (text.includes('時間') && text.includes('変更')) return 'schedule_change_notice'
  if (text.includes('変更')) return 'schedule_change_notice'
  return 'gmb_emergency_notice'
}

const NOTICE_LABELS = Object.freeze({
  temporary_closure_notice: '休診のお知らせ',
  schedule_change_notice: '診療時間変更のお知らせ',
  gmb_emergency_notice: 'お知らせ',
})

// channel別の文字数上限 (adapter定数。超過はvalidatorがエラーにする)
export const CHANNEL_LIMITS = Object.freeze({
  website_notice: 2000,
  gmb: 1500,
  line_official: 500,
  instagram: 2200,
  x: 280,
  internal_print: 1000,
})

// 媒体別テンプレート。短く、医院公式文体。医療内容に踏み込まない。
export function buildChannelDrafts({ inputText, noticeType, date }) {
  const label = NOTICE_LABELS[noticeType]
  const body = String(inputText).trim()
  return {
    website_notice:
      `【${label}】\n\n患者の皆さまへ\n\n${body}とさせていただきます。`
      + `ご来院を予定されていた皆さまには大変ご迷惑をおかけいたしますが、`
      + `何卒ご理解のほどお願い申し上げます。\n\n${CONTACT_NOTE}\n\n${CLINIC_NAME}`,
    gmb:
      `【${label}】${body}とさせていただきます。`
      + `ご迷惑をおかけいたしますが、ご理解のほどお願い申し上げます。${CONTACT_NOTE}`,
    line_official:
      `【${label}】\n${body}とさせていただきます。`
      + `ご迷惑をおかけし申し訳ございません。${CONTACT_NOTE}`,
    instagram:
      `【${label}】\n${body}とさせていただきます。`
      + `ご迷惑をおかけいたしますが、ご理解のほどお願い申し上げます。\n\n${CLINIC_NAME}`,
    x:
      `【${label}】${body}とさせていただきます。ご理解のほどお願い申し上げます。`,
    internal_print:
      `${date}\n\n${label}\n\n${body}とさせていただきます。\n\n`
      + `患者さまへのご案内をお願いいたします。\n\n${CLINIC_NAME}`,
  }
}

export function buildEmergencyNotice({ inputText, date = getTodayJst() }) {
  // 入力経由の秘密値混入を遮断。以降の全保存経路 (JSON / Markdown / 媒体別文面) はこの値を使う。
  const cleanInput = redactSecrets(String(inputText ?? ''))
  const noticeType = classifyNoticeType(cleanInput)
  const drafts = buildChannelDrafts({ inputText: cleanInput, noticeType, date })
  const warnings = detectMedicalAdWarnings(Object.values(drafts).join('\n'))
  for (const [channel, text] of Object.entries(drafts)) {
    if (text.length > CHANNEL_LIMITS[channel]) {
      warnings.push(`${channel} の文面が文字数上限 (${CHANNEL_LIMITS[channel]}) を超えています`)
    }
  }
  return { noticeType, drafts, warnings, cleanInput }
}

export function generateEmergencyNotice({ inputText, date = getTodayJst(), dryRun = false }) {
  const { noticeType, drafts, warnings, cleanInput } = buildEmergencyNotice({ inputText, date })

  let job = createJob({
    type: noticeType,
    source: 'manual',
    sourceText: cleanInput,
    targetChannels: Object.keys(drafts),
    riskLevel: 'low',
  })
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'review_pending')

  const noticeDir = join(EMERGENCY_DRAFTS_DIR, job.id)
  const notice = {
    id: job.id,
    job_id: job.id,
    notice_type: noticeType,
    input_text: cleanInput,
    date,
    drafts,
    warnings,
    created_at: getJstTimestamp(),
  }

  if (!dryRun) {
    mkdirSync(noticeDir, { recursive: true })
    const outputPaths = []
    for (const [channel, text] of Object.entries(drafts)) {
      const path = join(noticeDir, `${channel}.md`)
      writeFileSync(path, `${text}\n`)
      outputPaths.push(relative(ROOT, path))
    }
    const jsonPath = join(noticeDir, 'notice.json')
    writeFileSync(jsonPath, `${JSON.stringify(notice, null, 2)}\n`)
    outputPaths.push(relative(ROOT, jsonPath))
    job = { ...job, output_paths: outputPaths }
    saveJob(job)
  }

  return { job, notice }
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

function main() {
  const inputText = getArg('input')
  if (!inputText) {
    console.error('使い方: node scripts/generate-emergency-notice.mjs --input "本日午後休診" [--date YYYY-MM-DD] [--dry-run]')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')
  const { job, notice } = generateEmergencyNotice({
    inputText,
    date: getArg('date') ?? getTodayJst(),
    dryRun,
  })
  console.log(`✅ 緊急お知らせ案を生成しました (${dryRun ? 'dry-run・保存なし' : '保存済み'})`)
  console.log(`   job: ${job.id} [${job.status}] type=${notice.notice_type} gate=${job.gate_policy}`)
  for (const warning of notice.warnings) console.warn(`   ⚠ ${warning}`)
  console.log('   外部投稿は行いません。承認はHuman Gateです。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
