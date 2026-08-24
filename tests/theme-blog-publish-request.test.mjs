import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildThemeBlogDraftGenerationRequest } from '../scripts/lib/theme-blog-draft-generation-request.mjs'
import { buildThemeBlogDraftArtifact } from '../scripts/lib/theme-blog-draft-artifact.mjs'
import { buildThemeBlogApprovalReadiness } from '../scripts/lib/theme-blog-approval-readiness.mjs'
import {
  buildBlogPublishRequest,
  buildThemeBlogPublishRequest,
  THEME_BLOG_PUBLISH_REQUEST_SCHEMA,
} from '../scripts/lib/theme-blog-publish-request.mjs'

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

function approvedInputs() {
  const draftArtifact = buildThemeBlogDraftArtifact(
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
  const approvalReadiness = buildThemeBlogApprovalReadiness(draftArtifact)
  const approvalDecision = {
    schema_version: 'theme-blog-approval-decision.v1',
    mode: 'pending_human_review_approval_decision',
    status: 'approved',
    reviewed: true,
    auto_approved: false,
    approved: true,
    published: false,
    dispatched: false,
    topic_id: approvalReadiness.topic_id,
    draft: structuredClone(approvalReadiness.draft),
    integrity_lineage: structuredClone(approvalReadiness.integrity_lineage),
  }
  return { draftArtifact, approvalReadiness, approvalDecision }
}

test('builds the exact immutable awaiting-human-gate blog publish request from approved lineage inputs', () => {
  const { draftArtifact, approvalReadiness, approvalDecision } = approvedInputs()
  const actual = buildThemeBlogPublishRequest(draftArtifact, approvalReadiness, approvalDecision)
  const again = buildBlogPublishRequest(draftArtifact, approvalReadiness, approvalDecision)

  assert.equal(THEME_BLOG_PUBLISH_REQUEST_SCHEMA, 'theme-blog-publish-request.v1')
  assert.deepEqual(actual, {
    schema_version: 'theme-blog-publish-request.v1',
    mode: 'awaiting_human_gate_blog_publish_request',
    status: 'awaiting_human_gate',
    execution_authorized: false,
    human_gate_required: true,
    reviewed: true,
    auto_approved: false,
    approved: true,
    published: false,
    dispatched: false,
    topic_id: approvalDecision.topic_id,
    draft: approvalDecision.draft,
    integrity_lineage: approvalDecision.integrity_lineage,
  })
  assert.deepEqual(again, actual)
  assert.notStrictEqual(again, actual)
})

test('fails closed for absent, unapproved, malformed, drifted, or lineage-mismatched inputs', () => {
  const { draftArtifact, approvalReadiness, approvalDecision } = approvedInputs()

  assert.throws(() => buildThemeBlogPublishRequest(), /publish request is invalid/)

  const malformedSchema = structuredClone(approvalDecision)
  malformedSchema.schema_version = 'theme-blog-approval-decision.v2'
  assert.throws(
    () => buildThemeBlogPublishRequest(draftArtifact, approvalReadiness, malformedSchema),
    /schema or status/,
  )

  for (const [key, value] of [
    ['status', 'human_gate_required'],
    ['reviewed', false],
    ['auto_approved', true],
    ['approved', false],
    ['published', true],
    ['dispatched', true],
  ]) {
    const drifted = structuredClone(approvalDecision)
    drifted[key] = value
    assert.throws(
      () => buildThemeBlogPublishRequest(draftArtifact, approvalReadiness, drifted),
      /must be|schema or status/,
      `approval decision ${key} drift must fail closed`,
    )
  }

  const extraKey = { ...approvalDecision, execution_authorized: true }
  assert.throws(() => buildThemeBlogPublishRequest(draftArtifact, approvalReadiness, extraKey), /keys do not match/)

  const forgedLineage = structuredClone(approvalDecision)
  forgedLineage.integrity_lineage.source_theme_snapshot_hash = 'c'.repeat(64)
  assert.throws(
    () => buildThemeBlogPublishRequest(draftArtifact, approvalReadiness, forgedLineage),
    /lineage does not match/,
  )

  const mismatchedReadiness = structuredClone(approvalReadiness)
  mismatchedReadiness.draft.title = '別の合成テーマ'
  assert.throws(
    () => buildThemeBlogPublishRequest(draftArtifact, mismatchedReadiness, approvalDecision),
    /draft does not match|readiness is invalid/,
  )
})

test('does not mutate inputs and deeply freezes independently cloned publish-request data', () => {
  const { draftArtifact, approvalReadiness, approvalDecision } = approvedInputs()
  const before = structuredClone({ draftArtifact, approvalReadiness, approvalDecision })
  const result = buildThemeBlogPublishRequest(draftArtifact, approvalReadiness, approvalDecision)

  assert.deepEqual({ draftArtifact, approvalReadiness, approvalDecision }, before)
  assert.notStrictEqual(result.draft, approvalDecision.draft)
  assert.notStrictEqual(result.integrity_lineage, approvalDecision.integrity_lineage)
  for (const value of [result, result.draft, result.integrity_lineage]) {
    assert.equal(Object.isFrozen(value), true)
  }
  assert.throws(() => { result.execution_authorized = true }, TypeError)
  assert.throws(() => { result.draft.title = '変更' }, TypeError)
  assert.throws(() => { result.integrity_lineage.source_theme_topic_id = 'topic_1111111111111111' }, TypeError)
})

test('module boundary is a local adapter with no execution, I/O, model, network, UI, notification, send, or dispatch integration', async () => {
  const source = await readFile(new URL('../scripts/lib/theme-blog-publish-request.mjs', import.meta.url), 'utf8')

  assert.match(source, /import \{ THEME_BLOG_DRAFT_ARTIFACT_SCHEMA \} from '\.\/theme-blog-draft-artifact\.mjs'/)
  assert.match(source, /import \{ THEME_BLOG_APPROVAL_READINESS_SCHEMA \} from '\.\/theme-blog-approval-readiness\.mjs'/)
  assert.match(source, /import \{ THEME_BLOG_APPROVAL_DECISION_SCHEMA \} from '\.\/theme-blog-approval-decision\.mjs'/)
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|openai|telegram|notification|child_process|spawn|exec|process\.env|node:fs|node:https|node:http|document|window)\b/i)
})
