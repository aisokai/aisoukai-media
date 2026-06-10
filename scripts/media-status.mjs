#!/usr/bin/env node
// Media Automation の状態サマリ。外部通信なし。秘密値は表示しない。
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JOB_STATUSES, ROOT, listJobs } from './lib/media-queue.mjs'

export function countDir(path, ext = null) {
  if (!existsSync(path)) return 0
  return readdirSync(path).filter((f) => !f.startsWith('.') && f !== 'README.md' && (!ext || f.endsWith(ext))).length
}

export function buildStatusSummary() {
  const jobs = listJobs()
  const byStatus = {}
  for (const status of JOB_STATUSES) byStatus[status] = 0
  for (const job of jobs) {
    if (job.status in byStatus) byStatus[job.status]++
  }
  return {
    queue_total: jobs.length,
    by_status: byStatus,
    review_pending: byStatus.review_pending,
    human_required: byStatus.human_required,
    failed: byStatus.failed,
    sns_drafts: countDir(join(ROOT, 'content', 'sns-drafts'), '.md'),
    gmb_drafts: countDir(join(ROOT, 'content', 'gmb-drafts'), '.json'),
    gmb_reply_drafts: countDir(join(ROOT, 'content', 'gmb-reviews', 'replies'), '.json'),
    emergency_drafts: countDir(join(ROOT, 'content', 'emergency-drafts')),
    lineworks_requests: countDir(join(ROOT, 'content', 'lineworks-requests'), '.json'),
  }
}

function main() {
  const s = buildStatusSummary()
  console.log('📊 Media Automation Status')
  console.log(`   queue合計:        ${s.queue_total} 件`)
  console.log(`   review_pending:   ${s.review_pending} 件`)
  console.log(`   human_required:   ${s.human_required} 件`)
  console.log(`   failed:           ${s.failed} 件`)
  for (const [status, count] of Object.entries(s.by_status)) {
    if (count > 0 && !['review_pending', 'human_required', 'failed'].includes(status)) {
      console.log(`   ${status}: ${count} 件`)
    }
  }
  console.log('   ── drafts ──')
  console.log(`   SNS下書き:        ${s.sns_drafts} 件`)
  console.log(`   GMB投稿下書き:    ${s.gmb_drafts} 件`)
  console.log(`   GMB返信案:        ${s.gmb_reply_drafts} 件`)
  console.log(`   緊急お知らせ:     ${s.emergency_drafts} 件`)
  console.log(`   LINE WORKS指示:   ${s.lineworks_requests} 件`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
