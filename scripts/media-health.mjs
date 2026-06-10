#!/usr/bin/env node
// Media Automation の health check。外部通信なし。秘密値は表示しない。
// 必須ディレクトリ / gate config / queue整合性 / 自動実行フラグ状態を確認する。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ROOT, listJobs, loadGateConfig, validateJob,
} from './lib/media-queue.mjs'

const REQUIRED_PATHS = [
  'content/media-queue',
  'content/sns-drafts',
  'content/gmb-drafts',
  'content/gmb-reviews',
  'content/emergency-drafts',
  'content/lineworks-requests',
  'schemas/media-job.schema.json',
  'config/media-gate.json',
]

export function buildHealthReport() {
  const checks = []

  for (const path of REQUIRED_PATHS) {
    checks.push({ name: path, ok: existsSync(join(ROOT, path)), detail: existsSync(join(ROOT, path)) ? 'ok' : '存在しません' })
  }

  const config = loadGateConfig()
  checks.push({ name: 'gate config 読込', ok: config !== null, detail: config ? 'ok' : '読込不可 (全て human_gate に倒れます)' })

  if (config) {
    const enabledFlags = Object.entries(config.flags ?? {}).filter(([, v]) => v === true).map(([k]) => k)
    checks.push({
      name: '自動実行フラグ',
      ok: true,
      detail: enabledFlags.length === 0 ? '全てOFF (全外部送信がHuman Gate)' : `ON: ${enabledFlags.join(', ')}`,
    })
  }

  const jobs = listJobs()
  let invalid = 0
  for (const job of jobs) {
    if (validateJob(job, { config }).errors.length > 0) invalid++
  }
  checks.push({ name: 'queue整合性', ok: invalid === 0, detail: invalid === 0 ? `${jobs.length} 件すべて valid` : `${invalid} 件が invalid` })

  return { ok: checks.every((c) => c.ok), checks }
}

function main() {
  const { ok, checks } = buildHealthReport()
  console.log(ok ? '✅ media health: OK' : '❌ media health: NG')
  for (const check of checks) {
    console.log(`   ${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}`)
  }
  console.log('   外部通信は行っていません。')
  if (!ok) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
