import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(__dirname, '..', '..')
export const SNS_DRAFTS_DIR = join(ROOT, 'content', 'sns-drafts')

export const VALID_PLATFORMS = ['instagram', 'x', 'line', 'youtube', 'website', 'threads', 'facebook']
export const VALID_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'posted', 'archived']
export const VALID_MEDICAL_RISK = ['low', 'medium', 'high']
export const REQUIRED_FIELDS = [
  'channel',
  'platform',
  'title',
  'date',
  'status',
  'reviewed',
  'approved_for_manual_post',
  'ai_generated',
  'medical_risk',
  'source_topic_id',
  'publish_mode',
]

// publish_mode: manual_only = Human 手動投稿承認 / ai_mutual_review = AI 相互監視 (policy aisoukai-media-tiered-blog-sns-2026-11-06)
export const VALID_PUBLISH_MODES = ['manual_only', 'ai_mutual_review']
export const MUTUAL_REVIEW_STATES = ['pending', 'passed', 'changes_requested', 'escalated']
export const REVIEWED_MUTUAL_STATES = ['passed', 'changes_requested', 'escalated']
export const EXCEPTION_CATEGORIES = [
  'patient_identifiable',
  'individual_consultation',
  'complaint',
  'reviewer_disagreement',
  'other',
]
// mutual_review.state ごとに許可する status (§2-3)
const STATE_ALLOWED_STATUSES = {
  pending: ['draft', 'pending_review'],
  changes_requested: ['draft', 'pending_review'],
  passed: ['pending_review', 'approved', 'posted'],
  escalated: ['draft', 'pending_review', 'rejected', 'archived'],
}
const CONTENT_HASH_RE = /^[0-9a-f]{64}$/

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// 短文フォーマット検証の対象 (指示書D §5)
export const SHORT_FORM_PLATFORMS = ['x', 'threads']
// お知らせ投稿の種別。frontmatter の notice_type (任意) で宣言する
export const NOTICE_TYPES = ['temporary_closure_notice', 'schedule_change_notice']
// 文字数上限・ハッシュタグ個数上限は公式情報で未確認のため、推測でハードコードせず上限チェックを行わない
// (content/sns-drafts/README.md の「短文フォーマット」に未確認と記録。確認後に値と根拠を記録して追加する)

// platform 部分は VALID_PLATFORMS から生成する (enum とファイル名規則を二重管理しない)
const FILENAME_RE = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-(${VALID_PLATFORMS.join('|')})-.+\\.md$`)

export function toDateStr(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

export function normalizeDraftData(data) {
  const out = { ...data }
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) out[key] = toDateStr(value)
  }
  return out
}

// identity は `<system>:<run-id>` 形式。system (`:` の前) を系統判定に使う
export function parseIdentity(value) {
  if (typeof value !== 'string') return null
  const i = value.indexOf(':')
  if (i <= 0) return null
  const system = value.slice(0, i).trim()
  const runId = value.slice(i + 1).trim()
  if (!system || !runId || /\s/.test(value)) return null
  return { system: system.toLowerCase(), runId }
}

// media_files は repo 相対パスのみ。絶対パス・..・空セグメント・ドットで始まるセグメント (.env* 等) は拒否
// SNS メディアとして読み込みを許可する領域 (先生の決定 2026-11-06: public/images/ 配下のみ)
export const MEDIA_ALLOWED_PREFIX = 'public/images/'

export function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.trim() === '') return false
  if (value.startsWith('/') || value.includes('\\')) return false
  return !value.split('/').some((seg) => seg === '' || seg.startsWith('.'))
}

// 許可領域 (public/images/ 配下) 内の安全な相対パスであること
export function isAllowedMediaPath(value) {
  return isSafeRelativePath(value) && value.startsWith(MEDIA_ALLOWED_PREFIX) && value.length > MEDIA_ALLOWED_PREFIX.length
}

function validateMutualReviewData(data, errors) {
  if (parseIdentity(data.created_by) === null) {
    errors.push('created_by が <system>:<run-id> 形式ではありません (ai_mutual_review では必須)')
  }

  if (data.media_files !== undefined && data.media_files !== null) {
    if (!Array.isArray(data.media_files)) {
      errors.push('media_files は配列である必要があります')
    } else {
      for (const p of data.media_files) {
        if (!isAllowedMediaPath(p)) errors.push(`media_files に不正なパスがあります: "${p}" (${MEDIA_ALLOWED_PREFIX} 配下の repo 相対パスのみ)`)
      }
    }
  }

  if (data.approved_for_manual_post === true) {
    errors.push('ai_mutual_review では approved_for_manual_post を true にできません (手動投稿承認との混在禁止)')
  }

  const review = data.mutual_review
  if (review === undefined || review === null || typeof review !== 'object' || Array.isArray(review)) {
    errors.push('mutual_review ブロックがありません (ai_mutual_review では必須)')
    return
  }

  const state = review.state
  if (!MUTUAL_REVIEW_STATES.includes(state)) {
    errors.push(`mutual_review.state が無効です: "${state}" (許可値: ${MUTUAL_REVIEW_STATES.join(' / ')})`)
    return
  }

  const allowedStatuses = STATE_ALLOWED_STATUSES[state]
  if (data.status !== undefined && !allowedStatuses.includes(data.status)) {
    errors.push(`mutual_review.state が ${state} のとき status "${data.status}" は許可されていません (許可: ${allowedStatuses.join(' / ')})`)
  }

  if (data.status === 'approved' && state !== 'passed') {
    errors.push('status が approved ですが mutual_review.state が passed ではありません')
  }

  if (REVIEWED_MUTUAL_STATES.includes(state)) {
    for (const key of ['reviewed_by', 'reviewed_at', 'content_hash', 'evidence_id']) {
      if (review[key] === undefined || review[key] === null || review[key] === '') {
        errors.push(`mutual_review.${key} がありません (state: ${state})`)
      }
    }
    if (review.reviewed_by && parseIdentity(review.reviewed_by) === null) {
      errors.push('mutual_review.reviewed_by が <system>:<run-id> 形式ではありません')
    }
    if (review.content_hash && !CONTENT_HASH_RE.test(String(review.content_hash))) {
      errors.push('mutual_review.content_hash が SHA-256 hex (小文字64桁) ではありません')
    }
    // 互換用 top-level 写し (§2-3)。正本は mutual_review 側で、写しとの不一致はエラー
    if (data.reviewed !== true) errors.push(`state: ${state} では top-level の reviewed が true である必要があります`)
    if (String(data.reviewed_by ?? '') !== String(review.reviewed_by ?? '')) {
      errors.push('top-level の reviewed_by が mutual_review.reviewed_by と一致しません')
    }
    if (String(data.reviewed_at ?? '') !== String(review.reviewed_at ?? '')) {
      errors.push('top-level の reviewed_at が mutual_review.reviewed_at と一致しません')
    }
  }

  if (state === 'escalated') {
    if (!EXCEPTION_CATEGORIES.includes(review.exception_category)) {
      errors.push(`state: escalated では mutual_review.exception_category が必須です (許可値: ${EXCEPTION_CATEGORIES.join(' / ')})`)
    }
  } else if (review.exception_category !== undefined && review.exception_category !== null) {
    errors.push('mutual_review.exception_category は state: escalated のときのみ指定できます')
  }
}

// ---- 短文フォーマット (x / threads) ----

// 日本語に隣接するタグ (本文#予防歯科) も検出する。URL の fragment は URL を除去してから判定する
const HASHTAG_RE = /#[^\s#　]+/u
const URL_RE = /https?:\/\/[^\s)）」』>]+/g

// 見出し行 (`## 本文` 等) を除いた本文行
function bodyLines(content) {
  return String(content ?? '').replace(/\r\n/g, '\n').split('\n').filter((line) => !/^#{1,6}\s/.test(line))
}

function isHashtagOnlyLine(line) {
  const tokens = line.trim().split(/[\s　]+/).filter(Boolean)
  return tokens.length > 0 && tokens.every((t) => /^#[^#]+$/u.test(t))
}

export function checkShortFormFormat(content) {
  const errors = []
  const warnings = []
  const lines = bodyLines(content)
  let end = lines.length
  while (end > 0 && lines[end - 1].trim() === '') end -= 1
  let start = end
  while (start > 0 && isHashtagOnlyLine(lines[start - 1])) start -= 1
  const misplaced = lines.slice(0, start).some((line) => HASHTAG_RE.test(line.replace(URL_RE, '')))
  if (misplaced) errors.push('ハッシュタグは本文の末尾にまとめてください (x / threads の短文フォーマット)')
  const urls = String(content ?? '').match(URL_RE) ?? []
  if (urls.length > 1) warnings.push(`リンクが ${urls.length} 件あります (短文フォーマットでは1件までを推奨)`)
  return { errors, warnings }
}

// ---- お知らせ投稿 (notice_type) の日付・曜日・時刻 ----

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const WEEKDAY_SUFFIX = String.raw`(?:\s*[（(]\s*([日月火水木金土])(?:曜日?)?\s*[）)])?`
const DATE_PATTERNS = [
  new RegExp(String.raw`(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日` + WEEKDAY_SUFFIX, 'g'),
  new RegExp(String.raw`(?<![\d年])()(\d{1,2})月\s*(\d{1,2})日` + WEEKDAY_SUFFIX, 'g'),
  new RegExp(String.raw`(\d{4})-(\d{2})-(\d{2})` + WEEKDAY_SUFFIX, 'g'),
  new RegExp(String.raw`(?<![\d/])()(\d{1,2})\/(\d{1,2})(?![\d/])` + WEEKDAY_SUFFIX, 'g'),
]
const TIME_RE = /(?<!\d)(\d{1,2})[:：](\d{2})(?!\d)|(?<!\d)(\d{1,2})時(?:(\d{1,2})分|(半))?/g

function pad2(n) {
  return String(n).padStart(2, '0')
}

function isValidDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

// 本文中の日付記載を抽出する。年の省略は frontmatter date の年で補う
export function extractNoticeDates(content, defaultYear) {
  const found = []
  const text = String(content ?? '')
  // 年付きのパターンを先に評価し、既に抽出した範囲と重なる一致は採用しない (年の補完による誤一致を防ぐ)
  const taken = []
  const overlaps = (start, end) => taken.some(([a, b]) => start < b && a < end)
  for (const re of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index
      const end = m.index + m[0].length
      if (overlaps(start, end)) continue
      taken.push([start, end])
      const y = m[1] ? Number(m[1]) : defaultYear
      const mo = Number(m[2])
      const d = Number(m[3])
      found.push({ text: m[0], year: y, month: mo, day: d, weekday: m[4] ?? null, valid: isValidDate(y, mo, d) })
    }
  }
  return found
}

export function checkNoticeConsistency(data, content) {
  const errors = []
  const dateStr = toDateStr(data.date)
  if (!DATE_RE.test(dateStr)) return { errors }
  const [fy, fm, fd] = dateStr.split('-').map(Number)
  const dates = extractNoticeDates(content, fy)
  if (dates.length === 0) {
    errors.push(`お知らせ投稿の本文に日付の記載がありません (frontmatter date: ${dateStr})`)
  }
  for (const item of dates) {
    if (!item.valid) {
      errors.push(`お知らせ投稿の日付が存在しません: "${item.text}"`)
      continue
    }
    if (item.weekday) {
      const actual = WEEKDAYS[new Date(Date.UTC(item.year, item.month - 1, item.day)).getUTCDay()]
      if (actual !== item.weekday) {
        errors.push(`お知らせ投稿の曜日が日付と一致しません: "${item.text}" (${item.year}-${pad2(item.month)}-${pad2(item.day)} は${actual}曜日)`)
      }
    }
  }
  if (dates.length > 0 && !dates.some((x) => x.year === fy && x.month === fm && x.day === fd)) {
    errors.push(`お知らせ投稿の本文の日付が frontmatter の date (${dateStr}) と一致しません`)
  }
  for (const m of String(content ?? '').matchAll(TIME_RE)) {
    const h = Number(m[1] ?? m[3])
    const min = m[2] !== undefined ? Number(m[2]) : m[4] !== undefined ? Number(m[4]) : m[5] !== undefined ? 30 : 0
    if (h > 24 || min > 59 || (h === 24 && min > 0)) errors.push(`お知らせ投稿の時刻が不正です: "${m[0]}"`)
  }
  return { errors }
}

export function isDraftMarkdownFile(filename) {
  return filename.endsWith('.md') && filename !== 'README.md'
}

export function validateSnsDraftData(filename, data, content) {
  const errors = []
  const warnings = []

  if (!FILENAME_RE.test(filename)) {
    errors.push('ファイル名が YYYY-MM-DD-<platform>-slug.md 形式ではありません')
  }

  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`${field} フィールドがありません`)
    }
  }

  if (typeof data.title === 'string' && data.title.trim() === '') {
    errors.push('title が空です')
  }

  if (data.channel !== undefined && data.channel !== data.platform) {
    errors.push(`channel (${data.channel}) と platform (${data.platform}) が一致しません`)
  }

  if (data.platform !== undefined && !VALID_PLATFORMS.includes(data.platform)) {
    errors.push(`platform が無効です: "${data.platform}"`)
  }

  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    errors.push(`status が無効です: "${data.status}"`)
  }

  if (data.reviewed !== undefined && typeof data.reviewed !== 'boolean') {
    errors.push(`reviewed が boolean ではありません (実際の型: ${typeof data.reviewed})`)
  }

  if (data.approved_for_manual_post !== undefined && typeof data.approved_for_manual_post !== 'boolean') {
    errors.push(`approved_for_manual_post が boolean ではありません (実際の型: ${typeof data.approved_for_manual_post})`)
  }

  if (data.ai_generated !== undefined && typeof data.ai_generated !== 'boolean') {
    errors.push(`ai_generated が boolean ではありません (実際の型: ${typeof data.ai_generated})`)
  }

  if (data.medical_risk !== undefined && !VALID_MEDICAL_RISK.includes(data.medical_risk)) {
    errors.push(`medical_risk が無効です: "${data.medical_risk}"`)
  }

  if (data.publish_mode !== undefined && data.publish_mode !== null && !VALID_PUBLISH_MODES.includes(data.publish_mode)) {
    errors.push(`publish_mode が無効です: "${data.publish_mode}" (許可値: ${VALID_PUBLISH_MODES.join(' / ')})`)
  }

  if (data.publish_mode === 'manual_only') {
    // 共存ルール: 手動投稿承認の経路に相互監視の項目を混在させない
    if (data.mutual_review !== undefined) errors.push('manual_only のドラフトに mutual_review を含めることはできません')
    if (data.created_by !== undefined) errors.push('manual_only のドラフトに created_by を含めることはできません')
  } else if (data.publish_mode === 'ai_mutual_review') {
    validateMutualReviewData(data, errors)
  }

  if (data.date !== undefined) {
    const dateStr = toDateStr(data.date)
    if (!DATE_RE.test(dateStr)) {
      errors.push(`date の形式が不正です: "${dateStr}" (YYYY-MM-DD が必要)`)
    } else if (FILENAME_RE.test(filename)) {
      const filenameDate = filename.slice(0, 10)
      if (dateStr !== filenameDate) {
        errors.push(`date (${dateStr}) がファイル名の日付 (${filenameDate}) と一致しません`)
      }
    }
  }

  if (data.notice_type !== undefined && data.notice_type !== null) {
    if (!NOTICE_TYPES.includes(data.notice_type)) {
      errors.push(`notice_type が無効です: "${data.notice_type}" (許可値: ${NOTICE_TYPES.join(' / ')})`)
    } else {
      errors.push(...checkNoticeConsistency(data, content).errors)
    }
  }

  if (SHORT_FORM_PLATFORMS.includes(data.platform)) {
    const shortForm = checkShortFormFormat(content)
    errors.push(...shortForm.errors)
    warnings.push(...shortForm.warnings)
  }

  if (data.publish_mode === 'manual_only' && data.status === 'approved' && data.approved_for_manual_post !== true) {
    warnings.push('status が approved ですが approved_for_manual_post が true ではありません')
  }

  if (!content || content.trim() === '') {
    errors.push('本文が空です')
  }

  return { errors, warnings }
}

export function readSnsDraftFile(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  return {
    file: basename(filePath),
    data: normalizeDraftData(parsed.data),
    content: parsed.content,
  }
}

export function validateSnsDraftFile(filePath) {
  const draft = readSnsDraftFile(filePath)
  return {
    ...draft,
    ...validateSnsDraftData(draft.file, draft.data, draft.content),
  }
}

export function listSnsDraftFiles(dir = SNS_DRAFTS_DIR) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(isDraftMarkdownFile)
    .sort()
    .map((file) => join(dir, file))
}

