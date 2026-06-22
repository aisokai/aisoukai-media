#!/usr/bin/env node
// ops-mwf.mjs
// 月水金の定期運用チェック CLI。Human がトリガーする。AI が自動実行してはならない。
// 以下を順に実行する（approve/publish/request:draft 自動実行なし）:
//   1. status:content  2. telegram:requests --apply  3. request:list
//   4. article:scheduled  5. notify:posting-reminder  6. notify:requests
//   7. notify:pending-review
// 月水金以外は警告して終了。--force で曜日に関わらず実行できる。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
const noGenerate = cliArgs.includes('--no-generate')
const autoPublish = cliArgs.includes('--auto-publish')

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
  return result.status ?? (result.error ? 1 : 0)
}

function readJsonIfExists(path) {
  if (!path || !existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return { ok: false, generated: false, published: false, reasons: [`結果JSONの読み込みに失敗: ${error.message}`] }
  }
}

async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text }),
  })
  const json = await res.json()
  if (!json.ok) {
    throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
  }
  return json
}

function buildOpsResultNotification({
  generateDecision,
  scheduledResult,
  autoPublish,
  liveBeforeSlugs,
  liveAfterSlugs,
  reviewCount,
  requestedCount,
}) {
  const lines = ['📣 定期更新結果']

  if (!generateDecision.ok) {
    lines.push('⚠️ 新規公開なし')
    lines.push(`理由: ${generateDecision.reason}`)
  } else if (!scheduledResult) {
    lines.push('⚠️ 新規公開なし')
    lines.push('理由: 定期記事生成の結果を確認できませんでした')
  } else if (scheduledResult.generated && scheduledResult.published) {
    const slug = scheduledResult.slug ?? ''
    const newLive = slug && liveAfterSlugs.has(slug) && !liveBeforeSlugs.has(slug)
    lines.push(newLive ? '✅ 新規記事を1件公開扱いにしました' : '✅ 記事は公開扱いです')
    if (scheduledResult.title) lines.push(`記事: ${scheduledResult.title}`)
    if (slug) lines.push(`slug: ${slug}`)
    if (scheduledResult.publishAt) lines.push(`publish_at: ${scheduledResult.publishAt}`)
  } else if (scheduledResult.generated) {
    lines.push('⚠️ 記事は保存しましたが、公開扱いではありません')
    if (scheduledResult.title) lines.push(`記事: ${scheduledResult.title}`)
    if (scheduledResult.slug) lines.push(`slug: ${scheduledResult.slug}`)
    for (const reason of (scheduledResult.reasons ?? []).slice(0, 5)) {
      lines.push(`理由: ${reason}`)
    }
    if (!autoPublish) {
      lines.push('補足: --auto-publish なしのため、Human review または Auto Publish Policy 通過までは公開されません')
    }
  } else {
    lines.push('⚠️ 新規公開なし')
    for (const reason of (scheduledResult.reasons ?? ['定期記事が作成されませんでした']).slice(0, 5)) {
      lines.push(`理由: ${reason}`)
    }
  }

  lines.push(`公開中: ${liveAfterSlugs.size}件 / review待ち: ${reviewCount}件 / 未処理リクエスト: ${requestedCount}件`)
  return lines.join('\n')
}

async function sendOpsResultTelegram(text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId   = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.warn('  ⚠️ 定期更新結果 Telegram 通知をスキップします（環境変数未設定）')
    return false
  }

  await sendTelegram(botToken, chatId, text)
  console.log('  ✅ 定期更新結果 Telegram 通知を送信しました')
  return true
}

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function shouldGenerateScheduledArticle() {
  if (noGenerate) {
    return { ok: false, reason: '--no-generate 指定のため記事生成をスキップ' }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: 'ANTHROPIC_API_KEY 未設定のため記事生成をスキップ' }
  }

  const status = loadContentStatus(POSTS_DIR)
  const reviewCount = status.pending.length + status.pendingFuture.length
  if (reviewCount > 0) {
    return {
      ok: false,
      reason: `review待ちが ${reviewCount}件あるため、新規記事生成をスキップ`,
    }
  }

  return { ok: true }
}

loadEnv()

// ── ヘッダー ──────────────────────────────────
console.log(WIDE)
const jstStr = nowJst.toISOString().slice(0, 16).replace('T', ' ')
console.log(`  ops:mwf — 月水金 定期運用チェック`)
console.log(`  ${jstStr} JST  (${dayName}曜日)`)
console.log(`  記事生成: ${noGenerate ? '無効' : autoPublish ? '有効（auto-publish）' : '有効（draft）'}`)
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

const liveBeforeSlugs = new Set(loadContentStatus(POSTS_DIR).live.map((item) => item.slug))
let scheduledResult = null

// ── ステップ実行 ──────────────────────────────

header('1/7  コンテンツ状態確認 (status:content)')
run('status-content.mjs')

header('2/7  Telegram リクエスト受信・保存 (telegram:requests --apply)')
run('telegram-fetch-requests.mjs', ['--apply'])

header('3/7  記事リクエスト一覧 (request:list)')
run('list-article-requests.mjs')

header(`4/7  定期記事生成 (${autoPublish ? 'article:scheduled --auto-publish' : 'article:scheduled'})`)
const generateDecision = shouldGenerateScheduledArticle()
let generatedArticle = false
if (!generateDecision.ok) {
  console.log(`  ⏭ ${generateDecision.reason}`)
} else {
  const args = autoPublish ? ['--auto-publish'] : []
  const resultPath = join(tmpdir(), `aisoukai-scheduled-result-${process.pid}.json`)
  args.push('--no-notify', '--result-json', resultPath)
  const status = run('scheduled-article-flow.mjs', args)
  scheduledResult = readJsonIfExists(resultPath)
  generatedArticle = scheduledResult?.generated === true
  if (status !== 0 && !generatedArticle) {
    const reason = scheduledResult?.reasons?.[0] ?? `scheduled-article-flow.mjs が exit ${status} で停止`
    console.log(`  ⏭ ${reason}`)
  } else if (status !== 0) {
    console.log('  ⚠️ 定期記事生成は完了しませんでした。後続の通知は継続します。')
  }
}

header('5/7  投稿確認リマインド送信 (notify:posting-reminder)')
// --force を渡してステップ内での曜日スキップを回避する
run('notify-posting-reminder.mjs', ['--force'])

header('6/7  リクエスト状態通知 (notify:requests)')
run('notify-requests.mjs')

header('7/7  pending-review 通知 (notify:pending-review)')
run('notify-pending-review.mjs')

// ── フッター ──────────────────────────────────
const contentStatus = loadContentStatus(POSTS_DIR)
const requestStore = loadRequestStore(REQUESTS_PATH)
const requestedCount = (requestStore.requests ?? []).filter((r) => r.status === 'requested').length
const reviewCount = contentStatus.pending.length + contentStatus.pendingFuture.length
const liveAfterSlugs = new Set(contentStatus.live.map((item) => item.slug))

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
  if (generatedArticle) {
    console.log('  ③ 新規下書きを確認してください')
  } else {
    console.log('  ③ 追加の処理はありません')
  }
} else {
  console.log('  ③ 承認後に build を確認')
  console.log('      npm run build')
}
console.log(WIDE)
console.log()

const opsResultText = buildOpsResultNotification({
  generateDecision,
  scheduledResult,
  autoPublish,
  liveBeforeSlugs,
  liveAfterSlugs,
  reviewCount,
  requestedCount,
})

console.log('  定期更新結果通知:')
console.log(opsResultText.split('\n').map((line) => `  ${line}`).join('\n'))
try {
  await sendOpsResultTelegram(opsResultText)
} catch (error) {
  console.error(`  ❌ 定期更新結果 Telegram 送信失敗: ${error.message}`)
  process.exitCode = 1
}
