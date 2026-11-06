import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(__dirname, '..', '..')
export const SNS_DRAFTS_DIR = join(ROOT, 'content', 'sns-drafts')

export const VALID_PLATFORMS = ['instagram', 'x', 'line', 'youtube', 'website']
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
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}-(instagram|x|line|youtube|website)-.+\.md$/

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

