# launchd 月水金 ops:mwf 自動化 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** macOS launchd を使って `npm run ops:mwf` を月・水・金 08:30 に自動実行し、実行ログを `logs/` に残す。

**Architecture:** `scripts/setup-launchd-mwf.mjs` 1ファイルが `--install / --uninstall / --status` の3モードを持ち、plist を動的生成して `~/Library/LaunchAgents/` に配置する。plist は Node の実行パス・プロジェクトパスを実行時に解決するため移植性がある。`ops-mwf.mjs` は `--force` フラグ付きで起動するため曜日チェックをスキップする。

**Tech Stack:** Node.js (ESM), macOS launchd (`StartCalendarInterval`), `spawnSync` (launchctl呼び出し)

---

## ファイル構成

| 操作 | ファイル |
|---|---|
| Create | `scripts/setup-launchd-mwf.mjs` |
| Modify | `package.json`（scripts 追記） |
| Modify | `README.md`（launchd セクション追記・cron未実装表記の更新） |

---

### Task 1: `setup-launchd-mwf.mjs` を実装する

**Files:**
- Create: `scripts/setup-launchd-mwf.mjs`

- [ ] **Step 1: ファイルを新規作成**

```javascript
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
```

- [ ] **Step 2: 構文確認**

```bash
node --check scripts/setup-launchd-mwf.mjs
```

Expected: 出力なし（エラーなし）

- [ ] **Step 3: ヘルプ表示を確認**

```bash
node scripts/setup-launchd-mwf.mjs
```

Expected: `使い方:` から始まる3行が表示される

- [ ] **Step 4: commit**

```bash
git add scripts/setup-launchd-mwf.mjs
git commit -m "feat(launchd): ops:mwf 月水金 08:30 自動実行セットアップスクリプトを追加"
```

---

### Task 2: package.json に npm scripts を追加する

**Files:**
- Modify: `package.json`

- [ ] **Step 1: scripts ブロック末尾（最後のエントリの直後）に3行を追加**

追加するエントリ（既存の末尾エントリ後にカンマ区切りで追加）:

```json
    "ops:mwf:install": "node scripts/setup-launchd-mwf.mjs --install",
    "ops:mwf:uninstall": "node scripts/setup-launchd-mwf.mjs --uninstall",
    "ops:mwf:status": "node scripts/setup-launchd-mwf.mjs --status"
```

- [ ] **Step 2: JSON syntax 確認**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" && echo "JSON valid"
```

Expected: `JSON valid`

- [ ] **Step 3: npm script として実行できることを確認（未インストール状態）**

```bash
npm run ops:mwf:status
```

Expected: `plist: ❌ 未インストール` 相当の出力

- [ ] **Step 4: commit**

```bash
git add package.json
git commit -m "feat(launchd): ops:mwf:install / uninstall / status npm scripts を追加"
```

---

### Task 3: `npm run ops:mwf:install` を実行して launchd に登録する

**Files:**
- 生成: `~/Library/LaunchAgents/com.mitani.aisoukai-media-ops-mwf.plist`

- [ ] **Step 1: install を実行**

```bash
npm run ops:mwf:install
```

Expected: `✅ launchd に登録しました` が表示され、エラーなし

- [ ] **Step 2: status で確認**

```bash
npm run ops:mwf:status
```

Expected: `launchd : ✅ 登録済み` と次回実行スケジュール（月・水・金 08:30）が表示される

- [ ] **Step 3: plist 内容を目視確認**

```bash
cat ~/Library/LaunchAgents/com.mitani.aisoukai-media-ops-mwf.plist
```

Expected: `NODE_BIN` が `/usr/local/bin/node`、`SCRIPT_PATH` が絶対パス、`WorkingDirectory` が `/Users/mitaniFDC/Desktop/aisoukai-media` であること

---

### Task 4: README に launchd 自動化セクションを追記する

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 「月水金 定期運用（`ops:mwf`）」セクション末尾（`> \`approve / publish...` 段落直後）に以下を挿入**

```markdown

#### launchd による自動実行（macOS）

Mac の launchd を使って月・水・金 08:30 に自動実行できる。

```bash
npm run ops:mwf:install    # launchd に登録（初回のみ）
npm run ops:mwf:status     # 登録状態・次回実行を確認
npm run ops:mwf:uninstall  # 解除
```

- plist: `~/Library/LaunchAgents/com.mitani.aisoukai-media-ops-mwf.plist`
- ログ: `logs/ops-mwf.log` / `logs/ops-mwf-error.log`
- 内部では `--force` フラグで `ops:mwf.mjs` を直接起動する
- Mac がスリープ中は実行されない（起動後に次の実行時刻まで待機）
```

- [ ] **Step 2: 334行目付近「cron 化は未実装（手動実行）」を更新**

変更前:
```
通知内容: 公開中/予定/review待ちのサマリー + 管理画面URL。cron 化は未実装（手動実行）。
```

変更後:
```
通知内容: 公開中/予定/review待ちのサマリー + 管理画面URL。launchd による自動実行に対応（`npm run ops:mwf:install`）。
```

- [ ] **Step 3: 348行目付近「cron 化は未実装」を更新**

変更前:
```
- cron 化は未実装。手動で定期的に実行する
```

変更後:
```
- launchd 自動化対応: `npm run ops:mwf:install` で月水金 08:30 に自動実行できる
```

- [ ] **Step 4: commit**

```bash
git add README.md
git commit -m "docs: launchd 月水金自動実行セットアップ手順を README に追記"
```

---

### Task 5: 最終確認 — validate:posts / build

- [ ] **Step 1: validate:posts を実行**

```bash
npm run validate:posts
```

Expected: エラーなし

- [ ] **Step 2: build を実行**

```bash
npm run build
```

Expected: エラーなし（Route テーブル出力）

- [ ] **Step 3: git status を確認**

```bash
git status --short --branch
git log --oneline -5
```

Expected: ワーキングツリーがクリーン

---

## 自己レビュー

| 要件 | 対応タスク |
|---|---|
| `scripts/setup-launchd-mwf.mjs` を追加 | Task 1 |
| launchd plist を生成 | Task 1 (generatePlist) |
| 月水金 08:30 に実行 | Task 1 (StartCalendarInterval Weekday 1/3/5, Hour 8, Minute 30) |
| `ops:mwf` 実行（--force でlaunchd対応） | Task 1 (node + ops-mwf.mjs --force) |
| logs/ops-mwf.log | Task 1 (StandardOutPath) |
| logs/ops-mwf-error.log | Task 1 (StandardErrorPath) |
| ops:mwf:install / uninstall / status | Task 2 |
| npm run ops:mwf:install / status 実行 | Task 3 |
| README に月水金自動運用の説明を追記 | Task 4 |
| validate:posts / build 確認 | Task 5 |
