#!/usr/bin/env node
// setup-launchd-telegram-ops.mjs
// macOS launchd を使って telegram:ops を 3 分おきに自動実行するセットアップスクリプト。
// Human が手動で実行する。AI が自動実行してはならない。
//
// 使い方:
//   npm run telegram:ops:install    — launchd に登録（3分おきに自動実行）
//   npm run telegram:ops:uninstall  — launchd から解除
//   npm run telegram:ops:status     — 登録状態を確認

import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const HOME      = homedir()
const PLIST_DIR = join(HOME, 'Library', 'LaunchAgents')

const LABEL          = 'com.mitani.aisoukai-media-telegram-ops'
const PLIST_PATH     = join(PLIST_DIR, `${LABEL}.plist`)
const LOG_DIR        = join(ROOT, 'logs')
const LOG_PATH       = join(LOG_DIR, 'telegram-ops.log')
const ERROR_LOG_PATH = join(LOG_DIR, 'telegram-ops-error.log')

function generatePlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd ${ROOT} && npm run telegram:ops -- --apply --build</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${ROOT}</string>

  <key>StartInterval</key>
  <integer>180</integer>

  <key>RunAtLoad</key>
  <true/>

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

function launchdDomain() {
  return `gui/${process.getuid()}`
}

const BAR = '━'.repeat(56)

function install() {
  console.log()
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
    console.log(`  📁 logs/ を作成しました`)
  }
  if (!existsSync(PLIST_DIR)) {
    mkdirSync(PLIST_DIR, { recursive: true })
    console.log(`  📁 LaunchAgents/ を作成しました`)
  }

  const alreadyLoaded = runLaunchctl(['print', `${launchdDomain()}/${LABEL}`])
  if (alreadyLoaded.ok) {
    console.log('  既存の launchd ジョブをアンロード中...')
    runLaunchctl(['bootout', launchdDomain(), PLIST_PATH])
  }

  writeFileSync(PLIST_PATH, generatePlist(), 'utf8')
  console.log(`  ✅ plist を生成しました`)
  console.log(`     ${PLIST_PATH}`)

  const res = runLaunchctl(['bootstrap', launchdDomain(), PLIST_PATH])
  if (!res.ok) {
    console.error(`  ❌ launchctl bootstrap に失敗しました`)
    if (res.stderr) console.error(`     ${res.stderr}`)
    process.exit(1)
  }

  console.log('  ✅ launchd に登録しました')
  console.log()
  console.log('  実行間隔: 3分おき')
  console.log('  実行コマンド:')
  console.log('    cd ~/Desktop/aisoukai-media && npm run telegram:ops -- --apply --build')
  console.log(`  ログ     : ${LOG_PATH}`)
  console.log(`  エラーログ: ${ERROR_LOG_PATH}`)
  console.log()
  console.log('  状態確認 : npm run telegram:ops:status')
  console.log('  解除     : npm run telegram:ops:uninstall')
}

function uninstall() {
  console.log()
  if (!existsSync(PLIST_PATH)) {
    console.log('  plist が存在しません。すでにアンインストール済みです。')
    return
  }

  const res = runLaunchctl(['bootout', launchdDomain(), PLIST_PATH])
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
    console.log('  インストール: npm run telegram:ops:install')
    return
  }

  const res = runLaunchctl(['print', `${launchdDomain()}/${LABEL}`])
  if (!res.ok) {
    console.log('  launchd : ❌ 未登録（plist は存在するが load されていない可能性あり）')
    console.log()
    console.log('  再インストール: npm run telegram:ops:install')
    return
  }

  console.log('  launchd : ✅ 登録済み')
  console.log()
  console.log('  次回実行: 3分以内に再試行')
  console.log()
  console.log(`  ログ     : ${LOG_PATH}`)
  console.log(`  エラーログ: ${ERROR_LOG_PATH}`)
  console.log()
  console.log('  解除: npm run telegram:ops:uninstall')
}

// ── メイン ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

console.log(BAR)
console.log('  telegram:ops launchd セットアップ')
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
  console.log('    npm run telegram:ops:install    — launchd に登録（3分おきに自動実行）')
  console.log('    npm run telegram:ops:uninstall  — launchd から解除')
  console.log('    npm run telegram:ops:status     — 登録状態を確認')
}

console.log(BAR)
