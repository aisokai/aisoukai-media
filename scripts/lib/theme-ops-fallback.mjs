import { THEME_READY_BLOG_INTAKE_SCHEMA } from '../theme-blog-flow.mjs'

const COLUMNS = Object.freeze([
  'schema_version', 'snapshot_id', 'snapshot_hash', 'topic_id', 'row_version',
  'topic', 'patient_value', 'clinic_fit', 'safe_angle', 'avoid_claims',
  'source_kind', 'source_summary_hash', 'recommended_channels', 'channel_fit_reasons',
  'required_asset_kinds', 'state', 'created_at', 'updated_at', 'last_audited_at', 'audit_policy_version',
])
const ARRAY_COLUMNS = new Set(['avoid_claims', 'recommended_channels', 'required_asset_kinds'])
const OBJECT_COLUMNS = new Set(['channel_fit_reasons'])
const HASH_RE = /^[a-f0-9]{64}$/
const TOPIC_ID_RE = /^topic_[a-f0-9]{16}$/
const LINEAGE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const UNSAFE_MARKER_RE = /(private|secret|confidential|credential|password|api[\s_-]*(?:key|token)|access[\s_-]*(?:key|token)|authorization|bearer|\.env|dangerous|unsafe|do[\s_-]*not[\s_-]*use|個人情報|患者(?:データ|情報)|診療(?:情報|録)|カルテ|認証情報|パスワード|秘密|危険|使用禁止)/iu
const DANGEROUS_VALUE_RE = /^[=+\-@]/

function fail(message) {
  return { ok: false, generated: false, reason: message, reasons: [message] }
}

function throwInvalid(message) {
  throw new Error(`theme-ready intake is invalid: ${message}`)
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function assertSafeText(value, label) {
  const text = String(value ?? '').trim()
  if (!text) throwInvalid(`${label} is missing`)
  if (DANGEROUS_VALUE_RE.test(text)) throwInvalid(`${label} has a dangerous flag`)
  if (UNSAFE_MARKER_RE.test(text)) throwInvalid(`${label} has a private or unsafe marker`)
  if (/\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) throwInvalid(`${label} has a control character`)
  return text
}

function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => value === right[index])
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throwInvalid(`${label} is not an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throwInvalid(`${label} keys do not match the fixed contract`)
  }
}

function assertDateTime(value, label) {
  if (!DATE_TIME_RE.test(value)) throwInvalid(`${label} has an invalid datetime format`)
  const datePart = value.slice(0, 10)
  const calendarDate = new Date(`${datePart}T00:00:00Z`)
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart) {
    throwInvalid(`${label} has an invalid calendar date`)
  }
  const timestamp = new Date(value.includes('T') ? value : `${value}T00:00:00Z`).getTime()
  if (Number.isNaN(timestamp)) throwInvalid(`${label} has an invalid datetime`)
}

function validateSnapshot(snapshot) {
  assertExactKeys(snapshot, COLUMNS, 'row_snapshot')
  const normalized = {}
  for (const column of COLUMNS) {
    const value = snapshot[column]
    if (ARRAY_COLUMNS.has(column)) {
      if (!Array.isArray(value) || value.length === 0) throwInvalid(`row_snapshot.${column} is invalid`)
      const items = value.map((item, index) => assertSafeText(item, `row_snapshot.${column}[${index}]`))
      if (new Set(items).size !== items.length) throwInvalid(`row_snapshot.${column} contains duplicates`)
      normalized[column] = Object.freeze(items)
    } else if (OBJECT_COLUMNS.has(column)) {
      assertExactKeys(value, snapshot.recommended_channels, `row_snapshot.${column}`)
      const object = {}
      for (const [key, item] of Object.entries(value)) object[assertSafeText(key, `row_snapshot.${column} key`)] = assertSafeText(item, `row_snapshot.${column}.${key}`)
      normalized[column] = Object.freeze(object)
    } else {
      normalized[column] = assertSafeText(value, `row_snapshot.${column}`)
    }
  }
  if (normalized.schema_version !== 'theme-topic-csv.v1') throwInvalid('row_snapshot schema_version is unknown')
  if (normalized.state !== 'active') throwInvalid('row_snapshot state is not active')
  if (!TOPIC_ID_RE.test(normalized.topic_id)) throwInvalid('row_snapshot topic_id has an invalid format')
  for (const field of ['snapshot_id', 'row_version', 'source_kind', 'audit_policy_version']) {
    if (!LINEAGE_TOKEN_RE.test(normalized[field])) throwInvalid(`row_snapshot.${field} has an invalid lineage token`)
  }
  if (!HASH_RE.test(normalized.snapshot_hash) || !HASH_RE.test(normalized.source_summary_hash)) throwInvalid('row_snapshot integrity hash has an invalid format')
  for (const field of ['created_at', 'updated_at', 'last_audited_at']) assertDateTime(normalized[field], `row_snapshot.${field}`)
  if (!normalized.recommended_channels.includes('blog')) throwInvalid('row_snapshot does not permit the blog channel')
  return deepFreeze(normalized)
}

function validateIntake(intake) {
  assertExactKeys(intake, ['schema_version', 'status', 'topic_candidate', 'candidate_instruction', 'row_snapshot', 'integrity_lineage'], 'intake')
  if (intake.schema_version !== THEME_READY_BLOG_INTAKE_SCHEMA || intake.status !== 'theme_ready') throwInvalid('schema or status does not match')
  const snapshot = validateSnapshot(intake.row_snapshot)
  assertExactKeys(intake.integrity_lineage, ['source_theme_topic_id', 'source_theme_snapshot_id', 'source_theme_snapshot_hash', 'source_theme_row_version', 'source_summary_hash', 'audit_policy_version'], 'integrity_lineage')
  const lineage = {}
  const lineageMap = {
    source_theme_topic_id: 'topic_id', source_theme_snapshot_id: 'snapshot_id', source_theme_snapshot_hash: 'snapshot_hash',
    source_theme_row_version: 'row_version', source_summary_hash: 'source_summary_hash', audit_policy_version: 'audit_policy_version',
  }
  for (const [lineageField, snapshotField] of Object.entries(lineageMap)) {
    lineage[lineageField] = assertSafeText(intake.integrity_lineage[lineageField], `integrity_lineage.${lineageField}`)
    if (lineage[lineageField] !== snapshot[snapshotField]) throwInvalid(`integrity_lineage.${lineageField} does not match row_snapshot`)
  }
  assertExactKeys(intake.topic_candidate, ['id', 'topic', 'title_candidate', 'target_keyword', 'patient_intent'], 'topic_candidate')
  const candidate = {}
  for (const key of Object.keys(intake.topic_candidate)) candidate[key] = assertSafeText(intake.topic_candidate[key], `topic_candidate.${key}`)
  if (candidate.id !== snapshot.topic_id || candidate.topic !== snapshot.topic || candidate.title_candidate !== snapshot.topic
    || candidate.target_keyword !== snapshot.topic || candidate.patient_intent !== snapshot.patient_value) throwInvalid('topic_candidate does not match row_snapshot')
  assertExactKeys(intake.candidate_instruction, ['safe_angle', 'avoid_claims', 'clinic_fit', 'patient_value'], 'candidate_instruction')
  const instruction = {
    safe_angle: assertSafeText(intake.candidate_instruction.safe_angle, 'candidate_instruction.safe_angle'),
    clinic_fit: assertSafeText(intake.candidate_instruction.clinic_fit, 'candidate_instruction.clinic_fit'),
    patient_value: assertSafeText(intake.candidate_instruction.patient_value, 'candidate_instruction.patient_value'),
    avoid_claims: intake.candidate_instruction.avoid_claims,
  }
  if (!sameStringArray(instruction.avoid_claims, snapshot.avoid_claims)) throwInvalid('candidate_instruction.avoid_claims does not match row_snapshot')
  instruction.avoid_claims = Object.freeze(instruction.avoid_claims.map((item, index) => assertSafeText(item, `candidate_instruction.avoid_claims[${index}]`)))
  if (instruction.safe_angle !== snapshot.safe_angle || instruction.clinic_fit !== snapshot.clinic_fit || instruction.patient_value !== snapshot.patient_value) {
    throwInvalid('candidate_instruction does not match row_snapshot')
  }
  return deepFreeze({ snapshot, lineage: Object.freeze(lineage), candidate: Object.freeze(candidate), instruction: Object.freeze(instruction) })
}

// Deliberately local and side-effect free: this adapter accepts only an already
// validated intake and never creates, routes, reviews, publishes, or dispatches content.
export function toThemeReadyResult(intake) {
  const validated = validateIntake(intake)
  return deepFreeze({
    ok: true,
    generated: false,
    published: false,
    dispatched: false,
    status: 'theme_ready',
    topicId: validated.candidate.id,
    title: validated.candidate.title_candidate,
    candidate_instruction: validated.instruction,
    row_snapshot: validated.snapshot,
    integrity_lineage: validated.lineage,
    reasons: Object.freeze(['検証済みテーマノートブックからのローカルintake']),
  })
}

export function runThemeOpsFallback({ intake } = {}) {
  if (!intake) return fail('検証済みtheme-ready intakeがないため後続操作を停止しました')
  try {
    return toThemeReadyResult(intake)
  } catch (error) {
    return fail(`theme-ready intakeを確認できませんでした: ${error.message}`)
  }
}
