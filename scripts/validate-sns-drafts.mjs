#!/usr/bin/env node
// SNS ドラフトの検証 CLI。第1層 (構造検証) + 第2層 (相互監視の証拠照合) を実行する。
// 使い方: npm run media:sns:validate [-- --evidence-dir <dir>] [--drafts-dir <dir>]
// 証拠に関する不整合はすべてエラー (警告に落とさない)。media-gate のフラグ状態には依存しない。
import { basename } from 'node:path'
import { SNS_DRAFTS_DIR, listSnsDraftFiles, validateSnsDraftFile } from './lib/sns-drafts.mjs'
import {
  EVIDENCE_FILE,
  EVIDENCE_RECORD_TYPE,
  POSTING_AUDIT_FILE,
  POSTING_AUDIT_RECORD_TYPE,
  SNS_REVIEW_DIR,
  loadLog,
  verifySnsPublishable,
} from './lib/sns-mutual-review.mjs'

const args = process.argv.slice(2)
function getDirFlag(name, fallback) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  const value = args[i + 1]
  if (!value || value.startsWith('--')) {
    console.error(`エラー: --${name} にディレクトリを指定してください`)
    process.exit(1)
  }
  return value
}
const evidenceDir = getDirFlag('evidence-dir', SNS_REVIEW_DIR)
const draftsDir = getDirFlag('drafts-dir', SNS_DRAFTS_DIR)

// 証拠ログ・投稿監査ログのチェーンはドラフトの有無にかかわらず検証する
const logErrors = []
for (const [file, type] of [[EVIDENCE_FILE, EVIDENCE_RECORD_TYPE], [POSTING_AUDIT_FILE, POSTING_AUDIT_RECORD_TYPE]]) {
  const log = loadLog(evidenceDir, file, type)
  if (log.errors.length > 0) logErrors.push({ file, errors: log.errors })
}

const files = listSnsDraftFiles(draftsDir)

if (files.length === 0 && logErrors.length === 0) {
  console.log('✅ SNS drafts directory ready (0 件)')
  process.exit(0)
}

let hasErrors = logErrors.length > 0
let hasWarnings = false
const report = files.map((filePath) => {
  let result
  try {
    result = validateSnsDraftFile(filePath)
    if (result.data.publish_mode === 'ai_mutual_review') {
      const layer2 = verifySnsPublishable(filePath, { evidenceDir })
      for (const error of layer2.errors) {
        if (!result.errors.includes(error)) result.errors.push(error)
      }
    }
  } catch (error) {
    // 不正な YAML・読み込み失敗もファイル単位のエラーとして報告し、検証を止めない
    result = { file: basename(filePath), errors: [`読み込み・検証に失敗しました: ${error.message}`], warnings: [] }
  }
  if (result.errors.length > 0) hasErrors = true
  if (result.warnings.length > 0) hasWarnings = true
  return result
})

if (!hasErrors) {
  if (hasWarnings) {
    console.log(`✅ All SNS drafts valid (${files.length} 件) — 警告あり`)
    for (const { file, warnings } of report) {
      if (warnings.length > 0) {
        console.warn(`⚠️  ${file}`)
        for (const warning of warnings) console.warn(`   ⚠ ${warning}`)
      }
    }
    process.exit(0)
  }
  console.log(`✅ All SNS drafts valid (${files.length} 件)`)
  process.exit(0)
}

for (const { file, errors } of logErrors) {
  console.error(`❌ ${file}`)
  for (const error of errors) console.error(`   - ${error}`)
}

for (const { file, errors, warnings } of report) {
  if (errors.length > 0) {
    console.error(`❌ ${file}`)
    for (const error of errors) console.error(`   - ${error}`)
  }
  if (warnings.length > 0) {
    console.warn(`⚠️  ${file}`)
    for (const warning of warnings) console.warn(`   ⚠ ${warning}`)
  }
}

process.exit(1)
