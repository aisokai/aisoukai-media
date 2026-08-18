import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseArgs,
  runThemeBlogFlow,
  THEME_READY_BLOG_INTAKE_SCHEMA,
} from '../scripts/theme-blog-flow.mjs'

const COLUMNS = [
  'schema_version', 'snapshot_id', 'snapshot_hash', 'topic_id', 'row_version',
  'topic', 'patient_value', 'clinic_fit', 'safe_angle', 'avoid_claims',
  'source_kind', 'source_summary_hash', 'recommended_channels', 'channel_fit_reasons',
  'required_asset_kinds', 'state', 'created_at', 'updated_at', 'last_audited_at', 'audit_policy_version',
]

function row(overrides = {}) {
  return {
    schema_version: 'theme-topic-csv.v1',
    snapshot_id: 'notebook_event_01234567-89ab-4cde-8fab-0123456789ab',
    snapshot_hash: 'a'.repeat(64),
    topic_id: 'topic_0123456789abcdef',
    row_version: '3',
    topic: '合成テーマ',
    patient_value: '一般的な確認点',
    clinic_fit: '一般的な案内',
    safe_angle: '状態によって異なるため相談時の確認点を整理する',
    avoid_claims: ['断定しない'],
    source_kind: 'synthetic_fixture',
    source_summary_hash: 'b'.repeat(64),
    recommended_channels: ['blog'],
    channel_fit_reasons: { blog: '説明向け' },
    required_asset_kinds: ['none'],
    state: 'active',
    created_at: '2026-08-18T00:00:00Z',
    updated_at: '2026-08-18T00:00:00Z',
    last_audited_at: '2026-08-18T00:00:00Z',
    audit_policy_version: 'audit-v1',
    ...overrides,
  }
}

function api({ rows = [row()], selected = rows, columns = COLUMNS } = {}) {
  return {
    THEME_TOPIC_CSV_COLUMNS: columns,
    parseThemeTopicCsv: () => rows,
    selectBlogThemeTopics: () => selected,
  }
}

test('pure flow emits theme-ready intake with instruction, snapshot, and integrity lineage', async () => {
  const source = row()
  const result = await runThemeBlogFlow({
    topicsPath: '/synthetic/theme-topics.csv',
    readFile: () => 'synthetic only',
    themeTopicCsv: api({ rows: [source] }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.mode, 'theme-ready-intake')
  assert.equal(result.generated, false)
  assert.equal(result.routed, false)
  assert.equal(result.approved, false)
  assert.equal(result.published, false)
  assert.equal(result.dispatched, false)
  assert.equal(result.intake.schema_version, THEME_READY_BLOG_INTAKE_SCHEMA)
  assert.equal(result.intake.topic_candidate.id, source.topic_id)
  assert.equal(result.intake.candidate_instruction.safe_angle, source.safe_angle)
  assert.deepEqual(result.intake.candidate_instruction.avoid_claims, source.avoid_claims)
  assert.equal(result.intake.row_snapshot.snapshot_hash, source.snapshot_hash)
  assert.equal(result.intake.integrity_lineage.source_summary_hash, source.source_summary_hash)
  assert.throws(() => { result.intake.topic_candidate.id = 'changed' }, TypeError)
})

test('flow fails closed on vector mismatch, duplicate IDs, mixed snapshots, unsafe values, and no selection', async () => {
  await assert.rejects(() => runThemeBlogFlow({ themeTopicCsv: api({ columns: COLUMNS.slice(1) }), readFile: () => '' }), /固定20列ベクター/)
  await assert.rejects(() => runThemeBlogFlow({ themeTopicCsv: api({ rows: [row(), row({ topic: '別', snapshot_hash: 'c'.repeat(64) })] }), readFile: () => '' }), /topic_id が重複/)
  await assert.rejects(() => runThemeBlogFlow({ themeTopicCsv: api({ rows: [row(), row({ topic_id: 'topic_1111111111111111', snapshot_hash: 'c'.repeat(64) })] }), readFile: () => '' }), /snapshot_id\/hash が混在/)
  await assert.rejects(() => runThemeBlogFlow({ themeTopicCsv: api({ rows: [row({ safe_angle: '=dangerous' })] }), readFile: () => '' }), /危険なフラグ/)
  await assert.rejects(() => runThemeBlogFlow({ themeTopicCsv: api({ selected: [] }), readFile: () => '' }), /blog-ready theme topic がありません/)
})

test('CLI argument parser accepts only value-bearing named inputs', () => {
  assert.deepEqual(parseArgs(['--topics-path', '/synthetic/input.csv']), { topics_path: '/synthetic/input.csv' })
  assert.throws(() => parseArgs(['--unknown']), /許可されない引数/)
  assert.throws(() => parseArgs(['positional']), /許可されない引数/)
})
