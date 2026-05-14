#!/usr/bin/env node
// setup-launchd-mwf.mjs
// macOS launchd を使って ops:mwf を月水金 08:30 に自動実行するセットアップスクリプト。
// Human が手動で実行する。AI が自動実行してはならない。
//
// 使い方:
//   npm run ops:mwf:install    — launchd に登録（月水金 08:30 自動実行）
//   npm run ops:mwf:uninstall  — launchd から解除
//   npm run ops:mwf:status     — 登録状態を確認

import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const HOME      = homedir()

const LABEL           = 'com.mitani.aisoukai-media-ops-mwf'
const PLIST_PATH      = join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`)
const LOG_DIR         = join(ROOT, 'logs')
const LOG_PATH        = join(LOG_DIR, 'ops-mwf.log')
const ERROR_LOG_PATH  = join(LOG_DIR, 'ops-mwf-error.log')
const NODE_BIN        = process.execPath   // /usr/local/bin/node など
const SCRIPT_PATH     = join(ROOT, 'scripts', 'ops-mwf.mjs')

// plist 生成（StartCalendarInterval: 月=1, 水=3, 金=5 / 08:30 ローカル時刻）
function generatePlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${SCRIPT_PATH}</string>
    <string>--force</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${ROOT}</string>

  <key>StartCalendarInterval</key>
  <array>
    <dict>
      <key>Weekday</key><integer>1</integer>
      <key>Hour</key><integer>8</integer>
      <key>Minute</key><integer>30</integer>
    </dict>
    <dict>
      <key>Weekday</key><integer>3</integer>
      <key>Hour</key><integer>8</integer>
      <key>Minute</key><integer>30</integer>
    </dict>
    <dict>
      <key>Weekday</key><integer>5</integer>
      <key>Hour</key><integer>8</integer>
      <key>Minute</key><integer>30</integer>
    </dict>
  </array>

  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>

  <key>StandardErrorPath</key>
  <string>${ERROR_LOG_PATH}</string>
</dict>
</plist>
`
}

function runLaunchctl(args) {
  const result = spawnSync('launchctl', args, { stdio: 'pipe', encoding: 'utf8' })
  return {
    ok:     result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

const BAR = '━'.repeat(56)

function install() {
  console.log()
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
    console.log(`  📁 logs/ を作成しました`)
  }

  const alreadyLoaded = runLaunchctl(['list', LABEL])
  if (alreadyLoaded.ok) {
    console.log('  既存の launchd ジョブをアンロード中...')
    runLaunchctl(['unload', PLIST_PATH])
  }

  writeFileSync(PLIST_PATH, generatePlist(), 'utf8')
  console.log(`  ✅ plist を生成しました`)
  console.log(`     ${PLIST_PATH}`)

  const res = runLaunchctl(['load', PLIST_PATH])
  if (!res.ok) {
    console.error(`  ❌ launchctl load に失敗しました`)
    if (res.stderr) console.error(`     ${res.stderr}`)
    process.exit(1)
  }

  console.log('  ✅ launchd に登録しました')
  console.log()
  console.log('  スケジュール: 月・水・金 08:30（Mac システム時刻）')
  console.log(`  ログ     : ${LOG_PATH}`)
  console.log(`  エラーログ: ${ERROR_LOG_PATH}`)
  console.log()
  console.log('  状態確認 : npm run ops:mwf:status')
  console.log('  解除     : npm run ops:mwf:uninstall')
}

function uninstall() {
  console.log()
  if (!existsSync(PLIST_PATH)) {
    console.log('  plist が存在しません。すでにアンインストール済みです。')
    return
  }

  const res = runLaunchctl(['unload', PLIST_PATH])
  if (!res.ok && !res.stderr.includes('Could not find')) {
    console.warn(`  ⚠️  launchctl unload: ${res.stderr}`)
  }

  unlinkSync(PLIST_PATH)
  console.log(`  ✅ アンインストール完了`)
  console.log(`     削除: ${PLIST_PATH}`)
}

function status() {
  console.log()
  const exists = existsSync(PLIST_PATH)
  console.log(`  plist   : ${exists ? `✅ ${PLIST_PATH}` : '❌ 未インストール'}`)

  if (!exists) {
    console.log()
    console.log('  インストール: npm run ops:mwf:install')
    return
  }

  const res = runLaunchctl(['list', LABEL])
  if (!res.ok) {
    console.log('  launchd : ❌ 未登録（plist は存在するが load されていない可能性あり）')
    console.log()
    console.log('  再インストール: npm run ops:mwf:install')
    return
  }

  console.log('  launchd : ✅ 登録済み')
  console.log()
  console.log('  次回実行:')
  console.log('    月曜日 08:30')
  console.log('    水曜日 08:30')
  console.log('    金曜日 08:30')
  console.log()
  console.log(`  ログ     : ${LOG_PATH}`)
  console.log(`  エラーログ: ${ERROR_LOG_PATH}`)
  console.log()
  console.log('  解除: npm run ops:mwf:uninstall')
}

// ── メイン ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

console.log(BAR)
console.log('  ops:mwf launchd セットアップ')
console.log(BAR)

if (args.includes('--install')) {
  install()
} else if (args.includes('--uninstall')) {
  uninstall()
} else if (args.includes('--status')) {
  status()
} else {
  console.log()
  console.log('  使い方:')
  console.log('    npm run ops:mwf:install    — launchd に登録（月水金 08:30 自動実行）')
  console.log('    npm run ops:mwf:uninstall  — launchd から解除')
  console.log('    npm run ops:mwf:status     — 登録状態を確認')
}

console.log(BAR)
