#!/usr/bin/env node
// content/gmb-drafts/ の下書きJSONを検証する。外部通信なし。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { GMB_DRAFTS_DIR, GMB_POST_TYPES } from './generate-gmb-draft.mjs'
import { GATE_POLICIES, containsSecrets } from './lib/media-queue.mjs'

const REQUIRED = ['id', 'job_id', 'post_type', 'draft_text', 'gate_policy', 'created_at']
const GMB_LIMIT = 1500

if (!existsSync(GMB_DRAFTS_DIR)) {
  console.log('✅ gmb drafts directory ready (0 件)')
  process.exit(0)
}

const files = readdirSync(GMB_DRAFTS_DIR).filter((f) => f.endsWith('.json')).sort()
let hasErrors = false

for (const file of files) {
  const draft = JSON.parse(readFileSync(join(GMB_DRAFTS_DIR, file), 'utf8'))
  const errors = []
  for (const field of REQUIRED) {
    if (draft[field] === undefined || draft[field] === null) errors.push(`${field} がありません`)
  }
  if (draft.post_type && !(draft.post_type in GMB_POST_TYPES)) {
    errors.push(`post_type が固定enum外です: "${draft.post_type}"`)
  }
  if (draft.gate_policy && !GATE_POLICIES.includes(draft.gate_policy)) {
    errors.push(`gate_policy が固定enum外です: "${draft.gate_policy}"`)
  }
  if (typeof draft.draft_text === 'string' && draft.draft_text.length > GMB_LIMIT) {
    errors.push(`draft_text が文字数上限 (${GMB_LIMIT}) を超えています`)
  }
  for (const field of ['draft_text', 'cta_url', 'source_post']) {
    if (containsSecrets(draft[field])) {
      errors.push(`${field} に秘密値らしき文字列が含まれています (token / secret / api key / Bearer / sk- / AIza / base64風)`)
    }
  }
  if (draft.external_result !== null && draft.external_result !== undefined) {
    errors.push('external_result が null ではありません (v1では投稿しないため常にnullであるべきです)')
  }
  if (errors.length > 0) {
    hasErrors = true
    console.error(`❌ ${file}`)
    for (const error of errors) console.error(`   - ${error}`)
  }
}

if (hasErrors) process.exit(1)
console.log(`✅ All GMB drafts valid (${files.length} 件)`)
