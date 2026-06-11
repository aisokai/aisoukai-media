#!/usr/bin/env node
// setup-launchd-media.mjs (Phase 7)
// Media Automation の常駐ジョブを launchd に登録する。Human が手動で実行する。
//
// 安全設計:
//   - デフォルト install は read-only / dry-run / ローカル生成のみ。
//     **--apply / --notify / 送信系コマンドはデフォルトjobに一切含まれない。**
//   - apply/notify系job (executor --apply / digest送信 / health --notify) は
//     `--install-apply` という別オプションでのみ登録でき、さらに
//     config/media-gate.json の launchd_apply_jobs flag (初期OFF) がONでなければ拒否される。
//
// 使い方:
//   npm run media:launchd:install          — 安全job (read-only/dry-run) のみ登録
//   npm run media:launchd:install-apply    — apply/notify系job登録 (flag ON必須・先生のみ)
//   npm run media:launchd:uninstall        — 全job解除
//   npm run media:launchd:status           — 状態確認

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const HOME = homedir()
const PLIST_DIR = join(HOME, 'Library', 'LaunchAgents')
const LOG_DIR = join(ROOT, 'logs')

// デフォルト登録job: read-only / dry-run / ローカル生成のみ。送信なし。
export const DEFAULT_JOBS = Object.freeze([
  {
    label: 'com.mitani.aisoukai-media-watcher',
    command: 'node scripts/gmb-review-watcher.mjs --source api',
    schedule: { type: 'calendar', hour: 8, minute: 0 },
    log: 'media-watcher',
    note: '口コミ取得・返信案生成 (読み取り専用。返信・投稿はしない)',
  },
  {
    label: 'com.mitani.aisoukai-media-executor-dryrun',
    command: 'node scripts/media-executor.mjs',
    schedule: { type: 'interval', seconds: 900 },
    log: 'media-executor',
    note: '自動実行候補のdry-run表示のみ (送信しない)',
  },
  {
    label: 'com.mitani.aisoukai-media-notify-digest',
    command: 'node scripts/notify-media-pending.mjs',
    schedule: { type: 'calendar', hour: 8, minute: 30 },
    log: 'media-notify',
    note: '承認待ちdigestのconsole出力のみ (送信しない)',
  },
  {
    label: 'com.mitani.aisoukai-media-export',
    command: 'node scripts/export-obsidian.mjs && node scripts/export-status-json.mjs && node scripts/rotate-media-logs.mjs',
    schedule: { type: 'calendar', hour: 21, minute: 0 },
    log: 'media-export',
    note: 'Obsidian記録 + status JSON + ログローテ (ローカルのみ)',
  },
  {
    label: 'com.mitani.aisoukai-media-health',
    command: 'node scripts/media-health.mjs',
    schedule: { type: 'calendar', hour: 7, minute: 50 },
    log: 'media-health',
    note: 'health check (通知なし。NG時はログのみ)',
  },
])

// apply/notify系job: --install-apply + launchd_apply_jobs flag ON でのみ登録できる。
export const APPLY_JOBS = Object.freeze([
  {
    label: 'com.mitani.aisoukai-media-executor-apply',
    command: 'node scripts/media-executor.mjs --apply',
    schedule: { type: 'interval', seconds: 900 },
    log: 'media-executor-apply',
    note: '自動実行 (auto系フラグON時のみ実動作)',
  },
  {
    label: 'com.mitani.aisoukai-media-notify-apply',
    command: 'node scripts/notify-media-pending.mjs --apply',
    schedule: { type: 'calendar', hour: 8, minute: 30 },
    log: 'media-notify-apply',
    note: '承認待ちdigest送信 (telegram_notify flag ON時のみ実送信)',
  },
  {
    label: 'com.mitani.aisoukai-media-health-notify',
    command: 'node scripts/media-health.mjs --notify',
    schedule: { type: 'calendar', hour: 7, minute: 50 },
    log: 'media-health-notify',
    note: 'health NG時のTelegram警告 (health_notify flag ON時のみ実送信)',
  },
])

export function generatePlist(job, root = ROOT) {
  const scheduleXml = job.schedule.type === 'interval'
    ? `  <key>StartInterval</key>\n  <integer>${job.schedule.seconds}</integer>`
    : `  <key>StartCalendarInterval</key>\n  <dict>\n    <key>Hour</key><integer>${job.schedule.hour}</integer>\n    <key>Minute</key><integer>${job.schedule.minute}</integer>\n  </dict>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${job.label}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd ${root} && ${job.command}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${root}</string>

${scheduleXml}

  <key>RunAtLoad</key>
  <false/>

  <key>StandardOutPath</key>
  <string>${join(LOG_DIR, `${job.log}.log`)}</string>

  <key>StandardErrorPath</key>
  <string>${join(LOG_DIR, `${job.log}-error.log`)}</string>
</dict>
</plist>
`
}

function runLaunchctl(args) {
  const result = spawnSync('launchctl', args, { stdio: 'pipe', encoding: 'utf8' })
  return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() }
}

const domain = () => `gui/${process.getuid()}`
const plistPath = (job) => join(PLIST_DIR, `${job.label}.plist`)
const BAR = '━'.repeat(56)
const ALL_JOBS = [...DEFAULT_JOBS, ...APPLY_JOBS]

function installJobs(jobs) {
  mkdirSync(LOG_DIR, { recursive: true })
  mkdirSync(PLIST_DIR, { recursive: true })
  for (const job of jobs) {
    if (runLaunchctl(['print', `${domain()}/${job.label}`]).ok) {
      runLaunchctl(['bootout', domain(), plistPath(job)])
    }
    writeFileSync(plistPath(job), generatePlist(job), 'utf8')
    const res = runLaunchctl(['bootstrap', domain(), plistPath(job)])
    console.log(`  ${res.ok ? '✅' : '❌'} ${job.label}`)
    console.log(`     ${job.note}`)
    if (!res.ok && res.stderr) console.error(`     ${res.stderr}`)
  }
}

function install() {
  console.log('  デフォルトjob (read-only / dry-run / ローカル生成のみ) を登録します。')
  console.log('  apply / notify / 送信系はデフォルトでは登録されません。')
  installJobs(DEFAULT_JOBS)
  console.log()
  console.log('  apply/notify系の登録 (先生のみ): launchd_apply_jobs flag をONにして media:launchd:install-apply')
  console.log('  緊急停止: npm run media:launchd:uninstall + config/media-gate.json 全フラグOFF')
}

function installApply() {
  let config = null
  try {
    config = JSON.parse(readFileSync(join(ROOT, 'config', 'media-gate.json'), 'utf8'))
  } catch { /* configなしは下のチェックで拒否される */ }
  if (config?.flags?.launchd_apply_jobs !== true) {
    console.error('  ⛔ launchd_apply_jobs flag がOFFのため apply/notify系jobは登録できません。')
    console.error('     config/media-gate.json の launchd_apply_jobs を先生がONにしてから再実行してください。')
    process.exit(1)
  }
  console.log('  ⚠️ apply/notify系jobを登録します (実送信は各フラグのON状態に従います)')
  installJobs(APPLY_JOBS)
}

function uninstall() {
  for (const job of ALL_JOBS) {
    if (!existsSync(plistPath(job))) {
      console.log(`  ⏭ ${job.label} (未インストール)`)
      continue
    }
    runLaunchctl(['bootout', domain(), plistPath(job)])
    unlinkSync(plistPath(job))
    console.log(`  ✅ 解除: ${job.label}`)
  }
}

function status() {
  for (const job of ALL_JOBS) {
    const exists = existsSync(plistPath(job))
    if (!exists) {
      console.log(`  ❌ ${job.label}: 未インストール`)
      continue
    }
    const res = runLaunchctl(['print', `${domain()}/${job.label}`])
    const exitMatch = res.stdout.match(/last exit (?:code|status)\s*=\s*(\d+)/i)
    const exitInfo = exitMatch ? `LastExit=${exitMatch[1]}` : 'LastExit=不明'
    console.log(`  ${res.ok ? '✅' : '⚠️ plistあり/未load'} ${job.label} ${res.ok ? `(${exitInfo})` : ''}`)
    const logPath = join(LOG_DIR, `${job.log}.log`)
    if (existsSync(logPath)) {
      console.log(`     最終ログ更新: ${statSync(logPath).mtime.toLocaleString('ja-JP')}`)
    }
    const content = readFileSync(plistPath(job), 'utf8')
    if (!content.includes(ROOT)) console.log(`     ⚠️ plist内のパスが現在のROOTと不一致。再installしてください`)
  }
}

function main() {
  const args = process.argv.slice(2)
  console.log(BAR)
  console.log('  Media Automation launchd セットアップ (Human実行専用)')
  console.log(BAR)
  if (args.includes('--install')) install()
  else if (args.includes('--install-apply')) installApply()
  else if (args.includes('--uninstall')) uninstall()
  else if (args.includes('--status')) status()
  else {
    console.log('  使い方:')
    console.log('    media:launchd:install        — 安全job (read-only/dry-run) のみ登録')
    console.log('    media:launchd:install-apply  — apply/notify系job (launchd_apply_jobs flag ON 必須)')
    console.log('    media:launchd:uninstall / media:launchd:status')
  }
  console.log(BAR)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
