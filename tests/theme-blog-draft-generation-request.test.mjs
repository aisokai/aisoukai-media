import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildDraftGenerationRequest,
  buildThemeBlogDraftGenerationRequest,
  THEME_BLOG_DRAFT_GENERATION_REQUEST_SCHEMA,
} from '../scripts/lib/theme-blog-draft-generation-request.mjs'

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
    avoid_claims: ['断定しない', '個別の結果を保証しない'],
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
      avoid_claims: [...rowSnapshot.avoid_claims],
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

test('builds the exact deterministic pre-model request with all inactive operation flags', () => {
  const source = intake()
  const actual = buildThemeBlogDraftGenerationRequest(source)
  const again = buildDraftGenerationRequest(source)

  assert.equal(THEME_BLOG_DRAFT_GENERATION_REQUEST_SCHEMA, 'theme-blog-draft-generation-request.v1')
  assert.deepEqual(actual, {
    schema_version: 'theme-blog-draft-generation-request.v1',
    mode: 'pre_model_draft_generation_request',
    status: 'draft_requested',
    generated: false,
    routed: false,
    approved: false,
    published: false,
    dispatched: false,
    request: {
      topic_id: 'topic_0123456789abcdef',
      title: '合成テーマ',
      target_keyword: '合成テーマ',
      patient_intent: '一般的な確認点',
      safe_angle: '一般的な確認点を案内する',
      avoid_claims: ['断定しない', '個別の結果を保証しない'],
      clinic_fit: '一般的な案内',
      integrity_lineage: source.integrity_lineage,
    },
  })
  assert.deepEqual(again, actual)
  assert.notStrictEqual(again, actual)
})

test('fails closed for absent, schema-invalid, and forged theme-ready input', () => {
  assert.throws(() => buildThemeBlogDraftGenerationRequest(), /theme-ready intake is invalid/)
  assert.throws(() => buildThemeBlogDraftGenerationRequest(intake({ schema_version: 'theme-ready-blog-intake.v2' })), /schema or status/)

  const forged = intake()
  forged.integrity_lineage.source_theme_snapshot_hash = 'c'.repeat(64)
  assert.throws(() => buildThemeBlogDraftGenerationRequest(forged), /does not match row_snapshot/)
})

test('does not mutate input and deeply freezes the returned pre-model contract', () => {
  const source = intake()
  const original = structuredClone(source)
  const result = buildThemeBlogDraftGenerationRequest(source)

  assert.deepEqual(source, original)
  assert.notStrictEqual(result.request.avoid_claims, source.candidate_instruction.avoid_claims)
  assert.notStrictEqual(result.request.integrity_lineage, source.integrity_lineage)
  for (const value of [result, result.request, result.request.avoid_claims, result.request.integrity_lineage]) {
    assert.equal(Object.isFrozen(value), true)
  }
  assert.throws(() => { result.request.title = '変更' }, TypeError)
  assert.throws(() => { result.request.avoid_claims.push('追加') }, TypeError)
  assert.throws(() => { result.request.integrity_lineage.source_theme_topic_id = 'topic_1111111111111111' }, TypeError)
})

test('module boundary has only the local validator dependency and no observable network, model, publish, dispatch, or UI integration', async () => {
  const source = await readFile(new URL('../scripts/lib/theme-blog-draft-generation-request.mjs', import.meta.url), 'utf8')

  assert.match(source, /import \{ toThemeReadyResult \} from '\.\/theme-ops-fallback\.mjs'/)
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|openai|telegram|child_process|spawn|exec|process\.env|document|window)\b/i)
})
