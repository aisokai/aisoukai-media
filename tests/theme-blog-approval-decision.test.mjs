import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildThemeBlogDraftGenerationRequest } from '../scripts/lib/theme-blog-draft-generation-request.mjs'
import { buildThemeBlogDraftArtifact } from '../scripts/lib/theme-blog-draft-artifact.mjs'
import { buildThemeBlogApprovalReadiness } from '../scripts/lib/theme-blog-approval-readiness.mjs'
import {
  buildApprovalDecision,
  buildThemeBlogApprovalDecision,
  THEME_BLOG_APPROVAL_DECISION_SCHEMA,
} from '../scripts/lib/theme-blog-approval-decision.mjs'

function intake() {
  const rowSnapshot = {
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
  }
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
  }
}

function approvalReadiness() {
  const artifact = buildThemeBlogDraftArtifact(
    buildThemeBlogDraftGenerationRequest(intake()),
    {
      schema_version: 'theme-blog-synthetic-model-response.v1',
      status: 'draft_generated',
      draft: {
        title: '合成テーマを確認するときのポイント',
        body: 'これは合成テスト用の一般的な案内です。',
      },
    },
  )
  return buildThemeBlogApprovalReadiness(artifact)
}

test('builds the exact immutable human-gate-required approval-decision value', () => {
  const readiness = approvalReadiness()
  const actual = buildThemeBlogApprovalDecision(readiness)
  const again = buildApprovalDecision(readiness)

  assert.equal(THEME_BLOG_APPROVAL_DECISION_SCHEMA, 'theme-blog-approval-decision.v1')
  assert.deepEqual(actual, {
    schema_version: 'theme-blog-approval-decision.v1',
    mode: 'pending_human_review_approval_decision',
    status: 'human_gate_required',
    reviewed: false,
    auto_approved: false,
    approved: false,
    published: false,
    dispatched: false,
    topic_id: readiness.topic_id,
    draft: readiness.draft,
    integrity_lineage: readiness.integrity_lineage,
  })
  assert.deepEqual(again, actual)
  assert.notStrictEqual(again, actual)
})

test('fails closed for absent, malformed, and operation-drifted readiness values', () => {
  const readiness = approvalReadiness()

  assert.throws(() => buildThemeBlogApprovalDecision(), /approval decision is invalid/)

  const malformedSchema = structuredClone(readiness)
  malformedSchema.schema_version = 'theme-blog-approval-readiness.v2'
  assert.throws(() => buildThemeBlogApprovalDecision(malformedSchema), /schema or status/)

  for (const flag of ['reviewed', 'auto_approved', 'approved', 'published', 'dispatched']) {
    const drifted = structuredClone(readiness)
    drifted[flag] = true
    assert.throws(
      () => buildThemeBlogApprovalDecision(drifted),
      /must be inactive/,
      `${flag} operation drift must fail closed`,
    )
  }

  const extraKey = { ...readiness, human_gate_receipt: 'synthetic' }
  assert.throws(() => buildThemeBlogApprovalDecision(extraKey), /keys do not match/)
})

test('does not mutate input and deeply freezes independently cloned decision data', () => {
  const readiness = approvalReadiness()
  const before = structuredClone(readiness)
  const result = buildThemeBlogApprovalDecision(readiness)

  assert.deepEqual(readiness, before)
  assert.notStrictEqual(result.draft, readiness.draft)
  assert.notStrictEqual(result.integrity_lineage, readiness.integrity_lineage)
  for (const value of [result, result.draft, result.integrity_lineage]) {
    assert.equal(Object.isFrozen(value), true)
  }
  assert.throws(() => { result.draft.title = '変更' }, TypeError)
  assert.throws(() => { result.integrity_lineage.source_theme_topic_id = 'topic_1111111111111111' }, TypeError)
})

test('module boundary is a local transform with no human-gate execution, I/O, model, network, UI, or notification integration', async () => {
  const source = await readFile(new URL('../scripts/lib/theme-blog-approval-decision.mjs', import.meta.url), 'utf8')

  assert.match(source, /import \{ THEME_BLOG_APPROVAL_READINESS_SCHEMA \} from '\.\/theme-blog-approval-readiness\.mjs'/)
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|openai|telegram|notification|child_process|spawn|exec|process\.env|node:(?:fs|https?)|document|window|approve|publish|dispatch|send)\b/i)
})
