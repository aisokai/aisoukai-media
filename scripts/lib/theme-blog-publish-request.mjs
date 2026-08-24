import { THEME_BLOG_DRAFT_ARTIFACT_SCHEMA } from './theme-blog-draft-artifact.mjs'
import { THEME_BLOG_APPROVAL_READINESS_SCHEMA } from './theme-blog-approval-readiness.mjs'
import { THEME_BLOG_APPROVAL_DECISION_SCHEMA } from './theme-blog-approval-decision.mjs'

// This is a local, execution-disabled adapter. It creates immutable metadata
// for a separately-authorized future Human Gate and never performs publishing,
// sending, dispatching, I/O, model, network, UI, or runtime work.
export const THEME_BLOG_PUBLISH_REQUEST_SCHEMA = 'theme-blog-publish-request.v1'

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
  throw new Error(`theme-blog publish request is invalid: ${message}`)
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

function cloneDraft(value, label) {
  assertExactKeys(value, ['title', 'body'], label)
  return {
    title: safeText(value.title, `${label}.title`),
    body: safeText(value.body, `${label}.body`),
  }
}

function requireInactiveFlags(value, flags, label) {
  for (const flag of flags) {
    if (value[flag] !== false) fail(`${label} ${flag} must be inactive`)
  }
}

function validateDraftArtifact(value) {
  assertExactKeys(value, [
    'schema_version', 'mode', 'status', 'generated', 'routed', 'approved',
    'published', 'dispatched', 'topic_id', 'request', 'draft', 'integrity_lineage',
  ], 'draft artifact')
  if (value.schema_version !== THEME_BLOG_DRAFT_ARTIFACT_SCHEMA
    || value.mode !== 'post_model_draft_artifact'
    || value.status !== 'draft_ready_for_review') fail('draft artifact schema or status does not match')
  requireInactiveFlags(value, ['generated', 'routed', 'approved', 'published', 'dispatched'], 'draft artifact')
  const topicId = safeText(value.topic_id, 'draft artifact.topic_id')
  if (!TOPIC_ID_RE.test(topicId)) fail('draft artifact.topic_id has an invalid format')
  const draft = cloneDraft(value.draft, 'draft artifact.draft')
  const integrityLineage = cloneLineage(value.integrity_lineage, 'draft artifact.integrity_lineage')
  if (integrityLineage.source_theme_topic_id !== topicId) fail('draft artifact lineage topic does not match topic_id')
  return { topicId, draft, integrityLineage }
}

function validateApprovalReadiness(value) {
  assertExactKeys(value, [
    'schema_version', 'mode', 'status', 'reviewed', 'auto_approved', 'approved',
    'published', 'dispatched', 'topic_id', 'draft', 'integrity_lineage',
  ], 'approval readiness')
  if (value.schema_version !== THEME_BLOG_APPROVAL_READINESS_SCHEMA
    || value.mode !== 'pending_human_review_approval_readiness'
    || value.status !== 'pending_human_review') fail('approval readiness schema or status does not match')
  requireInactiveFlags(value, ['reviewed', 'auto_approved', 'approved', 'published', 'dispatched'], 'approval readiness')
  const topicId = safeText(value.topic_id, 'approval readiness.topic_id')
  if (!TOPIC_ID_RE.test(topicId)) fail('approval readiness.topic_id has an invalid format')
  const draft = cloneDraft(value.draft, 'approval readiness.draft')
  const integrityLineage = cloneLineage(value.integrity_lineage, 'approval readiness.integrity_lineage')
  if (integrityLineage.source_theme_topic_id !== topicId) fail('approval readiness lineage topic does not match topic_id')
  return { topicId, draft, integrityLineage }
}

function validateApprovedDecision(value) {
  assertExactKeys(value, [
    'schema_version', 'mode', 'status', 'reviewed', 'auto_approved', 'approved',
    'published', 'dispatched', 'topic_id', 'draft', 'integrity_lineage',
  ], 'approval decision')
  if (value.schema_version !== THEME_BLOG_APPROVAL_DECISION_SCHEMA
    || value.mode !== 'pending_human_review_approval_decision'
    || value.status !== 'approved') fail('approval decision schema or status does not match')
  if (value.reviewed !== true || value.auto_approved !== false || value.approved !== true
    || value.published !== false || value.dispatched !== false) {
    fail('approval decision flags must be an approved, unexecuted Human decision')
  }
  const topicId = safeText(value.topic_id, 'approval decision.topic_id')
  if (!TOPIC_ID_RE.test(topicId)) fail('approval decision.topic_id has an invalid format')
  const draft = cloneDraft(value.draft, 'approval decision.draft')
  const integrityLineage = cloneLineage(value.integrity_lineage, 'approval decision.integrity_lineage')
  if (integrityLineage.source_theme_topic_id !== topicId) fail('approval decision lineage topic does not match topic_id')
  return { topicId, draft, integrityLineage }
}

function assertSameArtifact(left, right, leftLabel, rightLabel) {
  if (left.topicId !== right.topicId) fail(`${leftLabel} topic does not match ${rightLabel}`)
  if (left.draft.title !== right.draft.title || left.draft.body !== right.draft.body) {
    fail(`${leftLabel} draft does not match ${rightLabel}`)
  }
  for (const key of LINEAGE_KEYS) {
    if (left.integrityLineage[key] !== right.integrityLineage[key]) {
      fail(`${leftLabel} integrity lineage does not match ${rightLabel}`)
    }
  }
}

/**
 * Adapts three validated synthetic review artifacts to an immutable, local
 * request. The request is permanently execution-disabled and awaits a future
 * separately-authorized Human Gate.
 */
export function buildThemeBlogPublishRequest(draftArtifact, approvalReadiness, approvalDecision) {
  const draft = validateDraftArtifact(draftArtifact)
  const readiness = validateApprovalReadiness(approvalReadiness)
  const decision = validateApprovedDecision(approvalDecision)
  assertSameArtifact(draft, readiness, 'draft artifact', 'approval readiness')
  assertSameArtifact(draft, decision, 'draft artifact', 'approval decision')

  return deepFreeze({
    schema_version: THEME_BLOG_PUBLISH_REQUEST_SCHEMA,
    mode: 'awaiting_human_gate_blog_publish_request',
    status: 'awaiting_human_gate',
    execution_authorized: false,
    human_gate_required: true,
    reviewed: true,
    auto_approved: false,
    approved: true,
    published: false,
    dispatched: false,
    topic_id: draft.topicId,
    draft: { ...draft.draft },
    integrity_lineage: { ...draft.integrityLineage },
  })
}

export const buildBlogPublishRequest = buildThemeBlogPublishRequest
