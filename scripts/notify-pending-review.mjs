#!/usr/bin/env node
// notify-pending-review.mjs
// pending review 記事の一覧を console 出力 + Telegram 通知する。
// 通知のみ。approve / reject / publish とは接続しない。
// AI が自動実行してはならない。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

// .env.local を読んで process.env に反映（既存の環境変数は上書きしない）
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

function getPendingPosts() {
  if (!existsSync(POSTS_DIR)) return []

  const today = new Date().toISOString().slice(0, 10)

  return readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data } = matter(readFileSync(join(POSTS_DIR, f), 'utf8'))
      const publishAt = data.publish_at ? toDateStr(data.publish_at) : toDateStr(data.date)
      return {
        slug:            f.replace(/\.md$/, ''),
        title:           String(data.title ?? '（タイトル未設定）'),
        publishAt,
        reviewed:        data.reviewed === true,
        rejectionReason: data.rejection_reason ? String(data.rejection_reason) : null,
        isFuture:        publishAt > today,
      }
    })
    .filter((p) => !p.reviewed)
    .sort((a, b) => (a.publishAt < b.publishAt ? -1 : 1))
}

function buildNotificationText(posts, dashboardUrl) {
  if (posts.length === 0) {
    return '✅ pending-review: レビュー待ちの記事はありません'
  }

  const rejected = posts.filter((p) => p.rejectionReason)
  const future   = posts.filter((p) => !p.rejectionReason && p.isFuture)
  const pending  = posts.filter((p) => !p.rejectionReason && !p.isFuture)

  const lines = ['📝 pending-review summary', '']
  lines.push(`- review待ち: ${pending.length}件`)
  lines.push(`- future記事: ${future.length}件`)
  lines.push(`- 差し戻し済み: ${rejected.length}件`)

  const latest = [...pending, ...future].slice(0, 10)
  if (latest.length > 0) {
    lines.push('')
    lines.push('最新:')
    for (const [i, post] of latest.entries()) {
      const futureTag = post.isFuture ? ` [📅${post.publishAt}]` : ''
      lines.push(`${i + 1}. ${post.title}${futureTag}`)
    }
    if (pending.length + future.length > 10) {
      lines.push(`  ...他 ${pending.length + future.length - 10} 件`)
    }
  }

  lines.push('')
  lines.push(`管理画面:\n${dashboardUrl}`)

  return lines.join('\n')
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

async function main() {
  loadEnv()

  const dashboardUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin/pending-review`
    : 'https://aisoukai-media.vercel.app/admin/pending-review'

  const posts = getPendingPosts()
  const text  = buildNotificationText(posts, dashboardUrl)

  // ── console 出力 ──
  console.log('━'.repeat(56))
  console.log('pending-review 通知')
  console.log('━'.repeat(56))
  console.log(text)
  console.log('━'.repeat(56))

  // ── Telegram 送信 ──
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
    console.log('✅ Telegram 通知を送信しました')
  } catch (err) {
    console.error()
    console.error(`❌ Telegram 送信失敗: ${err.message}`)
    process.exit(1)
  }
}

main()
