import { readFileSync } from 'node:fs'
import matter from 'gray-matter'

export const REQUIRED_LINEAGE_FIELDS = Object.freeze([
  'source_topic_id',
  'source_theme_topic_id',
  'source_theme_snapshot_id',
  'source_theme_snapshot_hash',
  'source_theme_row_version',
])

const QUALITY_MARKERS = Object.freeze([
  { pattern: /\bbrief\b/i, reason: 'prompt fragment: brief' },
  { pattern: /\b(?:undefined|null|NaN)\b/, reason: 'generated null-like value' },
  { pattern: /\[[^\]]*(?:TODO|要確認|出典|引用|placeholder)[^\]]*\]/i, reason: 'unresolved placeholder' },
  { pattern: /<\s*(?:title|body|article|section|placeholder)\s*>/i, reason: 'unresolved tag placeholder' },
  { pattern: /[A-Za-z]{4,}(?:月|日|年|ヶ|か月|ヶ月)/, reason: 'malformed mixed-language date expression' },
])

const SECRET_PRIVATE_MARKERS = Object.freeze([
  /\b(?:password|passwd|secret|private|api[_ -]?key|token|credential|private[_ -]?key|authorization|bearer)\b/i,
  /(?:個人情報|患者名|住所|電話番号|メールアドレス|診療録|カルテ)/i,
])

function text(value) {
  return String(value ?? '').trim()
}

function sameValue(actual, expected) {
  return expected === undefined || expected === null || text(actual) === text(expected)
}

function expectedLineageValue(expected, field) {
  if (!expected || typeof expected !== 'object') return undefined
  const aliases = {
    source_topic_id: ['source_topic_id', 'sourceTopicId', 'topicId'],
    source_theme_topic_id: ['source_theme_topic_id', 'sourceThemeTopicId', 'themeTopicId'],
    source_theme_snapshot_id: ['source_theme_snapshot_id', 'sourceThemeSnapshotId', 'snapshotId'],
    source_theme_snapshot_hash: ['source_theme_snapshot_hash', 'sourceThemeSnapshotHash', 'snapshotHash'],
    source_theme_row_version: ['source_theme_row_version', 'sourceThemeRowVersion', 'rowVersion'],
  }[field] ?? [field]
  for (const alias of aliases) {
    if (expected[alias] !== undefined) return expected[alias]
  }
  return undefined
}

function addIssue(issues, message) {
  if (!issues.includes(message)) issues.push(message)
}

export function auditBlogMarkdown(markdown, { expectedLineage } = {}) {
  const issues = []
  let parsed

  try {
    parsed = matter(String(markdown ?? ''))
  } catch (error) {
    return {
      ok: false,
      pass: false,
      status: 'FAIL',
      issues: [`frontmatter parse failed: ${error.message}`],
      frontmatter: {},
      body: '',
    }
  }

  const data = parsed.data ?? {}
  const body = text(parsed.content)

  const exactFields = {
    reviewed: false,
    draft: true,
    auto_approved: false,
    publication_status: 'draft',
    legal_check_status: 'pending',
    image_check_status: 'pending',
  }
  for (const [field, expected] of Object.entries(exactFields)) {
    if (data[field] !== expected) addIssue(issues, `${field} must be ${String(expected)}`)
  }

  for (const field of REQUIRED_LINEAGE_FIELDS) {
    if (!text(data[field])) addIssue(issues, `missing lineage field: ${field}`)
    const expected = expectedLineageValue(expectedLineage, field)
    if (!sameValue(data[field], expected)) addIssue(issues, `lineage mismatch: ${field}`)
  }

  if (text(data.source_topic_id) !== text(data.source_theme_topic_id)) {
    addIssue(issues, 'source_topic_id must remain the immutable theme topic id')
  }
  if (!text(data.title)) addIssue(issues, 'missing title')
  if (!body) addIssue(issues, 'missing body')
  if (!text(data.image)) addIssue(issues, 'missing image')
  if (!text(data.image_alt)) addIssue(issues, 'missing image_alt')

  for (const marker of QUALITY_MARKERS) {
    if (marker.pattern.test(`${text(data.title)}\n${body}`)) addIssue(issues, marker.reason)
  }
  for (const marker of SECRET_PRIVATE_MARKERS) {
    if (marker.test(String(markdown ?? ''))) addIssue(issues, 'secret/private marker detected')
  }

  const ok = issues.length === 0
  return {
    ok,
    pass: ok,
    status: ok ? 'PASS' : 'FAIL',
    issues,
    frontmatter: data,
    body,
    title: text(data.title),
  }
}

export function auditBlogDraftFile(filePath, options = {}) {
  return auditBlogMarkdown(readFileSync(filePath, 'utf8'), options)
}

export const auditGeneratedBlogDraft = auditBlogMarkdown
export const auditThemeBlogDraft = auditBlogMarkdown
