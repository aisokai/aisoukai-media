#!/usr/bin/env node
// telegram-fetch-requests.mjs
// Telegram Bot の受信メッセージから記事リクエストらしいものを取得する CLI。
// Human がトリガーする。AI が自動実行してはならない。
// approve / publish / push 系メッセージは無視する。
// デフォルト: dry-run（console表示のみ）
// --apply:  data/article-requests.json に保存する
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyTelegramMessage } from './telegram-request-routing.mjs'

const __dirname   = dirname(fileURLToPath(import.meta.url))
const ROOT        = join(__dirname, '..')
const REQUESTS_PATH = join(ROOT, 'data', 'article-requests.json')

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function getJstTimestamp() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().replace('Z', '+09:00')
}

function loadRequests() {
  if (!existsSync(REQUESTS_PATH)) {
    return { last_update_id: 0, requests: [] }
  }
  try {
    return JSON.parse(readFileSync(REQUESTS_PATH, 'utf8'))
  } catch {
    return { last_update_id: 0, requests: [] }
  }
}

async function fetchUpdates(botToken, offset) {
  const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&limit=100&timeout=5`
  const res  = await fetch(url)
  const json = await res.json()
  if (!json.ok) throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
  return json.result ?? []
}

async function main() {
  loadEnv()

  const args  = process.argv.slice(2)
  const apply = args.includes('--apply')

  const BAR = '━'.repeat(52)
  console.log(BAR)
  console.log(`Telegram 記事リクエスト受信  (${apply ? '保存モード --apply' : 'dry-run'})`)
  console.log(BAR)

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId   = process.env.TELEGRAM_CHAT_ID

  if (!botToken) {
    console.error('エラー: TELEGRAM_BOT_TOKEN が未設定です')
    process.exit(1)
  }

  const store    = loadRequests()
  const offset   = (store.last_update_id ?? 0) + 1
  const knownIds = new Set(store.requests.map((r) => r.update_id))

  console.log(`  既存リクエスト数  : ${store.requests.length} 件`)
  console.log(`  取得開始 offset   : ${offset}`)
  console.log()

  let updates
  try {
    updates = await fetchUpdates(botToken, offset)
  } catch (err) {
    console.error(`❌ 取得失敗: ${err.message}`)
    process.exit(1)
  }

  console.log(`  取得した update 数: ${updates.length} 件`)

  const newRequests = []
  let maxUpdateId   = store.last_update_id ?? 0

  for (const upd of updates) {
    maxUpdateId = Math.max(maxUpdateId, upd.update_id)

    const msg  = upd.message ?? upd.channel_post
    if (!msg?.text) continue
    if (chatId && String(msg.chat?.id) !== String(chatId) && String(msg.from?.id) !== String(chatId)) continue
    if (knownIds.has(upd.update_id)) continue
    const parsed = classifyTelegramMessage(msg.text)
    if (parsed.type !== 'request') {
      const reason = parsed.type === 'skip'
        ? parsed.reason
        : parsed.type === 'approve'
          ? 'approve コマンドのため除外（Telegram からの approve 禁止）'
          : parsed.type === 'reject'
            ? 'reject コマンドのため除外'
            : parsed.type === 'jp_approve'
              ? '承認コマンドのため除外'
              : parsed.type === 'jp_reject'
                ? '差し戻しコマンドのため除外'
                : '記事リクエスト以外のため除外'
      console.log(`  ⏭ スキップ [${upd.update_id}]: "${msg.text.slice(0, 35)}"`)
      console.log(`           理由: ${reason}`)
      continue
    }

    const entry = {
      update_id:   upd.update_id,
      message_id:  msg.message_id,
      from:        msg.from?.username ?? msg.from?.first_name ?? '(unknown)',
      text:        msg.text.trim(),
      date_unix:   msg.date,
      received_at: getJstTimestamp(),
      status:      'requested',
    }
    newRequests.push(entry)
    console.log(`  📥 新規リクエスト [${upd.update_id}]: "${msg.text.slice(0, 50)}"`)
  }

  if (newRequests.length === 0) {
    console.log()
    console.log('  新しい記事リクエストはありませんでした')
  }

  console.log()
  console.log(BAR)
  console.log(`  新規リクエスト: ${newRequests.length} 件`)

  if (!apply) {
    console.log()
    console.log('dry-run モードのため保存しません。')
    console.log('保存するには: npm run telegram:requests -- --apply')
    return
  }

  if (newRequests.length > 0 || maxUpdateId > (store.last_update_id ?? 0)) {
    store.last_update_id = maxUpdateId
    store.requests       = [...store.requests, ...newRequests]
    writeFileSync(REQUESTS_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8')
    console.log()
    console.log(`✅ 保存しました: data/article-requests.json`)
    console.log(`   合計: ${store.requests.length} 件 / last_update_id: ${maxUpdateId}`)
  } else {
    console.log()
    console.log('新規リクエストなし・保存をスキップしました')
  }
}

main()
