#!/usr/bin/env node
// notify-posting-reminder.mjs
// 月水金に Telegram へ投稿確認リマインドを送る CLI。
// Human がトリガーする。AI が自動実行してはならない。
// --force で曜日に関係なく送信できる。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

// 月=1, 火=2, 水=3, 木=4, 金=5, 土=6, 日=0 (JST)
const SEND_DAYS     = new Set([1, 3, 5])
const DAY_NAMES_JA  = ['日', '月', '火', '水', '木', '金', '土']

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function toDateStr(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

function getContentStatus() {
  if (!existsSync(POSTS_DIR)) {
    return { live: [], scheduled: [], pending: [], pendingFuture: [], rejected: [] }
  }
  const today = new Date().toISOString().slice(0, 10)
  const live = []; const scheduled = []; const pending = []
  const pendingFuture = []; const rejected = []

  for (const f of readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))) {
    const { data } = matter(readFileSync(join(POSTS_DIR, f), 'utf8'))
    const publishAt  = data.publish_at ? toDateStr(data.publish_at) : toDateStr(data.date)
    const isFuture   = publishAt > today
    const reviewed   = data.reviewed === true
    const draft      = data.draft === true
    const hasReject  = !!data.rejection_reason
    const entry      = {
      title: String(data.title ?? '（タイトル未設定）').slice(0, 40),
      publishAt,
      isFuture,
    }
    if (reviewed) {
      if (!draft && !isFuture) live.push(entry)
      else if (isFuture)       scheduled.push(entry)
    } else {
      if (hasReject)           rejected.push(entry)
      else if (isFuture)       pendingFuture.push(entry)
      else                     pending.push(entry)
    }
  }
  return { live, scheduled, pending, pendingFuture, rejected }
}

function buildReminderText(status, dashboardUrl, dayName) {
  const { live, scheduled, pending, pendingFuture, rejected } = status
  const lines = []

  lines.push(`📅 ${dayName}曜日の投稿確認リマインド`)
  lines.push('')
  lines.push('── コンテンツ状態 ──')
  lines.push(`✅ 公開中:            ${live.length}件`)
  lines.push(`📅 公開予定(reviewed): ${scheduled.length}件`)
  lines.push(`📝 review待ち:         ${pending.length}件`)
  lines.push(`📅 review待ち(future): ${pendingFuture.length}件`)
  lines.push(`🚫 差し戻し済み:       ${rejected.length}件`)

  if (pending.length > 0) {
    lines.push('')
    lines.push('── 今すぐ approve 可能 ──')
    for (const [i, p] of pending.slice(0, 5).entries()) {
      lines.push(`${i + 1}. ${p.title}`)
    }
    if (pending.length > 5) lines.push(`  ...他 ${pending.length - 5} 件`)
  }

  if (scheduled.length > 0) {
    lines.push('')
    lines.push('── 公開予定 ──')
    for (const p of scheduled.slice(0, 3)) {
      lines.push(`  📅 [${p.publishAt}] ${p.title}`)
    }
  }

  lines.push('')
  lines.push('── 次のアクション ──')
  if (pending.length > 0) {
    lines.push('  1. 本文確認 → approve:post で承認')
  }
  if (live.length > 0 || scheduled.length > 0) {
    lines.push('  2. build → git push でデプロイ')
  }
  if (pending.length === 0) {
    lines.push('  review待ちはありません。新規記事を生成または resubmit してください。')
  }

  lines.push('')
  lines.push(`管理画面: ${dashboardUrl}`)
  return lines.join('\n')
}

async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
  return json
}

async function main() {
  loadEnv()

  const args    = process.argv.slice(2)
  const force   = args.includes('--force')

  // JST の曜日判定
  const nowJst  = new Date(Date.now() + 9 * 3600 * 1000)
  const dayOfWeek = nowJst.getUTCDay()          // 0=日 〜 6=土
  const dayName   = DAY_NAMES_JA[dayOfWeek]
  const isSendDay = SEND_DAYS.has(dayOfWeek)

  const BAR = '━'.repeat(52)
  console.log(BAR)
  console.log('投稿確認リマインド')
  console.log(BAR)
  console.log(`  曜日: ${dayName}曜日`)

  if (!isSendDay && !force) {
    console.log(`  スキップ: 月・水・金以外は送信しません`)
    console.log(`  --force をつけると曜日に関わらず送信できます`)
    console.log(BAR)
    process.exit(0)
  }

  if (force && !isSendDay) {
    console.log('  --force 指定のため曜日に関わらず送信します')
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin/pending-review`
    : 'https://aisoukai-media.vercel.app/admin/pending-review'

  const status  = getContentStatus()
  const text    = buildReminderText(status, dashboardUrl, dayName)

  console.log()
  console.log(text)
  console.log()
  console.log(BAR)

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId   = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.warn()
    console.warn('⚠️  Telegram 通知をスキップします（環境変数未設定）')
    if (!botToken) console.warn('   TELEGRAM_BOT_TOKEN が未設定です')
    if (!chatId)   console.warn('   TELEGRAM_CHAT_ID が未設定です')
    return
  }

  try {
    await sendTelegram(botToken, chatId, text)
    console.log()
    console.log('✅ Telegram 送信成功')
  } catch (err) {
    console.error()
    console.error(`❌ Telegram 送信失敗: ${err.message}`)
    process.exit(1)
  }
}

main()
