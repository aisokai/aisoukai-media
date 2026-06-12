// manual-post.mjs
// 手動投稿 (お知らせ / ブログ) のリクエスト受付と下書き Markdown 生成の共有モジュール。
// 入口は 3 つ: MitaniOS DMP 管理画面 / Telegram の /draft コマンド / CLI。
//
// 安全設計:
//   - このモジュールは公開・commit・push を行わない (ファイル生成と状態更新のみ)
//   - 下書きは必ず publication_status: draft / legal: pending / image: pending で生成する
//   - human_approved への遷移は approveManualPost のみ。Human の明示操作
//     (--by 承認者名 必須) でしか呼ばれない
//   - 入力テキストは redactSecrets を通してから保存する

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import {
  ROOT, detectMedicalAdWarnings, getJstTimestamp, getTodayJst, redactSecrets,
} from './media-queue.mjs'
import { pickArticleImage } from './auto-post-image.mjs'

export const MANUAL_POST_REQUESTS_DIR = join(ROOT, 'data', 'manual-post-requests')
export const POSTS_DIR = join(ROOT, 'content', 'posts')

export const POST_TYPES = Object.freeze(['notice', 'blog'])
export const POST_TYPE_LABELS = Object.freeze({ notice: 'お知らせ', blog: 'ブログ記事' })
export const REQUEST_STATUSES = Object.freeze(['pending', 'drafted', 'ignored'])
export const REQUEST_SOURCES = Object.freeze(['telegram', 'mitanios-dmp', 'cli'])

const CLINIC_NAME = '医療法人藍想会'
const AUTHOR = '藍想会メディア編集部'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ── 種別推定 ──────────────────────────────────────────────────

const NOTICE_KEYWORD_RE = /(休診|休業|診療時間|営業時間|受付時間|時間変更|年末年始|お盆|祝日|臨時|台風|大雨|大雪|地震|災害|お知らせ)/

/** 要点テキストから notice / blog を推定する */
export function inferPostType(text) {
  return NOTICE_KEYWORD_RE.test(String(text ?? '')) ? 'notice' : 'blog'
}

// ── 要点テキストの整形 ────────────────────────────────────────

// 書き手向けメタ指示 (「丁寧に」「記事を作って」等) は本文に混ぜない
const META_SENTENCE_RE = /(作って|書いて|作成して|まとめて|お願いします|お願いね|してください|丁寧に|やさしく|わかりやすく|分かりやすく)$/

export function splitSentences(text) {
  return String(text ?? '')
    .split(/[。\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** お知らせの案内項目を抽出する。メタ指示文は除外し、空なら原文をそのまま使う */
export function extractNoticeItems(instruction) {
  const sentences = splitSentences(instruction)
  const items = sentences.filter((s) => !META_SENTENCE_RE.test(s))
  return items.length > 0 ? items : [String(instruction ?? '').trim()]
}

// ── タイトル生成 ──────────────────────────────────────────────

const DATE_PHRASE_RE = /(\d{1,2}月\d{1,2}日(?:から|まで|より)?(?:午前|午後)?)/

/** お知らせタイトルを要点から生成する (例: 「6月20日午後の臨時休診のお知らせ」) */
export function buildNoticeTitle(instruction, titleHint = '') {
  const hint = String(titleHint ?? '').trim()
  if (hint) return hint
  const text = String(instruction ?? '')
  if (/年末年始/.test(text)) return '年末年始の診療についてのお知らせ'
  if (/(台風|大雨|大雪|地震|災害)/.test(text)) return '悪天候・災害時の診療についてのお知らせ'
  const base = /休診|休業/.test(text)
    ? '臨時休診のお知らせ'
    : /変更/.test(text)
      ? '診療時間変更のお知らせ'
      : 'お知らせ'
  const m = text.match(DATE_PHRASE_RE)
  if (!m) return base === 'お知らせ' ? '医院からのお知らせ' : base
  const phrase = m[1].replace(/(から|まで|より)$/, '')
  return `${phrase}の${base}`
}

/** 依頼文の尾部 (「〜をやさしく説明する記事を作って。」等) を除去する */
export function stripRequestTail(text) {
  return String(text ?? '').trim()
    .replace(/(について|を|の)?(やさしく|わかりやすく|分かりやすく|丁寧に)?(説明|解説|紹介)?(する)?(記事|ブログ|文章)?(を)?(作って|書いて|作成して|お願いします)。?$/, '')
    .replace(/[。、]+$/, '')
    .trim()
}

/** ブログタイトルを要点から生成する。title_hint があればそれを優先する */
export function buildBlogTitle(instruction, titleHint = '') {
  const hint = String(titleHint ?? '').trim()
  if (hint) return hint
  let t = stripRequestTail(instruction)
  // 「〜向けに…」は読者への呼びかけ形に変換する (人 → 方)
  const audience = t.match(/^(.+?)(人|方)?向け/)
  if (audience) {
    return `${audience[1]}${audience[2] ? '方' : ''}へ`.slice(0, 60)
  }
  return (t || 'ブログ記事下書き').slice(0, 48)
}

// ── slug / ファイル名 ─────────────────────────────────────────

/** 衝突しない slug を生成する (例: notice-20260620, notice-20260620-2) */
export function buildSlug({ postType, date, publishAt }) {
  const datePart = String(publishAt || date).replace(/-/g, '')
  const base = `${postType}-${datePart}`
  let slug = base
  let n = 2
  while (existsSync(join(POSTS_DIR, `${date}-${slug}.md`))) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

// ── 本文テンプレート ──────────────────────────────────────────

export function buildNoticeBody(items) {
  return [
    '患者の皆さまへ',
    '',
    'いつも当院をご利用いただきありがとうございます。診療に関するお知らせです。',
    '',
    '## ご案内内容',
    '',
    ...items.map((item) => `- ${item}`),
    '',
    '## 患者の皆さまへのお願い',
    '',
    'ご来院を予定されている皆さまにはご迷惑をおかけする場合がございますが、何卒ご理解のほどお願い申し上げます。',
    'ご不明な点がございましたら、お電話にてお問い合わせください。',
    '',
    CLINIC_NAME,
  ].join('\n') + '\n'
}

export function buildBlogBody({ title, instruction }) {
  return [
    `> 【編集メモ】この記事はテンプレート下書きです。公開前に本文を完成させ、Human 承認を行ってください。`,
    `> 依頼内容: ${instruction}`,
    '',
    '## はじめに',
    '',
    '（読者が抱える疑問や状況に共感する導入文を 2〜3 文で記載してください）',
    '',
    `## ${title}のポイント`,
    '',
    '（本論: 背景・仕組み・目安などを、医療効果の断定表現を避けて記載してください）',
    '',
    '## 受診・相談の目安',
    '',
    '（どのようなときに受診や相談を検討するとよいか、やさしい表現で記載してください）',
    '',
    '## まとめ',
    '',
    '（要点を 2〜3 文でまとめてください。受診を促す場合も断定しないでください）',
  ].join('\n') + '\n'
}

// ── リクエスト保存 / 一覧 / 更新 ──────────────────────────────

export function generateRequestId(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const datePart = jst.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 8)
  return `req-${datePart}-${rand}`
}

/**
 * 下書きリクエストを data/manual-post-requests/<id>.json に保存する。
 * Telegram / MitaniOS DMP / CLI の全入口がここを通る。保存のみで公開判定はしない。
 */
export function createManualPostRequest({
  source, rawInstruction, postType = '', titleHint = '', publishAt = '',
  requestedBy = '', dryRun = false,
}) {
  const instruction = redactSecrets(String(rawInstruction ?? '').trim())
  if (!instruction) throw new Error('要点 (raw_instruction) が空です')
  if (!REQUEST_SOURCES.includes(source)) throw new Error(`source が無効です: "${source}"`)
  const type = POST_TYPES.includes(postType) ? postType : inferPostType(instruction)
  const cleanPublishAt = DATE_RE.test(String(publishAt ?? '')) ? publishAt : ''

  const request = {
    id: generateRequestId(),
    source,
    post_type: type,
    raw_instruction: instruction,
    title_hint: redactSecrets(String(titleHint ?? '').trim()).slice(0, 120),
    publish_at: cleanPublishAt,
    status: 'pending',
    requested_by: String(requestedBy ?? '').slice(0, 60),
    created_at: getJstTimestamp(),
  }
  if (!dryRun) {
    mkdirSync(MANUAL_POST_REQUESTS_DIR, { recursive: true })
    writeFileSync(requestPath(request.id), JSON.stringify(request, null, 2) + '\n', { flag: 'wx' })
  }
  return request
}

export function requestPath(id) {
  return join(MANUAL_POST_REQUESTS_DIR, `${id}.json`)
}

export function loadManualPostRequest(id) {
  const path = requestPath(String(id ?? ''))
  if (!/^req-[a-z0-9][a-z0-9-]{0,80}$/.test(String(id ?? '')) || !existsSync(path)) {
    throw new Error(`リクエストが見つかりません: ${id}`)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function listManualPostRequests({ status } = {}) {
  if (!existsSync(MANUAL_POST_REQUESTS_DIR)) return []
  const requests = []
  for (const f of readdirSync(MANUAL_POST_REQUESTS_DIR)) {
    if (!f.endsWith('.json')) continue
    try {
      const req = JSON.parse(readFileSync(join(MANUAL_POST_REQUESTS_DIR, f), 'utf8'))
      if (req?.id && (!status || req.status === status)) requests.push(req)
    } catch {
      // 壊れた JSON は一覧から除外する (削除はしない)
    }
  }
  return requests.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

export function updateManualPostRequest(id, patch) {
  const request = loadManualPostRequest(id)
  const updated = { ...request, ...patch, id: request.id, updated_at: getJstTimestamp() }
  writeFileSync(requestPath(request.id), JSON.stringify(updated, null, 2) + '\n')
  return updated
}

// ── 下書き生成 ────────────────────────────────────────────────

/**
 * 下書き Markdown を組み立てる (書き込みはしない)。
 * frontmatter は必ず draft / pending / pending。画像は image-library から自動選択し、
 * 選べない場合は auto-post-image 側の general / announcement 系 fallback を使う。
 */
export function buildManualPostDraft({
  postType, instruction, titleHint = '', publishAt = '', date = getTodayJst(), requestId = '',
}) {
  if (!POST_TYPES.includes(postType)) throw new Error(`post_type が無効です: "${postType}"`)
  const cleanInstruction = redactSecrets(String(instruction ?? '').trim())
  if (!cleanInstruction) throw new Error('要点 (instruction) が空です')
  if (!DATE_RE.test(date)) throw new Error(`date の形式が不正です: "${date}"`)
  const cleanPublishAt = DATE_RE.test(String(publishAt ?? '')) ? publishAt : date

  const warnings = []
  let title, body, excerpt, tags, requestedCategory

  if (postType === 'notice') {
    title = buildNoticeTitle(cleanInstruction, titleHint)
    const items = extractNoticeItems(cleanInstruction)
    body = buildNoticeBody(items)
    excerpt = `${CLINIC_NAME}からのお知らせです。${items[0]}。詳しくは本文をご覧ください。`
    requestedCategory = 'お知らせ'
    tags = ['お知らせ']
    if (/休診|休業/.test(cleanInstruction)) tags.push('臨時休診')
    if (/(診療時間|営業時間|受付時間).*変更|変更.*(診療時間|営業時間|受付時間)/s.test(cleanInstruction)) tags.push('診療時間')
  } else {
    title = buildBlogTitle(cleanInstruction, titleHint)
    body = buildBlogBody({ title, instruction: cleanInstruction })
    excerpt = stripRequestTail(cleanInstruction).slice(0, 110) || title
    requestedCategory = ''
    tags = []
    warnings.push('本文はテンプレート下書きです。公開前に Human が本文を完成させてください')
  }
  if (!String(titleHint ?? '').trim()) {
    warnings.push('タイトルは要点から自動生成しました。承認前に確認してください')
  }

  const picked = pickArticleImage({
    title, category: requestedCategory, excerpt, tags, bodyContent: body,
  })
  const category = postType === 'notice' ? 'お知らせ' : picked.category
  if (postType === 'blog') tags = [category, 'ブログ']

  warnings.push(...detectMedicalAdWarnings(`${title}\n${excerpt}\n${body}`))

  const slug = buildSlug({ postType, date, publishAt: cleanPublishAt })
  const filename = `${date}-${slug}.md`

  // 下書き段階の固定ステータス (Human 承認前に passed / human_approved にしない)
  const frontmatter = {
    title,
    date,
    publish_at: cleanPublishAt,
    category,
    excerpt,
    tags,
    author: AUTHOR,
    reviewed: false,
    auto_approved: false,
    publication_status: 'draft',
    legal_check_status: 'pending',
    image_check_status: 'pending',
    medical_risk: 'low',
    image: picked.image,
    image_alt: picked.image_alt,
    ai_generated: false,
    source: 'manual-post',
    ...(requestId ? { source_request_id: requestId } : {}),
    draft: true,
  }

  return {
    filename,
    slug,
    frontmatter,
    markdown: matter.stringify(body, frontmatter),
    warnings,
    image_reason: picked.reason,
  }
}

/** 下書きを content/posts に書き込む (上書き禁止) */
export function writeManualPostDraft(draft) {
  mkdirSync(POSTS_DIR, { recursive: true })
  const path = join(POSTS_DIR, draft.filename)
  writeFileSync(path, draft.markdown, { flag: 'wx' })
  return path
}

// ── Human 承認 ────────────────────────────────────────────────

const POST_FILENAME_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/

/**
 * Human 承認: reviewed:true + human_approved / passed / passed を付与する。
 * 必ず承認者名 (by) が必要。image / image_alt が無い記事は承認できない。
 */
export function approveManualPost({ file, by }) {
  const filename = String(file ?? '').trim()
  const approver = String(by ?? '').trim()
  if (!POST_FILENAME_RE.test(filename)) throw new Error(`ファイル名が不正です: "${filename}"`)
  if (!approver) throw new Error('承認者名 (--by) は必須です')
  const path = join(POSTS_DIR, filename)
  if (!existsSync(path)) throw new Error(`記事ファイルが見つかりません: content/posts/${filename}`)

  const parsed = matter(readFileSync(path, 'utf8'))
  const data = { ...parsed.data }
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Date) data[k] = v.toISOString().slice(0, 10)
  }
  if (!String(data.image ?? '').trim() || !String(data.image_alt ?? '').trim()) {
    throw new Error('image / image_alt が未設定のため承認できません')
  }

  const today = getTodayJst()
  data.reviewed = true
  data.draft = false
  data.auto_approved = false
  data.publication_status = 'human_approved'
  data.legal_check_status = 'passed'
  data.image_check_status = 'passed'
  data.reviewed_at = today
  data.reviewed_by = approver
  writeFileSync(path, matter.stringify(parsed.content, data))

  appendManualReviewLog({
    datetime: getJstTimestamp(),
    action: 'approve',
    slug: filename.replace(/\.md$/, ''),
    reviewed_by: approver,
    date: String(data.date ?? ''),
    publish_at: String(data.publish_at ?? ''),
  })
  return { filename, data }
}

// approve-post.mjs と同じ append-only フォーマットで logs/review-history.md に残す
function appendManualReviewLog(entry) {
  const logsDir = join(ROOT, 'logs')
  mkdirSync(logsDir, { recursive: true })
  const lines = [
    `## ${entry.datetime}`,
    `datetime: ${entry.datetime}`,
    `action: ${entry.action}`,
    `slug: ${entry.slug}`,
    `reviewed_by: ${entry.reviewed_by}`,
  ]
  if (entry.date) lines.push(`date: ${entry.date}`)
  if (entry.publish_at) lines.push(`publish_at: ${entry.publish_at}`)
  lines.push('')
  writeFileSync(join(logsDir, 'review-history.md'), lines.join('\n') + '\n', { flag: 'a' })
}
