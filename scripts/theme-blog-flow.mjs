#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(__dirname, '..')
// This path is only a read default for the local, already-validated notebook export.
export const DEFAULT_THEME_TOPICS_PATH = join(homedir(), 'dmp-content-core', 'outputs', 'theme-topic-csv', 'theme-topics.csv')

export const THEME_READY_BLOG_INTAKE_SCHEMA = 'theme-ready-blog-intake.v1'

const EXPECTED_COLUMNS = Object.freeze([
  'schema_version', 'snapshot_id', 'snapshot_hash', 'topic_id', 'row_version',
  'topic', 'patient_value', 'clinic_fit', 'safe_angle', 'avoid_claims',
  'source_kind', 'source_summary_hash', 'recommended_channels', 'channel_fit_reasons',
  'required_asset_kinds', 'state', 'created_at', 'updated_at', 'last_audited_at', 'audit_policy_version',
])
const HASH_RE = /^[a-f0-9]{64}$/
const TOPIC_ID_RE = /^topic_[a-f0-9]{16}$/
const UNSAFE_MARKER_RE = /(private|secret|confidential|credential|password|api[\s_-]*(?:key|token)|access[\s_-]*(?:key|token)|authorization|bearer|\.env|dangerous|unsafe|do[\s_-]*not[\s_-]*use|個人情報|患者(?:データ|情報)|診療(?:情報|録)|カルテ|認証情報|パスワード|秘密|危険|使用禁止)/iu
const DANGEROUS_VALUE_RE = /^[=+\-@]/

function fail(message) {
  throw new Error(`theme-ready-blog-intake.v1: ${message}`)
}

function assertExactColumns(api) {
  const columns = api?.THEME_TOPIC_CSV_COLUMNS
  if (!Array.isArray(columns) || columns.length !== EXPECTED_COLUMNS.length
    || columns.some((column, index) => column !== EXPECTED_COLUMNS[index])) {
    fail('theme-topic-csv.v1 の固定20列ベクターが一致しません')
  }
}

function assertSafeValue(value, label) {
  const text = String(value ?? '').trim()
  if (!text) fail(`${label} が空です`)
  if (DANGEROUS_VALUE_RE.test(text)) fail(`${label} に危険なフラグがあります`)
  if (UNSAFE_MARKER_RE.test(text)) fail(`${label} にprivate/secretマーカーがあります`)
  if (/\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) fail(`${label} に制御文字があります`)
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function cloneSnapshot(row) {
  const snapshot = {}
  for (const column of EXPECTED_COLUMNS) {
    if (!(column in row)) fail(`row_snapshot に ${column} がありません`)
    const value = row[column]
    if (Array.isArray(value)) {
      if (value.length === 0) fail(`row_snapshot.${column} が空です`)
      value.forEach((item, index) => assertSafeValue(item, `row_snapshot.${column}[${index}]`))
      if (new Set(value).size !== value.length) fail(`row_snapshot.${column} に重複値があります`)
      snapshot[column] = Object.freeze([...value])
    } else if (value && typeof value === 'object') {
      const entries = Object.entries(value)
      if (entries.length === 0) fail(`row_snapshot.${column} が空です`)
      entries.forEach(([key, item]) => {
        assertSafeValue(key, `row_snapshot.${column} key`)
        assertSafeValue(item, `row_snapshot.${column}.${key}`)
      })
      snapshot[column] = Object.freeze(Object.fromEntries(entries))
    } else {
      assertSafeValue(value, `row_snapshot.${column}`)
      snapshot[column] = String(value).trim()
    }
  }
  return deepFreeze(snapshot)
}

function assertSnapshotAndLineage(snapshot) {
  if (snapshot.schema_version !== 'theme-topic-csv.v1') fail('未知のschema_versionです')
  if (!TOPIC_ID_RE.test(snapshot.topic_id)) fail('topic_id の形式が不正です')
  if (!HASH_RE.test(snapshot.snapshot_hash) || !HASH_RE.test(snapshot.source_summary_hash)) {
    fail('snapshot/source summary integrity hash の形式が不正です')
  }
  if (!Array.isArray(snapshot.recommended_channels) || !snapshot.recommended_channels.includes('blog')) {
    fail('blog channel を含む候補だけがintake対象です')
  }
  if (!Array.isArray(snapshot.avoid_claims)) fail('avoid_claims が不正です')
  if (snapshot.state !== 'active') fail('activeでない候補はintake対象外です')
}

function ensureUniqueAndConsistentRows(rows) {
  const ids = new Set()
  let snapshotId = ''
  let snapshotHash = ''
  for (const row of rows) {
    const snapshot = cloneSnapshot(row)
    assertSnapshotAndLineage(snapshot)
    if (ids.has(snapshot.topic_id)) fail(`topic_id が重複しています: ${snapshot.topic_id}`)
    ids.add(snapshot.topic_id)
    if (!snapshotId) {
      snapshotId = snapshot.snapshot_id
      snapshotHash = snapshot.snapshot_hash
    } else if (snapshot.snapshot_id !== snapshotId || snapshot.snapshot_hash !== snapshotHash) {
      fail('snapshot_id/hash が混在しています')
    }
  }
}

function buildThemeReadyBlogIntake(row) {
  const rowSnapshot = cloneSnapshot(row)
  assertSnapshotAndLineage(rowSnapshot)
  const candidateInstruction = deepFreeze({
    safe_angle: rowSnapshot.safe_angle,
    avoid_claims: Object.freeze([...rowSnapshot.avoid_claims]),
    clinic_fit: rowSnapshot.clinic_fit,
    patient_value: rowSnapshot.patient_value,
  })
  const integrityLineage = deepFreeze({
    source_theme_topic_id: rowSnapshot.topic_id,
    source_theme_snapshot_id: rowSnapshot.snapshot_id,
    source_theme_snapshot_hash: rowSnapshot.snapshot_hash,
    source_theme_row_version: rowSnapshot.row_version,
    source_summary_hash: rowSnapshot.source_summary_hash,
    audit_policy_version: rowSnapshot.audit_policy_version,
  })
  return deepFreeze({
    schema_version: THEME_READY_BLOG_INTAKE_SCHEMA,
    status: 'theme_ready',
    topic_candidate: deepFreeze({
      id: rowSnapshot.topic_id,
      topic: rowSnapshot.topic,
      title_candidate: rowSnapshot.topic,
      target_keyword: rowSnapshot.topic,
      patient_intent: rowSnapshot.patient_value,
    }),
    candidate_instruction: candidateInstruction,
    row_snapshot: rowSnapshot,
    integrity_lineage: integrityLineage,
  })
}

async function loadThemeTopicCsvApi() {
  try {
    return await import('./lib/theme-topic-csv.mjs')
  } catch (error) {
    fail(`theme-topic-csv helper is unavailable: ${error.message}`)
  }
}

export async function runThemeBlogFlow({
  topicsPath = DEFAULT_THEME_TOPICS_PATH,
  themeTopicCsv,
  readFile = readFileSync,
} = {}) {
  const api = themeTopicCsv ?? await loadThemeTopicCsvApi()
  assertExactColumns(api)
  if (typeof api.parseThemeTopicCsv !== 'function' || typeof api.selectBlogThemeTopics !== 'function') {
    fail('theme-topic-csv.v1 の検証済みAPIが利用できません')
  }
  const raw = readFile(topicsPath, 'utf8')
  const rows = api.parseThemeTopicCsv(raw)
  if (!Array.isArray(rows)) fail('theme-topic-csv parser が配列を返しません')
  ensureUniqueAndConsistentRows(rows)
  const candidates = api.selectBlogThemeTopics(rows, { existingSourceTopicIds: new Set() })
  if (!Array.isArray(candidates)) fail('blog candidate selector が配列を返しません')
  ensureUniqueAndConsistentRows(candidates)
  const selected = candidates[0]
  if (!selected) fail('blog-ready theme topic がありません')
  const intake = buildThemeReadyBlogIntake(selected)
  return Object.freeze({
    ok: true,
    mode: 'theme-ready-intake',
    generated: false,
    routed: false,
    approved: false,
    published: false,
    dispatched: false,
    intake,
  })
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== '--topics-path') fail(`許可されない引数です: ${flag}`)
    if (args.topics_path !== undefined) fail('--topics-path は一度だけ指定してください')
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail('値が必要です: --topics-path')
    args.topics_path = value
    index += 1
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = await runThemeBlogFlow({ topicsPath: String(args.topics_path ?? DEFAULT_THEME_TOPICS_PATH) })
  console.log(`RESULT_JSON ${JSON.stringify(result)}`)
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`エラー: ${error.message}`)
    console.log(`RESULT_JSON ${JSON.stringify({ ok: false, error: error.message })}`)
    process.exitCode = 1
  })
}

export { buildThemeReadyBlogIntake, parseArgs }
export const runBlogFlow = runThemeBlogFlow
