#!/usr/bin/env node
// telegram-ops.mjs
// Telegram を使った記事運用フロー CLI。
// Human がトリガーする。AI が自動実行してはならない。
//
// メッセージ種別:
//   "承認" / "OK" / "投稿" 等     → 直近 pending slug を承認（TELEGRAM_ALLOWED_CHAT_IDS のみ有効）
//   "差し戻し" / "修正" / "NG" 等 → 直近 pending slug を差し戻し（同上）
//   "approve <slug> [by <名前>]"  → 明示スラグ承認（互換維持）
//   "reject <slug> <理由>"        → 明示スラグ差し戻し（互換維持）
//   8文字以上の一般テキスト        → 記事リクエスト + 下書き生成 + pending_slug 保存
//   publish / push / deploy 等     → スキップ
//
// フラグ:
//   --dry-run         : コンソール表示のみ。書き込み・Git 操作・Telegram 返信なし（--apply がなければ暗黙 dry-run）
//   --apply           : ファイル書き込み + Telegram 返信（build/git なし）
//   --apply --build   : approve → validate → build → git add → commit → push → Telegram 返信
//   --verbose         : 成功時も各ステップの詳細を Telegram に含める（デフォルトは要約のみ）
//
// セッション管理:
//   data/telegram-session.json に chat_id 別の直近 pending slug を保存
//   draft 生成 → status: pending_approval
//   承認 / 差し戻し後 → status: approved / rejected
//
// 安全条件:
//   - TELEGRAM_ALLOWED_CHAT_IDS に含まれる chat_id/from_id のみ承認/差し戻し操作可
//   - pending slug なしで「承認」が来たら対象不明として何もしない
//   - build 失敗時は commit/push しない
//   - staged ファイルに機密ファイルが混入した場合は push しない
//   - 機密パターン（.env / .key 等）の未追跡ファイルがある場合は push しない
//   - .env.local は絶対に git add しない
//   - 差し戻し時は git 操作しない
//   - publish コマンドは存在しない

import {
  appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import matter from 'gray-matter'
import Anthropic from '@anthropic-ai/sdk'
import { buildArticlePrompt } from './prompts/dental-article-prompt.mjs'
import { buildSafeTemplateThemePrompt, classifyTelegramMessage } from './telegram-request-routing.mjs'

const __dirname      = dirname(fileURLToPath(import.meta.url))
const ROOT           = join(__dirname, '..')
const POSTS_DIR      = join(ROOT, 'content', 'posts')
const REQUESTS_PATH  = join(ROOT, 'data', 'article-requests.json')
const SESSION_PATH   = join(ROOT, 'data', 'telegram-session.json')
const LOGS_DIR       = join(ROOT, 'logs')
const LOG_PATH       = join(LOGS_DIR, 'review-history.md')

// ── 環境変数 ──────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

// ── 時刻ユーティリティ ────────────────────────────────────────────────────

function getJstTimestamp() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00')
}

function getTodayJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

// ── Telegram API ──────────────────────────────────────────────────────────

async function fetchUpdates(botToken, offset) {
  const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&limit=100&timeout=5`
  const res  = await fetch(url)
  const json = await res.json()
  if (!json.ok) throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
  return json.result ?? []
}

// parseMode: null（プレーンテキスト）または 'HTML'
async function sendTelegram(botToken, chatId, text, parseMode = null) {
  const url  = `https://api.telegram.org/bot${botToken}/sendMessage`
  const body = { chat_id: chatId, text, disable_web_page_preview: true }
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

// ── ユーティリティ ────────────────────────────────────────────────────────

// Telegram HTML parse_mode 用エスケープ（& < > のみ）
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// サイト URL を env から取得。VERCEL_URL は scheme なしなので補完する
function getSiteUrl() {
  const raw = process.env.SITE_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.VERCEL_URL
    ?? ''
  if (!raw) return null
  const cleaned = raw.replace(/\/$/, '')
  return /^https?:\/\//.test(cleaned) ? cleaned : `https://${cleaned}`
}

// ── ファイルユーティリティ ────────────────────────────────────────────────

function normalizeDates(data) {
  const out = { ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
  }
  return out
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
  if (hits.length > 1) throw new Error(`スラグ "${slug}" に複数のファイルが一致します`)
  return join(POSTS_DIR, hits[0])
}

function loadRequests() {
  if (!existsSync(REQUESTS_PATH)) return { last_update_id: 0, requests: [] }
  try { return JSON.parse(readFileSync(REQUESTS_PATH, 'utf8')) }
  catch { return { last_update_id: 0, requests: [] } }
}

function saveRequests(store) {
  writeFileSync(REQUESTS_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8')
}

function appendReviewLog(entry) {
  const lines = [
    `## ${entry.datetime}`,
    `datetime: ${entry.datetime}`,
    `action: ${entry.action}`,
    `slug: ${entry.slug}`,
  ]
  if (entry.reviewed_by) lines.push(`reviewed_by: ${entry.reviewed_by}`)
  if (entry.reason)      lines.push(`reason: ${entry.reason}`)
  if (entry.date)        lines.push(`date: ${entry.date}`)
  lines.push('')
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true })
  appendFileSync(LOG_PATH, lines.join('\n') + '\n', 'utf8')
}

// ── チャット別セッション管理（承認待ちスラグのリスト） ──────────────────
// data/telegram-session.json スキーマ:
//   { sessions: { "<chat_id>": { items: [{ slug, title, created_at, status }] } } }
// status: "pending_approval" | "approved" | "cleared" | "rejected"
//
// 状態遷移:
//   draft生成      → pending_approval
//   approve成功     → approved（push なし）/ cleared（push あり）
//   pipeline失敗    → pending_approval のまま保持（再試行可）
//   差し戻し       → rejected

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

// chat_id の pending_approval アイテム一覧を返す
function getPendingItems(chatId) {
  const { sessions } = loadSessions()
  return (sessions[chatId]?.items ?? []).filter((i) => i.status === 'pending_approval')
}

// draft 生成後に呼ぶ: 同一 slug があれば更新、なければ末尾に追加
function addSessionPending(chatId, slug, title) {
  const data = loadSessions()
  // chatId 未存在 OR 旧形式（items が配列でない）→ 新形式で初期化
  if (!data.sessions[chatId] || !Array.isArray(data.sessions[chatId].items)) {
    data.sessions[chatId] = { items: [] }
  }
  const items = data.sessions[chatId].items
  const existing = items.find((i) => i.slug === slug)
  if (existing) {
    existing.status     = 'pending_approval'
    existing.updated_at = getJstTimestamp()
  } else {
    items.push({ slug, title, created_at: getJstTimestamp(), status: 'pending_approval' })
  }
  saveSessions(data)
}

// 特定 slug のステータスを更新
function updateSlugStatus(chatId, slug, status) {
  const data = loadSessions()
  const items = data.sessions[chatId]?.items ?? []
  const entry = items.find((i) => i.slug === slug)
  if (entry) {
    entry.status     = status
    entry.updated_at = getJstTimestamp()
    saveSessions(data)
  }
}

// ── カテゴリ自動検出 ──────────────────────────────────────────────────────

const CATEGORY_RULES = [
  { category: '根管治療',    words: ['神経', '根管', '歯の根', '根の治療', '感染根管'] },
  { category: '歯周病治療',  words: ['歯周', '歯肉', '歯槽', '歯ぐき', '歯周炎', '歯周病', '出血'] },
  { category: '親知らず',    words: ['親知らず', '智歯', '親不知'] },
  { category: '虫歯治療',    words: ['虫歯', '詰め物', '被せ物', 'クラウン', 'インレー', 'CAD', 'CAM', 'セラミック', '齲蝕'] },
  { category: '予防歯科',    words: ['クリーニング', 'フッ素', '予防', 'メンテナンス', 'PMTC', 'ブラッシング'] },
  { category: 'インプラント', words: ['インプラント', '人工歯根'] },
  { category: '小児歯科',    words: ['小児', '子ども', '子供', 'お子', '乳歯', 'こども'] },
  { category: 'お知らせ',    words: ['お知らせ', '休診', '診療時間', 'お休み', '年末年始'] },
]

function detectCategory(text) {
  for (const { category, words } of CATEGORY_RULES) {
    if (words.some((w) => text.includes(w))) return category
  }
  return 'その他'
}

// ── slug 生成 ─────────────────────────────────────────────────────────────

function makeSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '')
}

// ── メッセージ解析 ────────────────────────────────────────────────────────
function parseMessage(text) {
  return classifyTelegramMessage(text)
}

// ── 承認フロー ────────────────────────────────────────────────────────────

function approvePost(slug, reviewedBy) {
  let filePath
  try { filePath = resolveFilePath(slug) }
  catch (e) { return { ok: false, error: e.message } }
  if (!filePath) return { ok: false, error: `記事ファイルが見つかりません: "${slug}"` }

  const raw    = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const data   = normalizeDates(parsed.data)

  const today      = getTodayJst()
  data.reviewed    = true
  data.draft       = false
  data.reviewed_at = today
  data.reviewed_by = reviewedBy || 'Telegram'

  const actualSlug = filePath.split('/').pop().replace(/\.md$/, '')
  writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')
  appendReviewLog({
    datetime:    getJstTimestamp(),
    action:      'approve',
    slug:        actualSlug,
    reviewed_by: data.reviewed_by,
    date:        data.date,
  })

  return { ok: true, slug: actualSlug, reviewedBy: data.reviewed_by, today, filePath }
}

// ── 差し戻しフロー ────────────────────────────────────────────────────────

function rejectPost(slug, reason) {
  let filePath
  try { filePath = resolveFilePath(slug) }
  catch (e) { return { ok: false, error: e.message } }
  if (!filePath) return { ok: false, error: `記事ファイルが見つかりません: "${slug}"` }

  const raw    = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const data   = normalizeDates(parsed.data)

  const actualSlug = filePath.split('/').pop().replace(/\.md$/, '')
  data.reviewed    = false
  if (reason) data.rejection_reason = reason

  writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')
  appendReviewLog({
    datetime: getJstTimestamp(),
    action:   'reject',
    slug:     actualSlug,
    reason:   reason || undefined,
    date:     data.date,
  })

  return { ok: true, slug: actualSlug }
}

// ── 下書き生成フロー（AI本文生成付き） ───────────────────────────────────

async function generateDraft(requestText, updateId, fromUser, requestMode = 'freeform') {
  const store    = loadRequests()
  const date     = getTodayJst()
  const now      = getJstTimestamp()
  const apiKey   = process.env.ANTHROPIC_API_KEY
  const isTemplateRequest = requestMode === 'template'

  // AI タイトル + 本文生成（ANTHROPIC_API_KEY がある場合）
  let selectedTheme = requestText
  let category      = detectCategory(selectedTheme)
  let title         = selectedTheme.slice(0, 60).trim()
  let bodyContent = null
  let aiUsed      = false

  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey })

      if (isTemplateRequest) {
        const themePrompt = buildSafeTemplateThemePrompt(requestText)
        const themeResp = await client.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 100,
          messages:   [{ role: 'user', content: themePrompt }],
        })
        const aiTheme = themeResp.content[0]?.type === 'text' ? themeResp.content[0].text.trim() : ''
        if (aiTheme) {
          selectedTheme = aiTheme.replace(/^[-*•\s]+/, '').replace(/^テーマ[:：]\s*/u, '').trim()
          category = detectCategory(selectedTheme)
          title = selectedTheme.slice(0, 60)
        } else {
          selectedTheme = '定期検診の受診目安'
          category = detectCategory(selectedTheme)
          title = selectedTheme
        }
      }

      // タイトル生成（haiku: 軽量 1 call）
      const titlePrompt = [
        'あなたは歯科医院の医療情報ライターです。',
        isTemplateRequest
          ? '以下のテーマから、患者向けブログ記事のタイトルを1行だけ生成してください。'
          : '以下の依頼内容から、患者向けブログ記事のタイトルを1行だけ生成してください。',
        '・60文字以内',
        '・具体的で検索されやすいタイトル',
        '・断定・保証表現（「必ず」「確実に」等）は使わない',
        '・タイトルのみ出力すること（前置き・説明不要）',
        '',
        isTemplateRequest ? `テーマ: ${selectedTheme}` : `依頼: ${requestText}`,
      ].join('\n')
      const titleResp = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages:   [{ role: 'user', content: titlePrompt }],
      })
      const aiTitle = titleResp.content[0]?.type === 'text' ? titleResp.content[0].text.trim() : ''
      if (aiTitle) title = aiTitle.slice(0, 60)

      // 本文生成（buildArticlePrompt を再利用）
      const topicText = isTemplateRequest ? selectedTheme : requestText
      const bodyPrompt = buildArticlePrompt({
        title,
        category,
        keyword:     topicText.slice(0, 50),
        intent:      topicText,
        medicalRisk: 'medium',
        topic:       topicText,
      })
      const bodyResp = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages:   [{ role: 'user', content: bodyPrompt }],
      })
      const aiBody = bodyResp.content[0]?.type === 'text' ? bodyResp.content[0].text.trim() : ''
      if (aiBody) { bodyContent = aiBody; aiUsed = true }
    } catch (e) {
      console.log(`    ⚠️ AI生成エラー（フォールバック）: ${e.message}`)
    }
  } else {
    console.log(`    ℹ️ ANTHROPIC_API_KEY 未設定 → プレースホルダー本文`)
  }

  if (!bodyContent) {
    bodyContent = [
      '<!-- AI本文生成をスキップしました。手動で記入してください。 -->',
      '',
      '## はじめに',
      '',
      '（本文を記入してください）',
    ].join('\n')
  }

  // slug と出力ファイルを確定（AI タイトルからスラグを生成）
  const slugBase = makeSlug(title || requestText) || `req-${updateId}`
  let slug     = `${date}-${slugBase}`
  let filename = `${slug}.md`

  if (existsSync(join(POSTS_DIR, filename))) {
    slug     = `${date}-req-${updateId}`
    filename = `${slug}.md`
  }

  const filePath = join(POSTS_DIR, filename)
  const excerpt  = category === 'お知らせ'
    ? `${title}についてお知らせします。`
    : `${title}について、原因・受診目安・注意点を整理します。`

  // frontmatter 組み立て
  const frontmatter = {
    title,
    date,
    publish_at:          date,
    excerpt,
    category,
    tags:                [category],
    author:              '藍想会メディア編集部',
    reviewed:            false,
    draft:               false,
    image:               '',
    ai_generated:        aiUsed,
    request_mode:        requestMode,
    source_request_id:   String(updateId),
    source_request_text: requestText.slice(0, 80),
  }

  const fmLines = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v))       return `${k}:\n${v.map((i) => `  - ${i}`).join('\n')}`
      if (typeof v === 'boolean') return `${k}: ${v}`
      return `${k}: '${String(v).replace(/'/g, "''")}'`
    })
    .join('\n')

  writeFileSync(filePath, `---\n${fmLines}\n---\n\n${bodyContent}\n`, 'utf8')

  let entry = store.requests.find((r) => r.update_id === updateId)
  if (!entry) {
    entry = {
      update_id:   updateId,
      from:        fromUser,
      text:        requestText,
      received_at: now,
      status:      'requested',
    }
    store.requests.push(entry)
  }
  entry.status            = 'drafted'
  entry.status_updated_at = now
  entry.draft_slug        = slug
  entry.history           = [
    ...(entry.history ?? [{ action: 'received', at: entry.received_at ?? now }]),
    { action: 'drafted', at: now, draft_slug: slug },
  ]
  saveRequests(store)

  return { ok: true, slug, category, filename, title, bodyContent, excerpt, aiUsed }
}

// ── プロセス実行ユーティリティ ────────────────────────────────────────────

function runNpm(subcommand) {
  const result = spawnSync('npm', ['run', subcommand], {
    cwd: ROOT, encoding: 'utf8', timeout: 300000,
  })
  return { ok: result.status === 0 && !result.error, output: ((result.stdout ?? '') + (result.stderr ?? '')).trim() }
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: ROOT, encoding: 'utf8', timeout: 60000,
  })
  return { ok: result.status === 0 && !result.error, output: ((result.stdout ?? '') + (result.stderr ?? '')).trim() }
}

// ── git 安全チェック ──────────────────────────────────────────────────────

// ステージ済みファイルのパス一覧を返す
function getStagedFiles() {
  const r = runGit(['diff', '--staged', '--name-only'])
  return r.output.split('\n').filter(Boolean)
}

// 未追跡ファイルのパス一覧を返す
function getUntrackedFiles() {
  const r = runGit(['status', '--porcelain'])
  return r.output
    .split('\n')
    .filter((l) => l.startsWith('??'))
    .map((l) => l.slice(3).trim())
}

// .env.local / *.key / credentials 等の機密パターン
const SENSITIVE_RE = /\.(env|key|pem|p12|pfx|cert)(\.local)?$|\.env($|\.)|credentials|secrets\//i

function filterSensitive(files) {
  return files.filter((f) => SENSITIVE_RE.test(f))
}

// ── approve → validate → build → git add/commit/push パイプライン ─────────

async function runApprovePipeline({ slug, by, build, botToken, replyId }) {

  const steps = []    // { name, ok, output }
  let postSlug = ''
  let postFilePath = ''

  // ─ 1. approve ─────────────────────────────────────────────────────────────

  const ar = approvePost(slug, by)
  if (!ar.ok) {
    return { ok: false, failedAt: 'approve', error: ar.error, steps }
  }
  postSlug     = ar.slug
  postFilePath = ar.filePath
  steps.push({ name: 'approve', ok: true, output: `reviewed_by: ${ar.reviewedBy}, date: ${ar.today}` })

  // ─ 2. validate:posts ──────────────────────────────────────────────────────

  const vr = runNpm('validate:posts')
  steps.push({ name: 'validate:posts', ok: vr.ok, output: vr.output.slice(0, 200) })
  if (!vr.ok) {
    return { ok: false, failedAt: 'validate:posts', error: vr.output, steps, slug: postSlug }
  }

  // ─ build + git（--build 指定時のみ） ────────────────────────────────────

  if (!build) {
    return { ok: true, slug: postSlug, reviewedBy: ar.reviewedBy, today: ar.today, steps, pushed: false }
  }

  // ─ 3. build ───────────────────────────────────────────────────────────────

  const br = runNpm('build')
  steps.push({ name: 'build', ok: br.ok, output: br.output.slice(0, 300) })
  if (!br.ok) {
    return { ok: false, failedAt: 'build', error: br.output, steps, slug: postSlug }
  }

  // ─ 4. git add（指定ファイルのみ）─────────────────────────────────────────

  const relPost = `content/posts/${postSlug}.md`
  const relLog  = 'logs/review-history.md'
  const addR    = runGit(['add', relPost, relLog])
  steps.push({ name: 'git add', ok: addR.ok, output: addR.output })
  if (!addR.ok) {
    return { ok: false, failedAt: 'git add', error: addR.output, steps, slug: postSlug }
  }

  // ─ 5. 安全チェック ────────────────────────────────────────────────────────

  // ステージ済みファイルに機密ファイルが混入していないか確認
  const staged   = getStagedFiles()
  const badStaged = filterSensitive(staged)
  if (badStaged.length > 0) {
    runGit(['reset', 'HEAD'])   // ステージをすべて戻す
    return {
      ok: false, failedAt: 'safety-check',
      error: `機密ファイルがステージに含まれています: ${badStaged.join(', ')}`,
      steps, slug: postSlug,
    }
  }

  // 未追跡ファイルに機密ファイルがないか確認（add はしていないが念のため）
  const untracked    = getUntrackedFiles()
  const badUntracked = filterSensitive(untracked)
  if (badUntracked.length > 0) {
    runGit(['reset', 'HEAD'])
    return {
      ok: false, failedAt: 'safety-check',
      error: `未追跡に機密ファイルがあります（push を中止）: ${badUntracked.join(', ')}`,
      steps, slug: postSlug,
    }
  }

  // ステージが空なら "already committed" として扱う
  if (staged.length === 0) {
    steps.push({ name: 'git commit', ok: true, output: 'nothing to commit (既に最新)' })
    steps.push({ name: 'git push',   ok: true, output: 'skipped (nothing to push)' })
    return { ok: true, slug: postSlug, reviewedBy: ar.reviewedBy, today: ar.today, steps, pushed: false }
  }

  steps.push({ name: 'safety-check', ok: true, output: `staged: ${staged.join(', ')}` })

  // ─ 6. git commit ──────────────────────────────────────────────────────────

  const commitMsg = `approve: ${postSlug}\n\nApproved via Telegram by ${ar.reviewedBy}`
  const cr        = runGit(['commit', '-m', commitMsg])
  steps.push({ name: 'git commit', ok: cr.ok, output: cr.output.slice(0, 200) })
  if (!cr.ok) {
    return { ok: false, failedAt: 'git commit', error: cr.output, steps, slug: postSlug }
  }

  // ─ 7. git push ────────────────────────────────────────────────────────────

  const pr = runGit(['push', 'origin', 'main'])
  steps.push({ name: 'git push', ok: pr.ok, output: pr.output.slice(0, 200) })
  if (!pr.ok) {
    return { ok: false, failedAt: 'git push', error: pr.output, steps, slug: postSlug }
  }

  return { ok: true, slug: postSlug, reviewedBy: ar.reviewedBy, today: ar.today, steps, pushed: true }
}

// ── パイプライン結果を Telegram 返信テキストに変換 ────────────────────────
// opts.verbose: true のとき全ステップを表示（デフォルト: 成功時は要約のみ）
// opts.siteUrl: push 成功時の公開URL生成に使用

function formatPipelineReply(result, opts = {}) {
  const { verbose = false, siteUrl = null } = opts

  if (result.ok) {
    // push 成功 + 非 verbose → 最短通知
    if (result.pushed && !verbose) {
      const blogUrl = siteUrl ? `${siteUrl}/blog/${result.slug}` : result.slug
      return `✅ 投稿完了\n🔗 ${blogUrl}`
    }
    // push なし or verbose → 詳細表示
    const stepLines = result.steps.map((s) => `${s.ok ? '✅' : '❌'} ${s.name}`)
    const lines = [
      result.pushed
        ? `✅ 承認 → build → push 完了`
        : `✅ 承認 → validate 完了（build/push なし）`,
      `スラグ: ${result.slug}`,
      `reviewed_by: ${result.reviewedBy}`,
      ``,
      ...stepLines,
    ]
    if (result.pushed && siteUrl) {
      lines.push(``, `🔗 ${siteUrl}/blog/${result.slug}`)
    }
    return lines.join('\n')
  }

  // 失敗: 常に詳細表示
  const stepLines = result.steps.map((s) => `${s.ok ? '✅' : '❌'} ${s.name}`)
  const lines = [
    `❌ パイプライン失敗（${result.failedAt} で停止）`,
    `スラグ: ${result.slug ?? '(不明)'}`,
    ``,
    ...stepLines,
    ``,
    `エラー:`,
    result.error?.slice(0, 300) ?? '(詳細なし)',
  ]

  if (result.failedAt === 'build') {
    lines.push(``, `▼ build 修正後に再実行:`, `  approve ${result.slug} by <名前>`)
  } else if (result.failedAt === 'git push') {
    lines.push(``, `▼ push を手動で実行:`, `  git push origin main`)
  }

  return lines.join('\n')
}

// 日本語承認フロー用（formatPipelineReply と同じ opts インタフェース）
function formatJpApproveReply(result, opts = {}) {
  const { verbose = false, siteUrl = null } = opts
  if (!result.ok) return formatPipelineReply(result, opts)

  // push 成功 + 非 verbose → 最短通知
  if (result.pushed && !verbose) {
    const blogUrl = siteUrl ? `${siteUrl}/blog/${result.slug}` : result.slug
    return `✅ 投稿完了\n🔗 ${blogUrl}`
  }

  const stepLines = result.steps.map((s) => `${s.ok ? '✅' : '❌'} ${s.name}`)

  if (result.pushed) {
    const lines = [
      `✅ 承認・build・push が完了しました。`,
      ``,
      `スラグ: ${result.slug}`,
      ``,
      ...stepLines,
    ]
    if (siteUrl) lines.push(``, `🔗 ${siteUrl}/blog/${result.slug}`)
    return lines.join('\n')
  }

  return [
    `✅ 承認・validate が完了しました。`,
    `（build/push は --build フラグで有効化されます）`,
    ``,
    `スラグ: ${result.slug}`,
    ``,
    ...stepLines,
  ].join('\n')
}

// ── メイン ────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const argv    = process.argv.slice(2)
  const dryRun  = argv.includes('--dry-run') || !argv.includes('--apply')
  const build   = argv.includes('--build')
  const verbose = argv.includes('--verbose')
  const BAR     = '━'.repeat(56)

  const modeLabel = dryRun
    ? '[dry-run]'
    : build ? '--apply --build' : '--apply'

  console.log(BAR)
  console.log(`telegram:ops ${modeLabel}${verbose ? ' --verbose' : ''}`)
  console.log(BAR)

  const siteUrl       = getSiteUrl()
  const replyOpts     = { verbose, siteUrl }

  const botToken      = process.env.TELEGRAM_BOT_TOKEN
  const defaultChatId = process.env.TELEGRAM_CHAT_ID
  const allowedRaw     = process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? process.env.TELEGRAM_CHAT_ID ?? ''
  const allowedChatIds = new Set(allowedRaw.split(',').map((s) => s.trim()).filter(Boolean))

  if (!botToken) {
    console.error('❌ エラー: TELEGRAM_BOT_TOKEN が未設定です（.env.local を確認）')
    process.exit(1)
  }

  const store           = loadRequests()
  const offset          = (store.last_update_id ?? 0) + 1
  const knownRequestIds = new Set(store.requests.map((r) => r.update_id))

  console.log(`  既存リクエスト数        : ${store.requests.length} 件`)
  console.log(`  取得開始 offset         : ${offset}`)
  console.log(`  approve/reject 許可 ID  : ${allowedChatIds.size > 0 ? [...allowedChatIds].join(', ') : '（未設定）'}`)
  console.log()

  let updates
  try {
    updates = await fetchUpdates(botToken, offset)
  } catch (err) {
    console.error(`❌ Telegram 取得失敗: ${err.message}`)
    process.exit(1)
  }

  console.log(`  取得 update 数: ${updates.length} 件`)

  let maxUpdateId = store.last_update_id ?? 0

  for (const upd of updates) {
    maxUpdateId = Math.max(maxUpdateId, upd.update_id)

    const msg = upd.message ?? upd.channel_post
    if (!msg?.text) continue

    const msgChatId = String(msg.chat?.id ?? '')
    const msgFromId = String(msg.from?.id ?? '')
    const fromUser  = msg.from?.username ?? msg.from?.first_name ?? '(unknown)'

    if (defaultChatId) {
      if (msgChatId !== String(defaultChatId) && msgFromId !== String(defaultChatId)) continue
    }

    const parsed = parseMessage(msg.text)

    console.log()
    console.log(`  ─ [${upd.update_id}] from:@${fromUser} chat:${msgChatId}`)
    console.log(`    text: "${msg.text.slice(0, 60)}"`)
    console.log(`    type: ${parsed.type}`)

    // ── スキップ ────────────────────────────────────────────────────────

    if (parsed.type === 'skip') {
      console.log(`    ⏭ ${parsed.reason}`)
      continue
    }

    // ── approve / reject ────────────────────────────────────────────────

    if (['approve', 'reject', 'jp_approve', 'jp_reject'].includes(parsed.type)) {
      const authorized = allowedChatIds.has(msgChatId) || allowedChatIds.has(msgFromId)

      if (!authorized) {
        console.log(`    ⛔ 権限なし: chat_id=${msgChatId} / from_id=${msgFromId}`)
        if (!dryRun && (defaultChatId || msgChatId)) {
          await sendTelegram(
            botToken, msgChatId || defaultChatId,
            `⛔ 権限エラー: このチャット・ユーザーは approve/reject できません。\n許可済み: ${[...allowedChatIds].join(', ')}`,
          ).catch(() => {})
        }
        continue
      }

      // ── 日本語承認 ──────────────────────────────────────────────────

      if (parsed.type === 'jp_approve') {
        const pendingItems = getPendingItems(msgChatId)
        console.log(`    → 日本語承認: pending=${pendingItems.length}件  by: ${fromUser}`)

        // 0件: 対象なし
        if (pendingItems.length === 0) {
          console.log(`    ⚠️ 承認対象の pending なし`)
          if (!dryRun) {
            await sendTelegram(
              botToken, msgChatId || defaultChatId,
              `⚠️ 承認待ちの下書きが見つかりません。\n「approve <スラグ> by <名前>」で明示指定してください。`,
            ).catch(() => {})
          }
          continue
        }

        // 複数件: 一覧を返信して終了
        if (pendingItems.length > 1) {
          console.log(`    ⚠️ 承認待ち複数: ${pendingItems.map((p) => p.slug).join(', ')}`)
          if (!dryRun) {
            const list = pendingItems
              .map((p, i) => `${i + 1}. <code>${escHtml(p.slug)}</code>\n   ${escHtml(p.title)}`)
              .join('\n\n')
            await sendTelegram(
              botToken, msgChatId || defaultChatId,
              `⚠️ 承認待ちの下書きが ${pendingItems.length} 件あります:\n\n${list}\n\n「approve &lt;スラグ&gt; by &lt;名前&gt;」で指定してください。`,
              'HTML',
            ).catch(() => {})
          }
          continue
        }

        // 1件: 自動採用
        const target = pendingItems[0]
        console.log(`    → 自動採用: ${target.slug}`)

        if (dryRun) {
          console.log(`    [dry-run] パイプラインをスキップ`)
          continue
        }

        const result = await runApprovePipeline({ slug: target.slug, by: fromUser, build })
        for (const s of result.steps) {
          console.log(`    ${s.ok ? '✅' : '❌'} ${s.name}: ${s.output ? s.output.slice(0, 80) : ''}`)
        }

        if (result.ok) {
          // push済み → cleared、ローカル承認のみ → approved
          // 失敗時は pending_approval のまま保持して再試行可能にする
          updateSlugStatus(msgChatId, target.slug, result.pushed ? 'cleared' : 'approved')
        }

        const replyText = formatJpApproveReply(result, replyOpts)
        await sendTelegram(botToken, msgChatId || defaultChatId, replyText).catch((e) => {
          console.log(`    ⚠️ Telegram 返信失敗: ${e.message}`)
        })
        continue
      }

      // ── 日本語差し戻し ───────────────────────────────────────────────

      if (parsed.type === 'jp_reject') {
        const pendingItems = getPendingItems(msgChatId)
        console.log(`    → 日本語差し戻し: pending=${pendingItems.length}件`)

        if (pendingItems.length === 0) {
          console.log(`    ⚠️ 差し戻し対象の pending なし`)
          if (!dryRun) {
            await sendTelegram(
              botToken, msgChatId || defaultChatId,
              `⚠️ 差し戻し対象の下書きが見つかりません。\n「reject <スラグ> <理由>」で明示指定してください。`,
            ).catch(() => {})
          }
          continue
        }

        if (pendingItems.length > 1) {
          console.log(`    ⚠️ 差し戻し対象複数: ${pendingItems.map((p) => p.slug).join(', ')}`)
          if (!dryRun) {
            const list = pendingItems
              .map((p, i) => `${i + 1}. <code>${escHtml(p.slug)}</code>`)
              .join('\n')
            await sendTelegram(
              botToken, msgChatId || defaultChatId,
              `⚠️ 対象が複数あります:\n\n${list}\n\n「reject &lt;スラグ&gt; &lt;理由&gt;」で指定してください。`,
              'HTML',
            ).catch(() => {})
          }
          continue
        }

        const target = pendingItems[0]

        if (dryRun) {
          console.log(`    [dry-run] 差し戻しをスキップ`)
          continue
        }

        const result = rejectPost(target.slug, 'Telegramから差し戻し')
        updateSlugStatus(msgChatId, target.slug, 'rejected')

        if (!result.ok) {
          console.log(`    ❌ 差し戻しエラー: ${result.error}`)
          await sendTelegram(
            botToken, msgChatId || defaultChatId,
            `❌ 差し戻しエラー: ${result.error}`,
          ).catch(() => {})
          continue
        }

        console.log(`    ↩️  差し戻し完了: ${result.slug}`)
        await sendTelegram(
          botToken, msgChatId || defaultChatId,
          `↩️ 差し戻しました。\n\nスラグ: ${result.slug}\n\n本文を修正後、「承認」と返信してください。`,
        ).catch((e) => { console.log(`    ⚠️ Telegram 返信失敗: ${e.message}`) })
        continue
      }

      // ── 明示 approve ─────────────────────────────────────────────────

      if (parsed.type === 'approve') {
        const by = parsed.reviewedBy || fromUser
        const pipelineDesc = build
          ? 'approve → validate → build → git add → commit → push'
          : 'approve → validate（build/push は --build で有効化）'

        console.log(`    → 承認: ${parsed.slug}  by: ${by}`)
        console.log(`    パイプライン: ${pipelineDesc}`)

        if (dryRun) {
          console.log(`    [dry-run] 書き込み・Git 操作をスキップ`)
          continue
        }

        const result = await runApprovePipeline({
          slug: parsed.slug, by, build, botToken, replyId: msgChatId || defaultChatId,
        })

        // コンソール出力
        for (const s of result.steps) {
          console.log(`    ${s.ok ? '✅' : '❌'} ${s.name}: ${s.output ? s.output.slice(0, 80) : ''}`)
        }
        if (!result.ok) {
          console.log(`    ❌ 失敗: ${result.failedAt} — ${result.error?.slice(0, 100)}`)
        } else {
          if (result.pushed) console.log(`    🚀 push 完了`)
          updateSlugStatus(msgChatId || defaultChatId || '', parsed.slug, result.pushed ? 'cleared' : 'approved')
        }

        // Telegram 返信
        const replyText = formatPipelineReply(result, replyOpts)
        if (defaultChatId || msgChatId) {
          await sendTelegram(botToken, msgChatId || defaultChatId, replyText).catch((e) => {
            console.log(`    ⚠️ Telegram 返信失敗: ${e.message}`)
          })
        }
        continue
      }

      // ── 明示 reject ─────────────────────────────────────────────────

      if (parsed.type === 'reject') {
        console.log(`    → 差し戻し: ${parsed.slug}  reason: "${parsed.reason || '（理由なし）'}"`)

        if (dryRun) {
          console.log(`    [dry-run] 書き込みをスキップ`)
          continue
        }

        const result = rejectPost(parsed.slug, parsed.reason)
        if (!result.ok) {
          console.log(`    ❌ 差し戻しエラー: ${result.error}`)
          await sendTelegram(
            botToken, msgChatId || defaultChatId,
            `❌ 差し戻しエラー\nスラグ: ${parsed.slug}\n理由: ${result.error}`,
          ).catch(() => {})
          continue
        }
        console.log(`    ↩️  差し戻し完了: ${result.slug}`)
        updateSlugStatus(msgChatId || defaultChatId || '', parsed.slug, 'rejected')

        const replyText = [
          `↩️ 差し戻し: ${result.slug}`,
          parsed.reason ? `理由: ${parsed.reason}` : `（理由なし）`,
          ``,
          `修正後に再承認:`,
          `  approve ${result.slug} by <名前>`,
        ].join('\n')

        await sendTelegram(botToken, msgChatId || defaultChatId, replyText).catch((e) => {
          console.log(`    ⚠️ Telegram 返信失敗: ${e.message}`)
        })
        continue
      }
    }

    // ── 記事リクエスト → 下書き生成 ────────────────────────────────────

    if (parsed.type === 'request') {
      if (knownRequestIds.has(upd.update_id)) {
        console.log(`    ⏭ 処理済み update_id ${upd.update_id}`)
        continue
      }

      const category = detectCategory(parsed.text)
      console.log(`    → 記事リクエスト  カテゴリ推定: ${category}`)

      if (dryRun) {
        const slugBase = makeSlug(parsed.text) || `req-${upd.update_id}`
        console.log(`    [dry-run] 推定スラグ: ${getTodayJst()}-${slugBase}`)
        continue
      }

      try {
        const result = await generateDraft(parsed.text, upd.update_id, fromUser, parsed.requestMode)
        console.log(`    ✅ 下書き生成: ${result.slug}  AI=${result.aiUsed}${parsed.requestMode === 'template' ? ' / template' : ''}`)

        // chat_id ごとに pending slug をリストに追加（日本語承認コマンドで参照）
        const draftChatId = msgChatId || defaultChatId || ''
        addSessionPending(draftChatId, result.slug, result.title)

        // 下書き確認 URL（siteUrl は main スコープで取得済み）
        const reviewUrl = siteUrl ? `${siteUrl}/admin/pending-review` : null
        const linkHtml  = reviewUrl
          ? `<a href="${escHtml(reviewUrl)}">下書きを確認する</a>`
          : `/admin/pending-review`

        const replyLines = [
          `📝 <b>${escHtml(result.title)}</b>`,
          `<code>${escHtml(result.slug)}</code>`,
          ``,
          linkHtml,
          ``,
          `「承認」で投稿 / 「差し戻し」で修正`,
        ]
        const replyText = replyLines.join('\n')

        if (defaultChatId || msgChatId) {
          await sendTelegram(botToken, msgChatId || defaultChatId, replyText, 'HTML').catch((e) => {
            console.log(`    ⚠️ Telegram 返信失敗: ${e.message}`)
          })
        }
      } catch (err) {
        console.error(`    ❌ 下書き生成エラー: ${err.message}`)
        if (defaultChatId || msgChatId) {
          await sendTelegram(
            botToken, msgChatId || defaultChatId,
            `❌ 下書き生成に失敗しました。\n${err.message.slice(0, 200)}`,
          ).catch(() => {})
        }
      }
    }
  } // end for updates

  // dry-run 以外で last_update_id を更新
  if (!dryRun && maxUpdateId > (store.last_update_id ?? 0)) {
    const freshStore = loadRequests()
    freshStore.last_update_id = maxUpdateId
    saveRequests(freshStore)
    console.log()
    console.log(`  last_update_id を更新: ${maxUpdateId}`)
  }

  console.log()
  console.log(BAR)
  if (dryRun) {
    console.log('dry-run 完了。実行するには:')
    console.log('  npm run telegram:ops -- --apply           # approve/validate のみ')
    console.log('  npm run telegram:ops -- --apply --build   # 承認 → build → push')
  } else {
    console.log('完了')
  }
  console.log(BAR)
}

main()
