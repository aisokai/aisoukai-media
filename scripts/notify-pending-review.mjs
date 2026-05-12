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

  return readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data } = matter(readFileSync(join(POSTS_DIR, f), 'utf8'))
      return {
        slug:        f.replace(/\.md$/, ''),
        title:       String(data.title ?? '（タイトル未設定）'),
        publishAt:   data.publish_at ? toDateStr(data.publish_at) : toDateStr(data.date),
        reviewed:    data.reviewed === true,
        aiGenerated: data.ai_generated === true,
      }
    })
    .filter((p) => !p.reviewed)
    .sort((a, b) => (a.publishAt < b.publishAt ? -1 : 1))
}

function buildNotificationText(posts, dashboardUrl) {
  if (posts.length === 0) {
    return 'No pending review articles'
  }

  const lines = [
    `📋 Human review 待ち記事: ${posts.length} 件`,
    '',
  ]

  for (const [i, post] of posts.entries()) {
    const aiLabel = post.aiGenerated ? ' [AI生成]' : ''
    lines.push(`${i + 1}. ${post.title}${aiLabel}`)
    lines.push(`   slug      : ${post.slug}`)
    lines.push(`   publish_at: ${post.publishAt}`)
    lines.push(`   approve   : npm run approve:post -- ${post.slug} --reviewed-by "氏名"`)
    lines.push('')
  }

  lines.push(`🔗 確認ページ: ${dashboardUrl}`)

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
