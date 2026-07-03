#!/usr/bin/env node
// approve-sns-draft.mjs
// Human が SNS ドラフト確認後に実行する承認 CLI。AIが自動実行してはならない。
// frontmatter 更新 + review-history append + media queue job 遷移を行う。
// 承認 = 手動投稿可の意味。外部への投稿はこのスクリプトからは一切行わない。
//
// 使い方:
//   npm run sns:approve -- <draft-filename|slug> --reviewed-by "氏名"
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { SNS_DRAFTS_DIR, isDraftMarkdownFile, normalizeDraftData } from './lib/sns-drafts.mjs'
import { applySnsReviewDecision } from './lib/sns-review.mjs'
import { ROOT, getJstTimestamp, jobPath, transitionJob, saveJob } from './lib/media-queue.mjs'

const LOGS_DIR = join(ROOT, 'logs')
const LOG_PATH = join(LOGS_DIR, 'review-history.md')

function resolveDraftFile(arg) {
  const name = arg.endsWith('.md') ? arg : `${arg}.md`
  if (existsSync(join(SNS_DRAFTS_DIR, name))) return name
  // slug 部分一致 (末尾一致) で 1 件に絞れる場合は許可
  const candidates = readdirSync(SNS_DRAFTS_DIR)
    .filter((f) => isDraftMarkdownFile(f) && f.endsWith(name))
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) throw new Error(`複数候補があります: ${candidates.join(', ')}`)
  throw new Error(`ドラフトが見つかりません: ${name}`)
}

function appendReviewLog(entry) {
  const lines = [
    `## ${entry.datetime}`,
    `datetime: ${entry.datetime}`,
    `action: ${entry.action}`,
    `file: ${entry.file}`,
    `platform: ${entry.platform}`,
    `reviewed_by: ${entry.reviewed_by}`,
  ]
  if (entry.reason) lines.push(`reason: ${entry.reason}`)
  if (entry.media_job_id) lines.push(`media_job_id: ${entry.media_job_id}`)
  lines.push('')
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true })
  appendFileSync(LOG_PATH, lines.join('\n') + '\n', 'utf8')
}

function updateLinkedJob(jobId, decision, reviewedBy, timestamp) {
  if (!jobId) return null
  const path = jobPath(jobId)
  if (!existsSync(path)) {
    console.warn(`⚠ 紐付く media queue job が見つかりません: ${jobId} (frontmatter のみ更新)`)
    return null
  }
  let job = JSON.parse(readFileSync(path, 'utf8'))
  if (decision === 'approve') {
    job = transitionJob(job, 'approved', { approved_by: reviewedBy, approved_at: timestamp })
  } else {
    job = transitionJob(job, 'rejected')
  }
  saveJob(job)
  return job
}

export function runSnsReviewCli({ decision }) {
  const args = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('--'))
  const getFlag = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const target = positional[0]
  if (!target) {
    console.error(`使い方: npm run sns:${decision} -- <draft-filename|slug> --reviewed-by "氏名"${decision === 'reject' ? ' --reason "理由"' : ''}`)
    process.exit(1)
  }

  let filename
  try {
    filename = resolveDraftFile(target)
  } catch (e) {
    console.error(`エラー: ${e.message}`)
    process.exit(1)
  }

  const filePath = join(SNS_DRAFTS_DIR, filename)
  const parsed = matter(readFileSync(filePath, 'utf8'))
  const timestamp = getJstTimestamp()

  let updated
  try {
    updated = applySnsReviewDecision({
      data: normalizeDraftData(parsed.data),
      decision,
      reviewedBy: getFlag('reviewed-by'),
      reason: getFlag('reason'),
      timestamp,
    })
  } catch (e) {
    console.error(`エラー: ${e.message}`)
    process.exit(1)
  }

  const job = updateLinkedJob(updated.media_job_id, decision, updated.reviewed_by, timestamp)
  writeFileSync(filePath, matter.stringify(parsed.content, updated))
  appendReviewLog({
    datetime: timestamp,
    action: decision === 'approve' ? 'sns_approve' : 'sns_reject',
    file: filename,
    platform: updated.platform,
    reviewed_by: updated.reviewed_by,
    reason: updated.rejected_reason,
    media_job_id: updated.media_job_id,
  })

  console.log(`✅ ${decision === 'approve' ? '承認しました (手動投稿可)' : '差し戻しました'}: ${filename}`)
  if (job) console.log(`   media queue job ${job.id} → ${job.status}`)
  if (decision === 'approve') {
    console.log('   投稿は Human が Instagram / X / LINE の各アプリから手動で行ってください。')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSnsReviewCli({ decision: 'approve' })
}
