import { THEME_BLOG_DRAFT_GENERATION_REQUEST_SCHEMA } from './theme-blog-draft-generation-request.mjs'

// This deliberately remains a post-model *artifact* boundary. It accepts a
// synthetic response as data only and never invokes a model or performs any
// routing, review, publication, dispatch, or UI operation.
export const THEME_BLOG_DRAFT_ARTIFACT_SCHEMA = 'theme-blog-draft-artifact.v1'

const SYNTHETIC_MODEL_RESPONSE_SCHEMA = 'theme-blog-synthetic-model-response.v1'
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
  throw new Error(`theme-blog draft artifact is invalid: ${message}`)
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

function cloneRequest(request) {
  assertExactKeys(request, [
    'topic_id', 'title', 'target_keyword', 'patient_intent', 'safe_angle',
    'avoid_claims', 'clinic_fit', 'integrity_lineage',
  ], 'request')
  const result = {}
  for (const key of ['topic_id', 'title', 'target_keyword', 'patient_intent', 'safe_angle', 'clinic_fit']) {
    result[key] = safeText(request[key], `request.${key}`)
  }
  if (!Array.isArray(request.avoid_claims) || request.avoid_claims.length === 0) fail('request.avoid_claims is invalid')
  result.avoid_claims = request.avoid_claims.map((item, index) => safeText(item, `request.avoid_claims[${index}]`))
  if (new Set(result.avoid_claims).size !== result.avoid_claims.length) fail('request.avoid_claims contains duplicates')
  assertExactKeys(request.integrity_lineage, LINEAGE_KEYS, 'request.integrity_lineage')
  result.integrity_lineage = {}
  for (const key of LINEAGE_KEYS) result.integrity_lineage[key] = safeText(request.integrity_lineage[key], `request.integrity_lineage.${key}`)
  if (!TOPIC_ID_RE.test(result.topic_id) || !TOPIC_ID_RE.test(result.integrity_lineage.source_theme_topic_id)) {
    fail('request topic lineage has an invalid format')
  }
  if (!HASH_RE.test(result.integrity_lineage.source_theme_snapshot_hash)
    || !HASH_RE.test(result.integrity_lineage.source_summary_hash)) fail('request integrity hash has an invalid format')
  for (const key of ['source_theme_snapshot_id', 'source_theme_row_version', 'audit_policy_version']) {
    if (!LINEAGE_TOKEN_RE.test(result.integrity_lineage[key])) fail(`request.integrity_lineage.${key} has an invalid lineage token`)
  }
  if (result.integrity_lineage.source_theme_topic_id !== result.topic_id) fail('request lineage topic does not match topic_id')
  return result
}

function validateRequest(value) {
  assertExactKeys(value, [
    'schema_version', 'mode', 'status', 'generated', 'routed', 'approved',
    'published', 'dispatched', 'request',
  ], 'draft generation request')
  if (value.schema_version !== THEME_BLOG_DRAFT_GENERATION_REQUEST_SCHEMA
    || value.mode !== 'pre_model_draft_generation_request'
    || value.status !== 'draft_requested') fail('draft generation request schema or status does not match')
  for (const flag of ['generated', 'routed', 'approved', 'published', 'dispatched']) {
    if (value[flag] !== false) fail(`draft generation request ${flag} must be inactive`)
  }
  return cloneRequest(value.request)
}

function validateSyntheticResponse(value) {
  assertExactKeys(value, ['schema_version', 'status', 'draft'], 'synthetic model response')
  if (value.schema_version !== SYNTHETIC_MODEL_RESPONSE_SCHEMA || value.status !== 'draft_generated') {
    fail('synthetic model response schema or status does not match')
  }
  assertExactKeys(value.draft, ['title', 'body'], 'synthetic model response.draft')
  return {
    title: safeText(value.draft.title, 'synthetic model response.draft.title'),
    body: safeText(value.draft.body, 'synthetic model response.draft.body'),
  }
}

/**
 * Deterministically validates a pre-model request and a synthetic response,
 * producing an immutable local artifact. No real model execution is implied.
 */
export function buildThemeBlogDraftArtifact(draftGenerationRequest, syntheticModelResponse) {
  const request = cloneRequest(validateRequest(draftGenerationRequest))
  const draft = validateSyntheticResponse(syntheticModelResponse)

  return deepFreeze({
    schema_version: THEME_BLOG_DRAFT_ARTIFACT_SCHEMA,
    mode: 'post_model_draft_artifact',
    status: 'draft_ready_for_review',
    generated: false,
    routed: false,
    approved: false,
    published: false,
    dispatched: false,
    topic_id: request.topic_id,
    request,
    draft,
    integrity_lineage: { ...request.integrity_lineage },
  })
}

export const buildDraftArtifact = buildThemeBlogDraftArtifact
