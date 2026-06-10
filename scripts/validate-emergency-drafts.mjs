#!/usr/bin/env node
// content/emergency-drafts/ の notice.json と媒体別文面を検証する。外部通信なし。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CHANNEL_LIMITS, EMERGENCY_DRAFTS_DIR } from './generate-emergency-notice.mjs'
import { containsSecrets } from './lib/media-queue.mjs'

const NOTICE_TYPES = ['temporary_closure_notice', 'schedule_change_notice', 'gmb_emergency_notice']
const REQUIRED = ['id', 'job_id', 'notice_type', 'input_text', 'date', 'drafts', 'created_at']

export function validateNotice(notice) {
  const errors = []
  for (const field of REQUIRED) {
    if (notice[field] === undefined || notice[field] === null) errors.push(`${field} がありません`)
  }
  if (notice.notice_type && !NOTICE_TYPES.includes(notice.notice_type)) {
    errors.push(`notice_type が固定enum外です: "${notice.notice_type}"`)
  }
  if (containsSecrets(notice.input_text)) {
    errors.push('input_text に秘密値らしき文字列が含まれています (token / secret / api key / Bearer / sk- / AIza / base64風)')
  }
  for (const [channel, text] of Object.entries(notice.drafts ?? {})) {
    if (!(channel in CHANNEL_LIMITS)) {
      errors.push(`channel が固定enum外です: "${channel}"`)
    } else if (typeof text !== 'string' || text.trim() === '') {
      errors.push(`${channel} の文面が空です`)
    } else if (text.length > CHANNEL_LIMITS[channel]) {
      errors.push(`${channel} の文面が文字数上限 (${CHANNEL_LIMITS[channel]}) を超えています`)
    } else if (containsSecrets(text)) {
      errors.push(`${channel} の文面に秘密値らしき文字列が含まれています`)
    }
  }
  return errors
}

if (!existsSync(EMERGENCY_DRAFTS_DIR)) {
  console.log('✅ emergency drafts directory ready (0 件)')
  process.exit(0)
}

const dirs = readdirSync(EMERGENCY_DRAFTS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

let hasErrors = false
let count = 0
for (const dir of dirs) {
  const noticePath = join(EMERGENCY_DRAFTS_DIR, dir, 'notice.json')
  if (!existsSync(noticePath)) {
    console.error(`❌ ${dir}: notice.json がありません`)
    hasErrors = true
    continue
  }
  count++
  const notice = JSON.parse(readFileSync(noticePath, 'utf8'))
  const errors = validateNotice(notice)
  if (errors.length > 0) {
    hasErrors = true
    console.error(`❌ ${dir}`)
    for (const error of errors) console.error(`   - ${error}`)
  }
}

if (hasErrors) process.exit(1)
console.log(`✅ All emergency drafts valid (${count} 件)`)
