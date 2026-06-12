#!/usr/bin/env node
// notify-draft.mjs
// 指定 slug の下書き生成通知を Telegram に再送する CLI。
// Human がトリガーする。AI が自動実行してはならない。
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { imagePresenceStatus } from './lib/auto-post-image.mjs'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
const SESSION_PATH = join(ROOT, 'data', 'telegram-session.json')

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key  = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key]  = next && !next.startsWith('--') ? argv[++i] : true
    } else {
      args._.push(argv[i])
    }
  }
  return args
}

function getSiteUrl() {
  const raw = process.env.SITE_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.VERCEL_URL
    ?? ''
  if (!raw) return null
  const cleaned = raw.replace(/\/$/, '')
  return /^https?:\/\//.test(cleaned) ? cleaned : `https://${cleaned}`
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getJstTimestamp() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00')
}

const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

function resolveFilePath(input) {
  const name   = input.endsWith('.md') ? input : `${input}.md`
  const direct = join(POSTS_DIR, name)
  if (existsSync(direct)) return direct

  const slug  = input.replace(/\.md$/, '')
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
  const hits  = files.filter((f) => f.replace(DATE_PREFIX_RE, '').replace(/\.md$/, '') === slug)

  if (hits.length === 0) return null
  if (hits.length > 1) throw new Error(`スラグ "${slug}" に複数のファイルが一致します: ${hits.join(', ')}`)
  return join(POSTS_DIR, hits[0])
}

function loadSessions() {
  if (!existsSync(SESSION_PATH)) return { sessions: {} }
  try {
    const parsed = JSON.parse(readFileSync(SESSION_PATH, 'utf8'))
    if (!parsed || typeof parsed.sessions !== 'object' || parsed.sessions === null) {
      return { sessions: {} }
    }
    return parsed
  } catch { return { sessions: {} } }
}

function saveSessions(data) {
  writeFileSync(SESSION_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function addSessionPending(chatId, slug, title) {
  const data = loadSessions()
  if (!data.sessions[chatId] || !Array.isArray(data.sessions[chatId].items)) {
    data.sessions[chatId] = { items: [] }
  }
  const items    = data.sessions[chatId].items
  const existing = items.find((i) => i.slug === slug)
  if (existing) {
    existing.status     = 'pending_approval'
    existing.updated_at = getJstTimestamp()
  } else {
    items.push({ slug, title, created_at: getJstTimestamp(), status: 'pending_approval' })
  }
  saveSessions(data)
}

async function sendTelegram(botToken, chatId, text, parseMode = null) {
  const url  = `https://api.telegram.org/bot${botToken}/sendMessage`
  const body = { chat_id: chatId, text, disable_web_page_preview: false }
  if (parseMode) body.parse_mode = parseMode
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`sendMessage エラー: ${json.description ?? JSON.stringify(json)}`)
  return json
}

function buildDraftNotification(slug, data, siteUrl) {
  const title    = String(data.title ?? slug)
  const category = String(data.category ?? '（未設定）')
  const excerpt  = String(data.excerpt ?? '（要約なし）')
  const imageStatus = imagePresenceStatus(data)

  const reviewUrl = siteUrl ? `${siteUrl}/admin/pending-review` : null
  const linkHtml  = reviewUrl
    ? `<a href="${escHtml(reviewUrl)}">下書きを確認する</a>`
    : '/admin/pending-review'

  const lines = [
    `📝 <b>${escHtml(title)}</b>`,
    ``,
    `スラグ: <code>${escHtml(slug)}</code>`,
    `カテゴリ: ${escHtml(category)}`,
    `image: ${escHtml(imageStatus.image)}`,
    `image_alt: ${escHtml(imageStatus.image_alt)}`,
    ``,
    escHtml(excerpt),
    ``,
    linkHtml,
    ``,
    `次: 承認`,
    `差し戻し: 差し戻し`,
  ]
  return lines.join('\n')
}

async function main() {
  loadEnv()

  const args      = parseArgs(process.argv.slice(2))
  const slugInput = String(args.slug ?? args._[0] ?? '').trim()
  const noSession = args.no_session === true

  if (!slugInput) {
    console.error('使い方: npm run notify:draft -- <slug>')
    console.error('   例:  npm run notify:draft -- 2026-05-13-cadcam')
    console.error('        npm run notify:draft -- 2026-05-13-cadcam --no-session')
    process.exit(1)
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId   = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.error('エラー: 環境変数が未設定です')
    if (!botToken) console.error('  TELEGRAM_BOT_TOKEN が必要です')
    if (!chatId)   console.error('  TELEGRAM_CHAT_ID が必要です')
    process.exit(1)
  }

  let filePath
  try {
    filePath = resolveFilePath(slugInput)
  } catch (e) {
    console.error(`エラー: ${e.message}`)
    process.exit(1)
  }

  if (!filePath) {
    console.error(`エラー: 記事が見つかりません: "${slugInput}"`)
    console.error('  content/posts/ 以下のスラグを指定してください')
    process.exit(1)
  }

  const slug       = filePath.split('/').pop().replace(/\.md$/, '')
  const raw        = readFileSync(filePath, 'utf8')
  const { data }   = matter(raw)

  const BAR = '━'.repeat(56)
  console.log(BAR)
  console.log('notify:draft — 下書き通知再送')
  console.log(BAR)
  console.log(`  スラグ     : ${slug}`)
  console.log(`  タイトル   : ${data.title ?? '（未設定）'}`)
  console.log(`  カテゴリ   : ${data.category ?? '（未設定）'}`)
  console.log(`  reviewed   : ${data.reviewed}`)
  const imageStatus = imagePresenceStatus(data)
  console.log(`  image      : ${imageStatus.image}`)
  console.log(`  image_alt  : ${imageStatus.image_alt}`)
  console.log()

  if (data.reviewed === true) {
    console.log(`⚠️  すでに承認済みです: ${slug}`)
    console.log()
    await sendTelegram(
      botToken, chatId,
      `⚠️ すでに承認済みです\n\nスラグ: ${slug}\nタイトル: ${String(data.title ?? slug)}`,
    ).catch((e) => {
      console.warn(`Telegram 送信失敗（無視）: ${e.message}`)
    })
    console.log('✅ Telegram に「承認済み」通知を送信しました')
    return
  }

  const siteUrl = getSiteUrl()
  const msgText = buildDraftNotification(slug, data, siteUrl)

  console.log('送信内容プレビュー:')
  console.log('─'.repeat(40))
  console.log(
    msgText
      .replace(/<b>(.*?)<\/b>/g, '$1')
      .replace(/<code>(.*?)<\/code>/g, '`$1`')
      .replace(/<a href="[^"]*">([^<]*)<\/a>/g, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
  )
  console.log('─'.repeat(40))
  console.log()

  await sendTelegram(botToken, chatId, msgText, 'HTML')
  console.log('✅ Telegram 通知を送信しました')

  if (!noSession) {
    addSessionPending(chatId, slug, String(data.title ?? slug))
    console.log(`✅ セッション更新: ${slug} → pending_approval`)
    console.log(`   chat_id: ${chatId}`)
  } else {
    console.log('ℹ️  --no-session: セッション更新をスキップしました')
  }

  console.log()
  console.log(BAR)
  console.log('完了')
  console.log(BAR)
}

main().catch((e) => {
  console.error('エラー:', e.message)
  process.exit(1)
})
