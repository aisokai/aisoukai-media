#!/usr/bin/env node
// content/gmb-reviews/ の snapshot と返信案を検証する。外部通信なし。
// 重点チェック: 返信案に raw_text が混入していないこと / draft_textに個人情報が無いこと。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { REPLIES_DIR, SNAPSHOTS_DIR } from './gmb-review-watcher.mjs'
import { CLASSIFICATIONS, REPLY_TEMPLATES } from './lib/review-rules.mjs'
import { GATE_POLICIES, RISK_LEVELS, containsPersonalInfo } from './lib/media-queue.mjs'

const SNAPSHOT_REQUIRED = ['review_id', 'rating', 'raw_text', 'masked_text', 'classification', 'matched_rule', 'detected_at']
const REPLY_REQUIRED = ['review_id', 'job_id', 'template_id', 'draft_text', 'risk_level', 'gate_policy', 'created_at']
const REPLY_MAX_LENGTH = 400

let hasErrors = false
let count = 0

function report(file, errors) {
  if (errors.length === 0) return
  hasErrors = true
  console.error(`❌ ${file}`)
  for (const error of errors) console.error(`   - ${error}`)
}

if (existsSync(SNAPSHOTS_DIR)) {
  for (const file of readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json')).sort()) {
    count++
    const snapshot = JSON.parse(readFileSync(join(SNAPSHOTS_DIR, file), 'utf8'))
    const errors = []
    for (const field of SNAPSHOT_REQUIRED) {
      if (snapshot[field] === undefined || snapshot[field] === null) errors.push(`${field} がありません`)
    }
    if (snapshot.classification && !CLASSIFICATIONS.includes(snapshot.classification)) {
      errors.push(`classification が固定enum外です: "${snapshot.classification}"`)
    }
    if (typeof snapshot.masked_text === 'string' && containsPersonalInfo(snapshot.masked_text)) {
      errors.push('masked_text に個人情報らしき記述が残っています')
    }
    report(`snapshots/${file}`, errors)
  }
}

if (existsSync(REPLIES_DIR)) {
  for (const file of readdirSync(REPLIES_DIR).filter((f) => f.endsWith('.json')).sort()) {
    count++
    const reply = JSON.parse(readFileSync(join(REPLIES_DIR, file), 'utf8'))
    const errors = []
    for (const field of REPLY_REQUIRED) {
      if (reply[field] === undefined || reply[field] === null) errors.push(`${field} がありません`)
    }
    if ('raw_text' in reply) errors.push('返信案に raw_text が含まれています (禁止)')
    if (reply.template_id && !(reply.template_id in REPLY_TEMPLATES)) {
      errors.push(`template_id が固定enum外です: "${reply.template_id}"`)
    }
    if (reply.risk_level && !RISK_LEVELS.includes(reply.risk_level)) {
      errors.push(`risk_level が固定enum外です: "${reply.risk_level}"`)
    }
    if (reply.gate_policy && !GATE_POLICIES.includes(reply.gate_policy)) {
      errors.push(`gate_policy が固定enum外です: "${reply.gate_policy}"`)
    }
    if (typeof reply.draft_text === 'string') {
      if (reply.draft_text.length > REPLY_MAX_LENGTH) errors.push(`draft_text が上限 (${REPLY_MAX_LENGTH}字) を超えています`)
      if (containsPersonalInfo(reply.draft_text)) errors.push('draft_text に個人情報らしき記述があります')
    }
    if (reply.external_result !== null && reply.external_result !== undefined) {
      errors.push('external_result が null ではありません (v0では返信送信しないため常にnullであるべきです)')
    }
    report(`replies/${file}`, errors)
  }
}

if (hasErrors) process.exit(1)
console.log(`✅ All GMB review files valid (${count} 件)`)
