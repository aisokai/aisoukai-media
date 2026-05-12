#!/usr/bin/env node
// notify-pending-review.mjs
// pending review 記事の一覧を通知用テキストとして console に出力する。
// 現時点は console 出力のみ。将来は LINE / Telegram API への送信に拡張する。
// AI が自動実行してはならない。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

const DASHBOARD_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin/pending-review`
  : 'https://aisoukai-media.vercel.app/admin/pending-review'

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
        slug:      f.replace(/\.md$/, ''),
        title:     String(data.title ?? '（タイトル未設定）'),
        publishAt: data.publish_at ? toDateStr(data.publish_at) : toDateStr(data.date),
        reviewed:  data.reviewed === true,
        aiGenerated: data.ai_generated === true,
      }
    })
    .filter((p) => !p.reviewed)
    .sort((a, b) => (a.publishAt < b.publishAt ? -1 : 1))
}

function buildNotificationText(posts) {
  if (posts.length === 0) {
    return [
      '✅ Human review 待ちの記事はありません。',
    ].join('\n')
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

  lines.push(`🔗 確認ページ: ${DASHBOARD_URL}`)

  return lines.join('\n')
}

function main() {
  const posts = getPendingPosts()
  const text  = buildNotificationText(posts)

  // ── console 出力（現フェーズ）──
  console.log('━'.repeat(56))
  console.log('pending-review 通知')
  console.log('━'.repeat(56))
  console.log(text)
  console.log('━'.repeat(56))

  // ── 将来の LINE / Telegram 送信拡張ポイント ──
  // const lineToken    = process.env.LINE_CHANNEL_ACCESS_TOKEN
  // const tgBotToken   = process.env.TELEGRAM_BOT_TOKEN
  // const tgChatId     = process.env.TELEGRAM_CHAT_ID
  //
  // if (lineToken)                   await sendLine(lineToken, text)
  // if (tgBotToken && tgChatId)      await sendTelegram(tgBotToken, tgChatId, text)
}

main()
