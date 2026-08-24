import { THEME_BLOG_APPROVAL_READINESS_SCHEMA } from './theme-blog-approval-readiness.mjs'

// This is a local, decision-only boundary. It prepares immutable metadata for
// a separately-authorized future Human Gate; it never obtains or executes one,
// and never mutates review state or performs downstream work.
export const THEME_BLOG_APPROVAL_DECISION_SCHEMA = 'theme-blog-approval-decision.v1'

const UNSAFE_MARKER_RE = /(private|secret|confidential|credential|password|api[\s_-]*(?:key|token)|access[\s_-]*(?:key|token)|authorization|bearer|\.env|dangerous|unsafe|do[\s_-]*not[\s_-]*use|個人情報|患者(?:データ|情報)|診療(?:情報|録)|カルテ|認証情報|パスワード|秘密|危険|使用禁止)/iu
const DANGEROUS_VALUE_RE = /^[=+\-@]/
const HASH_RE = /^[a-f0-9]{64}$/
const TOPIC_ID_RE = /^topic_[a-f0-9]{16}$/
const LINEAGE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const LINEAGE_KEYS = Object.freeze([
  'source_theme_topic_id',
  'source_theme_snapshot_id',
  'source_theme_snapshot_hash',
  'source_theme_row_version',
  'source_summary_hash',
  'audit_policy_version',
])

function fail(message) {
  throw new Error(`theme-blog approval decision is invalid: ${message}`)
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is not an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} keys do not match the fixed contract`)
  }
}

function safeText(value, label) {
  if (typeof value !== 'string') fail(`${label} is not text`)
  const text = value.trim()
  if (!text) fail(`${label} is missing`)
  if (DANGEROUS_VALUE_RE.test(text)) fail(`${label} has a dangerous flag`)
  if (UNSAFE_MARKER_RE.test(text)) fail(`${label} has a private or unsafe marker`)
  if (/\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) fail(`${label} has a control character`)
  return text
}

function cloneLineage(value, label) {
  assertExactKeys(value, LINEAGE_KEYS, label)
  const lineage = {}
  for (const key of LINEAGE_KEYS) lineage[key] = safeText(value[key], `${label}.${key}`)
  if (!TOPIC_ID_RE.test(lineage.source_theme_topic_id)) fail(`${label}.source_theme_topic_id has an invalid format`)
  if (!HASH_RE.test(lineage.source_theme_snapshot_hash) || !HASH_RE.test(lineage.source_summary_hash)) {
    fail(`${label} has an invalid integrity hash`)
  }
  for (const key of ['source_theme_snapshot_id', 'source_theme_row_version', 'audit_policy_version']) {
    if (!LINEAGE_TOKEN_RE.test(lineage[key])) fail(`${label}.${key} has an invalid lineage token`)
  }
  return lineage
}

function cloneDraft(value) {
  assertExactKeys(value, ['title', 'body'], 'approval readiness.draft')
  return {
    title: safeText(value.title, 'approval readiness.draft.title'),
    body: safeText(value.body, 'approval readiness.draft.body'),
  }
}

function validateApprovalReadiness(value) {
  assertExactKeys(value, [
    'schema_version', 'mode', 'status', 'reviewed', 'auto_approved', 'approved',
    'published', 'dispatched', 'topic_id', 'draft', 'integrity_lineage',
  ], 'approval readiness')
  if (value.schema_version !== THEME_BLOG_APPROVAL_READINESS_SCHEMA
    || value.mode !== 'pending_human_review_approval_readiness'
    || value.status !== 'pending_human_review') fail('approval readiness schema or status does not match')
  for (const flag of ['reviewed', 'auto_approved', 'approved', 'published', 'dispatched']) {
    if (value[flag] !== false) fail(`approval readiness ${flag} must be inactive`)
  }
  const topicId = safeText(value.topic_id, 'approval readiness.topic_id')
  if (!TOPIC_ID_RE.test(topicId)) fail('approval readiness.topic_id has an invalid format')
  const draft = cloneDraft(value.draft)
  const integrityLineage = cloneLineage(value.integrity_lineage, 'approval readiness.integrity_lineage')
  if (integrityLineage.source_theme_topic_id !== topicId) fail('approval readiness lineage topic does not match topic_id')
  return { topicId, draft, integrityLineage }
}

/**
 * Converts a validated immutable readiness value into an immutable decision
 * boundary. The returned status deliberately requires a later Human Gate.
 */
export function buildThemeBlogApprovalDecision(approvalReadiness) {
  const { topicId, draft, integrityLineage } = validateApprovalReadiness(approvalReadiness)
  return deepFreeze({
    schema_version: THEME_BLOG_APPROVAL_DECISION_SCHEMA,
    mode: 'pending_human_review_approval_decision',
    status: 'human_gate_required',
    reviewed: false,
    auto_approved: false,
    approved: false,
    published: false,
    dispatched: false,
    topic_id: topicId,
    draft,
    integrity_lineage: integrityLineage,
  })
}

export const buildApprovalDecision = buildThemeBlogApprovalDecision
