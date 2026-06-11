#!/usr/bin/env node
// Obsidian / mybrain 日次エクスポート (Phase 6)。
// logs/media-automation.jsonl から当日分イベントを集計し、
// vault (デフォルト ~/Desktop/mybrain) の media-automation/YYYY-MM-DD.md に書き出す。
// 追記・上書きは当日ファイルのみ。既存ファイルの削除はしない。外部通信なし。
//
// 使い方:
//   node scripts/export-obsidian.mjs [--date YYYY-MM-DD] [--dry-run]
//   環境変数 MYBRAIN_PATH で vault パスを変更可能

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MEDIA_LOG_PATH, getTodayJst, listJobs } from './lib/media-queue.mjs'

export function getVaultDir() {
  return process.env.MYBRAIN_PATH ?? join(homedir(), 'Desktop', 'mybrain')
}

export function readLogEvents(date, logPath = MEDIA_LOG_PATH) {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line) } catch { return null } })
    .filter((e) => e && typeof e.ts === 'string' && e.ts.startsWith(date))
}

const EVENT_LABELS = Object.freeze({
  job_saved: 'queue更新',
  job_approved: '✅ 承認',
  job_rejected: '❌ 差し戻し',
  apply_executed: '📤 外部実行',
  apply_failed: '⚠️ 実行失敗',
  executor_job_failed: '⚠️ 自動実行失敗',
  reply_deleted: '🗑 返信削除',
  post_deleted: '🗑 投稿削除',
  review_failed: '⚠️ 口コミ処理失敗',
  lineworks_internal_sent: '📨 院内通知',
})

// 日次Markdownを組み立てる (純関数: テスト可能)
export function buildDailyMarkdown({ date, events, statusCounts }) {
  const lines = [
    `# Media Automation 日次記録 ${date}`,
    '',
    '## サマリ',
    `- イベント数: ${events.length}`,
    `- queue合計: ${statusCounts.queue_total} / review待ち: ${statusCounts.review_pending} / 要対応: ${statusCounts.human_required} / 失敗: ${statusCounts.failed}`,
    '',
    '## Human Gate / 実行履歴',
  ]
  const important = events.filter((e) => e.event !== 'job_saved')
  if (important.length === 0) lines.push('- (承認・実行イベントなし)')
  for (const e of important) {
    const label = EVENT_LABELS[e.event] ?? e.event
    const detail = [e.job_id, e.by, e.review_id, e.post_name,
      e.external_result ? `ID:${JSON.stringify(e.external_result)}` : null,
      e.reason ? `理由:${e.reason}` : null,
      e.error ? `error:${e.error}` : null,
    ].filter(Boolean).join(' ')
    lines.push(`- ${e.ts.slice(11, 16)} ${label} ${detail}`)
  }
  lines.push('', '## queue更新ログ')
  const saved = events.filter((e) => e.event === 'job_saved')
  lines.push(saved.length === 0 ? '- (なし)' : `- ${saved.length} 件 (詳細は logs/media-automation.jsonl)`)
  lines.push('')
  return lines.join('\n')
}

export function exportDaily({ date = getTodayJst(), dryRun = false } = {}) {
  const events = readLogEvents(date)
  const jobs = listJobs()
  const statusCounts = {
    queue_total: jobs.length,
    review_pending: jobs.filter((j) => j.status === 'review_pending').length,
    human_required: jobs.filter((j) => j.status === 'human_required').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  }
  const markdown = buildDailyMarkdown({ date, events, statusCounts })
  const outDir = join(getVaultDir(), 'media-automation')
  const outPath = join(outDir, `${date}.md`)
  if (!dryRun) {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(outPath, markdown)
  }
  return { outPath, markdown, eventCount: events.length }
}

function main() {
  const dateIdx = process.argv.indexOf('--date')
  const date = dateIdx >= 0 ? process.argv[dateIdx + 1] : getTodayJst()
  const dryRun = process.argv.includes('--dry-run')
  const { outPath, eventCount } = exportDaily({ date, dryRun })
  console.log(`✅ Obsidian日次記録 ${dryRun ? '(dry-run・書き込みなし)' : 'を書き出しました'}`)
  console.log(`   ${outPath} (イベント ${eventCount} 件)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
