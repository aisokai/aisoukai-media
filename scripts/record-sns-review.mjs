#!/usr/bin/env node
// record-sns-review.mjs
// SNS ドラフト (publish_mode: ai_mutual_review) のレビュー結果を証拠ログへ追記し、frontmatter を更新する。
// 実行するのはレビュー担当 AI (作成とは別系統) の実行主体。投稿・外部送信は一切行わない。
//
// 使い方:
//   npm run sns:record-review -- <draft-filename> --decision pass|changes_requested|escalate \
//     --reviewed-by "chatgpt:<run-id>" \
//     --checks medical_ad=true,facts=true,exception_category=true,brand_tone=true,media_rights=true,mixup_prevention=true,flag_alignment=true \
//     [--exception-category <category>] [--notes "差し戻し理由"] [--evidence-dir <dir>]
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SNS_DRAFTS_DIR } from './lib/sns-drafts.mjs'
import { REVIEW_CHECK_KEYS, SNS_REVIEW_DIR, recordSnsReview } from './lib/sns-mutual-review.mjs'

export function parseChecks(value) {
  if (!value) throw new Error('--checks を指定してください')
  const checks = {}
  for (const part of value.split(',')) {
    const [key, raw] = part.split('=')
    if (!REVIEW_CHECK_KEYS.includes(key)) throw new Error(`checks の項目が無効です: "${key}"`)
    if (raw !== 'true' && raw !== 'false') throw new Error(`checks.${key} は true / false で指定してください`)
    checks[key] = raw === 'true'
  }
  const missing = REVIEW_CHECK_KEYS.filter((key) => !(key in checks))
  if (missing.length > 0) throw new Error(`checks に未指定の項目があります: ${missing.join(', ')}`)
  return checks
}

function main() {
  const args = process.argv.slice(2)
  const getFlag = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const flagValues = new Set(args.filter((a, i) => i > 0 && args[i - 1].startsWith('--')))
  const target = args.find((a) => !a.startsWith('--') && !flagValues.has(a))
  if (!target) {
    console.error('使い方: npm run sns:record-review -- <draft-filename> --decision pass|changes_requested|escalate --reviewed-by "chatgpt:<run-id>" --checks k=true,...')
    process.exit(1)
  }
  const name = target.endsWith('.md') ? target : `${target}.md`
  if (name !== basename(name) || name.includes('..') || name.startsWith('.')) {
    console.error(`エラー: ファイル名にパスを含めることはできません: ${target}`)
    process.exit(1)
  }
  const draftPath = join(SNS_DRAFTS_DIR, name)
  if (!existsSync(draftPath)) {
    console.error(`エラー: ドラフトが見つかりません: ${name}`)
    process.exit(1)
  }

  try {
    const { record, data } = recordSnsReview({
      draftPath,
      decision: getFlag('decision'),
      reviewedBy: getFlag('reviewed-by'),
      checks: parseChecks(getFlag('checks')),
      exceptionCategory: getFlag('exception-category') ?? null,
      notes: getFlag('notes') ?? null,
      evidenceDir: getFlag('evidence-dir') ?? SNS_REVIEW_DIR,
    })
    console.log(`✅ レビュー証拠を記録しました: ${name}`)
    console.log(`   evidence_id: ${record.record_id}`)
    console.log(`   content_hash: ${record.content_hash}`)
    console.log(`   mutual_review.state: ${data.mutual_review.state} / status: ${data.status}`)
    console.log('   投稿はこのスクリプトからは行いません。')
  } catch (e) {
    console.error(`エラー: ${e.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
