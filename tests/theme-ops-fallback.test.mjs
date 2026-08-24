import assert from 'node:assert/strict'
import test from 'node:test'
import { runThemeOpsFallback, toThemeReadyResult } from '../scripts/lib/theme-ops-fallback.mjs'

function snapshot(overrides = {}) {
  return {
    schema_version: 'theme-topic-csv.v1',
    snapshot_id: 'notebook_event_01234567-89ab-4cde-8fab-0123456789ab',
    snapshot_hash: 'a'.repeat(64),
    topic_id: 'topic_0123456789abcdef',
    row_version: '3',
    topic: '合成テーマ',
    patient_value: '一般的な確認点',
    clinic_fit: '一般的な案内',
    safe_angle: '一般的な確認点を案内する',
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

function intake(overrides = {}) {
  const rowSnapshot = snapshot()
  return {
    schema_version: 'theme-ready-blog-intake.v1',
    status: 'theme_ready',
    topic_candidate: {
      id: rowSnapshot.topic_id,
      topic: rowSnapshot.topic,
      title_candidate: rowSnapshot.topic,
      target_keyword: rowSnapshot.topic,
      patient_intent: rowSnapshot.patient_value,
    },
    candidate_instruction: {
      safe_angle: rowSnapshot.safe_angle,
      avoid_claims: rowSnapshot.avoid_claims,
      clinic_fit: rowSnapshot.clinic_fit,
      patient_value: rowSnapshot.patient_value,
    },
    row_snapshot: rowSnapshot,
    integrity_lineage: {
      source_theme_topic_id: rowSnapshot.topic_id,
      source_theme_snapshot_id: rowSnapshot.snapshot_id,
      source_theme_snapshot_hash: rowSnapshot.snapshot_hash,
      source_theme_row_version: rowSnapshot.row_version,
      source_summary_hash: rowSnapshot.source_summary_hash,
      audit_policy_version: rowSnapshot.audit_policy_version,
    },
    ...overrides,
  }
}

test('validated intake adapter stays local and preserves its complete lineage', () => {
  const result = runThemeOpsFallback({ intake: intake() })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'theme_ready')
  assert.equal(result.generated, false)
  assert.equal(result.published, false)
  assert.equal(result.dispatched, false)
  assert.equal(result.topicId, 'topic_0123456789abcdef')
  assert.equal(result.integrity_lineage.source_theme_snapshot_hash, 'a'.repeat(64))
  assert.equal(result.candidate_instruction.safe_angle, '一般的な確認点を案内する')
  assert.match(result.reasons[0], /ローカルintake/)
})

test('adapter rejects absent, schema-invalid, and incomplete lineage intakes fail-closed', () => {
  const absent = runThemeOpsFallback()
  assert.equal(absent.ok, false)
  assert.match(absent.reason, /後続操作を停止/)

  const wrongSchema = runThemeOpsFallback({ intake: intake({ schema_version: 'theme-ready-blog-intake.v2' }) })
  assert.equal(wrongSchema.ok, false)
  assert.match(wrongSchema.reason, /確認できませんでした/)

  const missingLineage = runThemeOpsFallback({ intake: intake({
    integrity_lineage: { source_theme_topic_id: 'topic_0123456789abcdef' },
  }) })
  assert.equal(missingLineage.ok, false)
  assert.match(missingLineage.reason, /integrity_lineage keys/)
  assert.throws(() => toThemeReadyResult(intake({
    topic_candidate: { id: '', topic: '', title_candidate: '', target_keyword: '', patient_intent: '' },
  })), /topic_candidate/)
})

test('adapter rejects forged lineage tokens and invalid snapshot dates fail-closed', () => {
  const forgedHash = intake()
  forgedHash.integrity_lineage.source_theme_snapshot_hash = 'not-a-valid-lineage-token'
  const forgedResult = runThemeOpsFallback({ intake: forgedHash })
  assert.equal(forgedResult.ok, false)
  assert.match(forgedResult.reason, /source_theme_snapshot_hash/)

  const invalidDate = intake({ row_snapshot: snapshot({ created_at: '2026-02-30T00:00:00Z' }) })
  invalidDate.integrity_lineage.source_theme_topic_id = invalidDate.row_snapshot.topic_id
  invalidDate.integrity_lineage.source_theme_snapshot_id = invalidDate.row_snapshot.snapshot_id
  invalidDate.integrity_lineage.source_theme_snapshot_hash = invalidDate.row_snapshot.snapshot_hash
  invalidDate.integrity_lineage.source_theme_row_version = invalidDate.row_snapshot.row_version
  invalidDate.integrity_lineage.source_summary_hash = invalidDate.row_snapshot.source_summary_hash
  invalidDate.integrity_lineage.audit_policy_version = invalidDate.row_snapshot.audit_policy_version
  invalidDate.topic_candidate = {
    id: invalidDate.row_snapshot.topic_id,
    topic: invalidDate.row_snapshot.topic,
    title_candidate: invalidDate.row_snapshot.topic,
    target_keyword: invalidDate.row_snapshot.topic,
    patient_intent: invalidDate.row_snapshot.patient_value,
  }
  invalidDate.candidate_instruction = {
    safe_angle: invalidDate.row_snapshot.safe_angle,
    avoid_claims: invalidDate.row_snapshot.avoid_claims,
    clinic_fit: invalidDate.row_snapshot.clinic_fit,
    patient_value: invalidDate.row_snapshot.patient_value,
  }
  const invalidDateResult = runThemeOpsFallback({ intake: invalidDate })
  assert.equal(invalidDateResult.ok, false)
  assert.match(invalidDateResult.reason, /date/)
})
