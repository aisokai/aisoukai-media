#!/usr/bin/env node
// telegram-ops.mjs
// Telegram を使った記事運用フロー CLI。
// Human がトリガーする。AI が自動実行してはならない。
//
// メッセージ種別:
//   "approve <slug> [by <名前>]"  → 承認フロー（TELEGRAM_ALLOWED_CHAT_IDS のみ有効）
//   "reject <slug> <理由>"        → 差し戻しフロー（TELEGRAM_ALLOWED_CHAT_IDS のみ有効）
//   8文字以上の一般テキスト        → 記事リクエスト + 下書き生成
//   publish / push / deploy 等     → スキップ
//
// フラグ:
//   （引数なし） : dry-run — コンソール表示のみ、ファイル書き込みなし、Telegram 返信なし
//   --apply      : ファイル書き込み + Telegram 返信
//   --build      : --apply 時に承認後 npm run build も実行

import {
  appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import matter from 'gray-matter'

const __dirname     = dirname(fileURLToPath(import.meta.url))
const ROOT          = join(__dirname, '..')
const POSTS_DIR     = join(ROOT, 'content', 'posts')
const REQUESTS_PATH = join(ROOT, 'data', 'article-requests.json')
const LOGS_DIR      = join(ROOT, 'logs')
const LOG_PATH      = join(LOGS_DIR, 'review-history.md')

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

async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`sendMessage エラー: ${json.description ?? JSON.stringify(json)}`)
  return json
}

// ── ファイルユーティリティ ────────────────────────────────────────────────

// gray-matter が ISO 日付文字列を Date に変換するケースへの対処
function normalizeDates(data) {
  const out = { ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
  }
  return out
}

const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

// フルファイル名またはスラグ（日付プレフィックスあり/なし）でファイルを探す
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
    .replace(/[^\x20-\x7e]/g, '')   // 非ASCII（日本語等）を除去
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '')
}

// ── メッセージ解析 ────────────────────────────────────────────────────────

function parseMessage(text) {
  const t = text.trim()

  // approve <slug> [by <名前>]
  const approveM = t.match(/^approve\s+(\S+)(?:\s+by\s+(.+))?$/i)
  if (approveM) return { type: 'approve', slug: approveM[1].trim(), reviewedBy: approveM[2]?.trim() ?? '' }

  // reject <slug> [<理由>]
  const rejectM = t.match(/^reject\s+(\S+)(?:\s+(.+))?$/i)
  if (rejectM) return { type: 'reject', slug: rejectM[1].trim(), reason: rejectM[2]?.trim() ?? '' }

  // 明示的に禁止するコマンド
  if (/^publish/i.test(t)) return { type: 'skip', reason: 'publish コマンドは Telegram から禁止' }
  if (/^push/i.test(t))    return { type: 'skip', reason: 'push コマンドは Telegram から禁止' }
  if (/^deploy/i.test(t))  return { type: 'skip', reason: 'deploy コマンドは禁止' }
  if (/^\/[a-z]/i.test(t)) return { type: 'skip', reason: 'Bot コマンド（/ 始まり）' }
  if (/npm run/i.test(t))  return { type: 'skip', reason: 'npm run コマンド' }
  if (t.length < 8)        return { type: 'skip', reason: '短すぎます（8文字未満）' }

  return { type: 'request', text: t }
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

  return { ok: true, slug: actualSlug, reviewedBy: data.reviewed_by, today }
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

// ── 下書き生成フロー ──────────────────────────────────────────────────────

function generateDraft(requestText, updateId, fromUser) {
  const store    = loadRequests()
  const date     = getTodayJst()
  const category = detectCategory(requestText)
  const now      = getJstTimestamp()

  const slugBase = makeSlug(requestText) || `req-${updateId}`
  let slug       = `${date}-${slugBase}`
  let filename   = `${slug}.md`

  // 同名ファイルが存在する場合は update_id ベースにフォールバック
  if (existsSync(join(POSTS_DIR, filename))) {
    slug     = `${date}-req-${updateId}`
    filename = `${slug}.md`
  }

  const filePath = join(POSTS_DIR, filename)

  const frontmatter = {
    title:               requestText.slice(0, 60).trim(),
    date,
    excerpt:             requestText.slice(0, 80),
    category,
    tags:                [category],
    author:              '藍想会メディア編集部',
    reviewed:            false,
    draft:               false,
    image:               '',
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

  const body = [
    '<!-- リクエスト内容:',
    `     ${requestText}`,
    '     本文は未入力です。以下のいずれかで内容を追加してください。',
    '     1. npm run generate:draft でAI下書きを生成する',
    '     2. 本文を手動で記入する',
    '-->',
    '',
    '## はじめに',
    '',
    '（本文を記入してください）',
  ].join('\n')

  writeFileSync(filePath, `---\n${fmLines}\n---\n\n${body}\n`, 'utf8')

  // article-requests.json を更新（重複 update_id は上書き更新）
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

  return { ok: true, slug, category, filename }
}

// ── サブコマンド実行（シェルを使わない spawnSync ） ───────────────────────

function runNpm(subcommand) {
  const result = spawnSync('npm', ['run', subcommand], {
    cwd:     ROOT,
    encoding: 'utf8',
    timeout:  180000,
  })
  const out = (result.stdout ?? '') + (result.stderr ?? '')
  return { ok: result.status === 0, output: out.trim() }
}

// ── メイン ────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const argv  = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const build = argv.includes('--build')
  const BAR   = '━'.repeat(56)

  console.log(BAR)
  console.log(`telegram:ops${apply ? ' --apply' : ' [dry-run]'}${build ? ' --build' : ''}`)
  console.log(BAR)

  const botToken      = process.env.TELEGRAM_BOT_TOKEN
  const defaultChatId = process.env.TELEGRAM_CHAT_ID
  // TELEGRAM_ALLOWED_CHAT_IDS: approve/reject を許可する chat_id または from_id のリスト
  // 未設定時は TELEGRAM_CHAT_ID にフォールバック（1:1 Bot 運用向け）
  const allowedRaw     = process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? process.env.TELEGRAM_CHAT_ID ?? ''
  const allowedChatIds = new Set(allowedRaw.split(',').map((s) => s.trim()).filter(Boolean))

  if (!botToken) {
    console.error('❌ エラー: TELEGRAM_BOT_TOKEN が未設定です（.env.local を確認）')
    process.exit(1)
  }

  const store          = loadRequests()
  const offset         = (store.last_update_id ?? 0) + 1
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

    // チャンネル / ユーザーフィルタ（TELEGRAM_CHAT_ID が未設定なら全受信）
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
      console.log(`    ⏭ スキップ: ${parsed.reason}`)
      continue
    }

    // ── approve / reject ────────────────────────────────────────────────

    if (parsed.type === 'approve' || parsed.type === 'reject') {
      // 送信者の chat_id と from_id の両方をホワイトリストに照合
      const authorized = allowedChatIds.has(msgChatId) || allowedChatIds.has(msgFromId)

      if (!authorized) {
        console.log(`    ⛔ 権限なし: chat_id=${msgChatId} / from_id=${msgFromId} は TELEGRAM_ALLOWED_CHAT_IDS に未登録`)
        if (apply && (defaultChatId || msgChatId)) {
          await sendTelegram(
            botToken,
            msgChatId || defaultChatId,
            `⛔ 権限エラー: このチャット・ユーザーは approve/reject できません。\n許可済み ID: ${[...allowedChatIds].join(', ')}`,
          ).catch(() => {})
        }
        continue
      }

      if (parsed.type === 'approve') {
        const by = parsed.reviewedBy || fromUser
        console.log(`    → 承認: ${parsed.slug}  by: ${by}`)

        if (!apply) {
          console.log(`    [dry-run] 書き込みをスキップ`)
          continue
        }

        const result = approvePost(parsed.slug, by)
        if (!result.ok) {
          console.log(`    ❌ 承認エラー: ${result.error}`)
          await sendTelegram(
            botToken, msgChatId || defaultChatId,
            `❌ 承認エラー\nスラグ: ${parsed.slug}\n理由: ${result.error}`,
          ).catch(() => {})
          continue
        }
        console.log(`    ✅ 承認完了: ${result.slug}`)

        // validate:posts
        const vr = runNpm('validate:posts')
        const validateLine = vr.ok ? `✅ validate:posts: OK` : `⚠️ validate:posts: エラー\n${vr.output.slice(0, 200)}`
        console.log(`    validate:posts: ${vr.ok ? 'OK' : 'エラー'}`)

        // build（--build 指定時のみ）
        let buildLine = ''
        if (build) {
          console.log(`    🔨 build 実行中…`)
          const br = runNpm('build')
          buildLine = br.ok ? `\n✅ build: OK` : `\n❌ build: 失敗\n${br.output.slice(0, 300)}`
        }

        const replyText = [
          `✅ 承認完了: ${result.slug}`,
          `reviewed_by: ${result.reviewedBy}`,
          `date: ${result.today}`,
          ``,
          validateLine,
          buildLine,
          ``,
          `次のステップ（Human が手動実行）:`,
          `  git add content/posts/${result.slug}.md`,
          `  git commit -m "approve: ${result.slug}"`,
          `  git push`,
        ].join('\n')

        await sendTelegram(botToken, msgChatId || defaultChatId, replyText).catch((e) => {
          console.log(`    ⚠️ Telegram 返信失敗: ${e.message}`)
        })
        continue
      }

      if (parsed.type === 'reject') {
        console.log(`    → 差し戻し: ${parsed.slug}  reason: "${parsed.reason || '（理由なし）'}"`)

        if (!apply) {
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
      // 既に処理済みの update_id はスキップ
      if (knownRequestIds.has(upd.update_id)) {
        console.log(`    ⏭ スキップ: update_id ${upd.update_id} は処理済み`)
        continue
      }

      const category = detectCategory(parsed.text)
      console.log(`    → 記事リクエスト  カテゴリ推定: ${category}`)

      if (!apply) {
        const slugBase = makeSlug(parsed.text) || `req-${upd.update_id}`
        console.log(`    [dry-run] 推定スラグ: ${getTodayJst()}-${slugBase}`)
        continue
      }

      const result = generateDraft(parsed.text, upd.update_id, fromUser)
      console.log(`    ✅ 下書き生成: ${result.slug}`)

      const replyText = [
        `📝 記事リクエスト受信 → 下書き生成完了`,
        `━━━━━━━━━━━━━━━━━━`,
        `タイトル : ${parsed.text.slice(0, 50)}`,
        `スラグ   : ${result.slug}`,
        `カテゴリ : ${result.category}`,
        `ファイル : content/posts/${result.filename}`,
        ``,
        `▼ 承認（このチャットに送信）:`,
        `approve ${result.slug} by <名前>`,
        ``,
        `▼ 差し戻し:`,
        `reject ${result.slug} <理由>`,
        ``,
        `▼ 画像割当（ローカルで実行）:`,
        `npm run image:suggest -- ${result.slug}`,
        `npm run image:assign -- ${result.slug} --image <id> --apply`,
      ].join('\n')

      if (defaultChatId || msgChatId) {
        await sendTelegram(botToken, msgChatId || defaultChatId, replyText).catch((e) => {
          console.log(`    ⚠️ Telegram 返信失敗: ${e.message}`)
        })
      }
    }
  } // end for updates

  // --apply 時のみ last_update_id を更新（dry-run では変更しない）
  if (apply && maxUpdateId > (store.last_update_id ?? 0)) {
    const freshStore = loadRequests()
    freshStore.last_update_id = maxUpdateId
    saveRequests(freshStore)
    console.log()
    console.log(`  last_update_id を更新: ${maxUpdateId}`)
  }

  console.log()
  console.log(BAR)
  if (!apply) {
    console.log('dry-run 完了 — 書き込みなし。実行するには:')
    console.log('  npm run telegram:ops -- --apply')
    console.log('  npm run telegram:ops -- --apply --build')
  } else {
    console.log('完了')
  }
  console.log(BAR)
}

main()
