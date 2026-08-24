import { THEME_BLOG_DRAFT_ARTIFACT_SCHEMA } from './theme-blog-draft-artifact.mjs'

// This is a local, post-draft validation boundary. It only prepares an
// immutable value for a Human review queue; it never performs any downstream
// action, routing, model, network, or UI work.
export const THEME_BLOG_APPROVAL_READINESS_SCHEMA = 'theme-blog-approval-readiness.v1'

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
  throw new Error(`theme-blog approval readiness is invalid: ${message}`)
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

function cloneRequest(value) {
  assertExactKeys(value, [
    'topic_id', 'title', 'target_keyword', 'patient_intent', 'safe_angle',
    'avoid_claims', 'clinic_fit', 'integrity_lineage',
  ], 'draft artifact.request')
  const request = {}
  for (const key of ['topic_id', 'title', 'target_keyword', 'patient_intent', 'safe_angle', 'clinic_fit']) {
    request[key] = safeText(value[key], `draft artifact.request.${key}`)
  }
  if (!TOPIC_ID_RE.test(request.topic_id)) fail('draft artifact.request.topic_id has an invalid format')
  if (!Array.isArray(value.avoid_claims) || value.avoid_claims.length === 0) fail('draft artifact.request.avoid_claims is invalid')
  request.avoid_claims = value.avoid_claims.map((item, index) => safeText(item, `draft artifact.request.avoid_claims[${index}]`))
  if (new Set(request.avoid_claims).size !== request.avoid_claims.length) fail('draft artifact.request.avoid_claims contains duplicates')
  request.integrity_lineage = cloneLineage(value.integrity_lineage, 'draft artifact.request.integrity_lineage')
  if (request.integrity_lineage.source_theme_topic_id !== request.topic_id) fail('draft artifact request lineage topic does not match topic_id')
  return request
}

function cloneDraft(value) {
  assertExactKeys(value, ['title', 'body'], 'draft artifact.draft')
  return {
    title: safeText(value.title, 'draft artifact.draft.title'),
    body: safeText(value.body, 'draft artifact.draft.body'),
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
  for (const flag of ['generated', 'routed', 'approved', 'published', 'dispatched']) {
    if (value[flag] !== false) fail(`draft artifact ${flag} must be inactive`)
  }
  const topicId = safeText(value.topic_id, 'draft artifact.topic_id')
  if (!TOPIC_ID_RE.test(topicId)) fail('draft artifact.topic_id has an invalid format')
  const request = cloneRequest(value.request)
  const draft = cloneDraft(value.draft)
  const integrityLineage = cloneLineage(value.integrity_lineage, 'draft artifact.integrity_lineage')
  if (request.topic_id !== topicId || integrityLineage.source_theme_topic_id !== topicId) {
    fail('draft artifact lineage topic does not match topic_id')
  }
  for (const key of LINEAGE_KEYS) {
    if (request.integrity_lineage[key] !== integrityLineage[key]) fail('draft artifact lineage does not match request')
  }
  return { topicId, draft, integrityLineage }
}

/**
 * Converts a validated immutable draft artifact into an immutable Human-review
 * readiness value. Approval and every downstream operation remain inactive.
 */
export function buildThemeBlogApprovalReadiness(draftArtifact) {
  const { topicId, draft, integrityLineage } = validateDraftArtifact(draftArtifact)
  return deepFreeze({
    schema_version: THEME_BLOG_APPROVAL_READINESS_SCHEMA,
    mode: 'pending_human_review_approval_readiness',
    status: 'pending_human_review',
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

export const buildApprovalReadiness = buildThemeBlogApprovalReadiness
