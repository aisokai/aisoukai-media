#!/usr/bin/env node
// ops-mwf.mjs
// 月水金の定期運用チェック CLI。Human がトリガーする。AI が自動実行してはならない。
// 以下を順に実行する（destructive 操作なし / approve/publish/request:draft 自動実行なし）:
//   1. status:content  2. telegram:requests --apply  3. request:list
//   4. notify:posting-reminder  5. notify:requests  6. notify:pending-review
// 月水金以外は警告して終了。--force で曜日に関わらず実行できる。
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadContentStatus } from './lib/content-status.mjs'
import { loadRequestStore } from './lib/request-status.mjs'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
const REQUESTS_PATH = join(ROOT, 'data', 'article-requests.json')
const SEND_DAYS    = new Set([1, 3, 5])       // 月=1, 水=3, 金=5 (JST UTC+9)
const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土']

const cliArgs   = process.argv.slice(2)
const force     = cliArgs.includes('--force')

const nowJst    = new Date(Date.now() + 9 * 3600 * 1000)
const dayOfWeek = nowJst.getUTCDay()
const dayName   = DAY_NAMES_JA[dayOfWeek]
const isSendDay = SEND_DAYS.has(dayOfWeek)

const WIDE = '═'.repeat(60)
const BAR  = '─'.repeat(60)

function header(title) {
  console.log()
  console.log('━'.repeat(60))
  console.log(`  ${title}`)
  console.log('━'.repeat(60))
}

function run(script, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts', script), ...extraArgs],
    { stdio: 'inherit', cwd: ROOT, env: process.env }
  )
  if (result.error) {
    console.error(`  ❌ 実行エラー (${script}): ${result.error.message}`)
  }
  // 子プロセスの exit code が非 0 でも続行（通知失敗等は警告扱い）
}

// ── ヘッダー ──────────────────────────────────
console.log(WIDE)
const jstStr = nowJst.toISOString().slice(0, 16).replace('T', ' ')
console.log(`  ops:mwf — 月水金 定期運用チェック`)
console.log(`  ${jstStr} JST  (${dayName}曜日)`)
console.log(WIDE)

if (!isSendDay && !force) {
  console.log()
  console.log(`  ⚠️  今日は${dayName}曜日です。月・水・金以外は実行しません。`)
  console.log()
  console.log('  月水金以外に実行したい場合は --force をつけてください:')
  console.log('    npm run ops:mwf -- --force')
  console.log()
  process.exit(0)
}

if (force && !isSendDay) {
  console.log()
  console.log(`  ⚠️  --force 指定のため${dayName}曜日ですが実行します`)
}

// ── ステップ実行 ──────────────────────────────

header('1/6  コンテンツ状態確認 (status:content)')
run('status-content.mjs')

header('2/6  Telegram リクエスト受信・保存 (telegram:requests --apply)')
run('telegram-fetch-requests.mjs', ['--apply'])

header('3/6  記事リクエスト一覧 (request:list)')
run('list-article-requests.mjs')

header('4/6  投稿確認リマインド送信 (notify:posting-reminder)')
// --force を渡してステップ内での曜日スキップを回避する
run('notify-posting-reminder.mjs', ['--force'])

header('5/6  リクエスト状態通知 (notify:requests)')
run('notify-requests.mjs')

header('6/6  pending-review 通知 (notify:pending-review)')
run('notify-pending-review.mjs')

// ── フッター ──────────────────────────────────
const contentStatus = loadContentStatus(POSTS_DIR)
const requestStore = loadRequestStore(REQUESTS_PATH)
const requestedCount = (requestStore.requests ?? []).filter((r) => r.status === 'requested').length
const reviewCount = contentStatus.pending.length + contentStatus.pendingFuture.length

console.log()
console.log(WIDE)
console.log('  ops:mwf 完了')
console.log(BAR)
console.log()
console.log('  今やること:')
if (reviewCount > 0) {
  if (contentStatus.pending.length > 0) {
    console.log(`  ① review待ち ${reviewCount}件（今すぐ承認可 ${contentStatus.pending.length}件）`)
    console.log('      npm run approve:post -- <slug> --reviewed-by "氏名"')
  } else {
    console.log(`  ① review待ち ${reviewCount}件（公開日待ち）`)
    console.log('      公開日到来を待ってから approve:post を実行')
  }
} else {
  console.log('  ① review待ちはありません')
}

if (requestedCount > 0) {
  console.log(`  ② 未処理リクエスト ${requestedCount}件`)
  console.log('      npm run request:draft -- <update_id> --category "カテゴリ" --date YYYY-MM-DD --yes')
} else {
  console.log('  ② 未処理リクエストはありません')
}

if (reviewCount === 0 && requestedCount === 0) {
  console.log('  ③ 追加の処理はありません')
} else {
  console.log('  ③ 承認後に build を確認')
  console.log('      npm run build')
}
console.log(WIDE)
console.log()
