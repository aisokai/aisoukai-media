#!/usr/bin/env node
// Media Queue の全 job を固定enum・gate表引き整合で検証する。外部通信なし。
import { listJobs, loadGateConfig, validateJob } from './lib/media-queue.mjs'

const config = loadGateConfig()
if (!config) {
  console.warn('⚠️  config/media-gate.json が読めません。全jobは安全側 (human_gate) として扱われます')
}

const jobs = listJobs()
if (jobs.length === 0) {
  console.log('✅ media queue ready (0 件)')
  process.exit(0)
}

let hasErrors = false
for (const job of jobs) {
  const { errors, warnings } = validateJob(job, { config })
  if (errors.length > 0) {
    hasErrors = true
    console.error(`❌ ${job.id ?? '(idなし)'}`)
    for (const error of errors) console.error(`   - ${error}`)
  }
  for (const warning of warnings) console.warn(`⚠️  ${job.id}: ${warning}`)
}

if (hasErrors) process.exit(1)
console.log(`✅ All media queue jobs valid (${jobs.length} 件)`)
