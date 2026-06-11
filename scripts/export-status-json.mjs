#!/usr/bin/env node
// MitaniOS / AI司令塔 向け status JSON エクスポート (Phase 6)。
// data/media-status.json に queue状態・承認待ち・実行履歴を書き出す。
// mitanios-gui は command-center と同じ「静的JSONの同期コピー」パターンでこれを読む。
// 秘密値・口コミraw_textは含めない (source_textはredact/masked済みの値)。外部通信なし。

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, getJstTimestamp, getTodayJst, listJobs, loadGateConfig } from './lib/media-queue.mjs'
import { buildStatusSummary } from './media-status.mjs'
import { readLogEvents } from './export-obsidian.mjs'

export const STATUS_JSON_PATH = join(ROOT, 'data', 'media-status.json')

export function buildStatusExport() {
  const summary = buildStatusSummary()
  const config = loadGateConfig()
  const jobs = listJobs()
  const pendingList = jobs
    .filter((j) => ['review_pending', 'human_required'].includes(j.status))
    .map((j) => ({
      id: j.id, type: j.type, status: j.status, risk_level: j.risk_level,
      gate_policy: j.gate_policy, created_at: j.created_at,
      summary: String(j.source_text ?? '').slice(0, 80),
    }))
  const todayEvents = readLogEvents(getTodayJst())
    .filter((e) => e.event !== 'job_saved')
    .slice(-20)
  return {
    generated_at: getJstTimestamp(),
    source: 'aisoukai-media/scripts/export-status-json.mjs',
    counts: summary,
    flags: config?.flags ?? null,
    pending: pendingList,
    recent_events: todayEvents,
  }
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const data = buildStatusExport()
  if (!dryRun) {
    mkdirSync(dirname(STATUS_JSON_PATH), { recursive: true })
    writeFileSync(STATUS_JSON_PATH, `${JSON.stringify(data, null, 2)}\n`)
  }
  console.log(`✅ media-status.json ${dryRun ? '(dry-run)' : 'を書き出しました'}`)
  console.log(`   queue ${data.counts.queue_total} 件 / 承認待ち ${data.pending.length} 件 / 本日イベント ${data.recent_events.length} 件`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
