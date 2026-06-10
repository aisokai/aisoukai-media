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

  if (data.publish_mode !== undefined && data.publish_mode !== 'manual_only') {
    errors.push(`publish_mode は manual_only のみ許可されています: "${data.publish_mode}"`)
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

  if (data.status === 'approved' && data.approved_for_manual_post !== true) {
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

