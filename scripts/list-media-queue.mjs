#!/usr/bin/env node
// Media Queue 一覧表示。--status / --type でフィルタ。外部通信なし。
// source_text は要約表示のみ (秘密値はredact済みだが念のため短縮)。
import { listJobs } from './lib/media-queue.mjs'

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

const jobs = listJobs({ status: getArg('status'), type: getArg('type') })

if (jobs.length === 0) {
  console.log('media queue: 0 件')
  process.exit(0)
}

console.log(`media queue: ${jobs.length} 件`)
for (const job of jobs) {
  const text = String(job.source_text ?? '').slice(0, 40)
  console.log(`  ${job.id}  [${job.status}]  ${job.type}  gate=${job.gate_policy}  risk=${job.risk_level}  "${text}"`)
}
