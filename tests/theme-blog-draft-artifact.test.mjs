import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildThemeBlogDraftGenerationRequest } from '../scripts/lib/theme-blog-draft-generation-request.mjs'
import {
  buildDraftArtifact,
  buildThemeBlogDraftArtifact,
  THEME_BLOG_DRAFT_ARTIFACT_SCHEMA,
} from '../scripts/lib/theme-blog-draft-artifact.mjs'

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

function syntheticModelResponse(overrides = {}) {
  return {
    schema_version: 'theme-blog-synthetic-model-response.v1',
    status: 'draft_generated',
    draft: {
      title: '合成テーマを確認するときのポイント',
      body: 'これは合成テスト用の一般的な案内です。',
    },
    ...overrides,
  }
}

test('builds an exact immutable post-model artifact without activating any operation', () => {
  const sourceRequest = buildThemeBlogDraftGenerationRequest(intake())
  const sourceResponse = syntheticModelResponse()
  const actual = buildThemeBlogDraftArtifact(sourceRequest, sourceResponse)
  const again = buildDraftArtifact(sourceRequest, sourceResponse)

  assert.equal(THEME_BLOG_DRAFT_ARTIFACT_SCHEMA, 'theme-blog-draft-artifact.v1')
  assert.deepEqual(actual, {
    schema_version: 'theme-blog-draft-artifact.v1',
    mode: 'post_model_draft_artifact',
    status: 'draft_ready_for_review',
    generated: false,
    routed: false,
    approved: false,
    published: false,
    dispatched: false,
    topic_id: 'topic_0123456789abcdef',
    request: sourceRequest.request,
    draft: sourceResponse.draft,
    integrity_lineage: sourceRequest.request.integrity_lineage,
  })
  assert.deepEqual(again, actual)
  assert.notStrictEqual(again, actual)
})

test('fails closed for malformed request/response contracts, forged lineage, and operation drift', () => {
  const request = buildThemeBlogDraftGenerationRequest(intake())

  assert.throws(() => buildThemeBlogDraftArtifact(), /draft artifact is invalid/)
  assert.throws(() => buildThemeBlogDraftArtifact(request, syntheticModelResponse({ status: 'approved' })), /schema or status/)
  assert.throws(() => buildThemeBlogDraftArtifact(request, syntheticModelResponse({ generated: true })), /keys do not match/)
  assert.throws(() => buildThemeBlogDraftArtifact(request, syntheticModelResponse({ draft: { title: '=formula', body: '本文' } })), /dangerous flag/)

  const forgedRequest = structuredClone(request)
  forgedRequest.request.integrity_lineage.source_theme_topic_id = 'topic_1111111111111111'
  assert.throws(() => buildThemeBlogDraftArtifact(forgedRequest, syntheticModelResponse()), /lineage topic does not match/)

  const routedRequest = structuredClone(request)
  routedRequest.routed = true
  assert.throws(() => buildThemeBlogDraftArtifact(routedRequest, syntheticModelResponse()), /routed must be inactive/)
})

test('rejects malformed or forged lineage identifiers and hashes in a cloned valid request', () => {
  const request = buildThemeBlogDraftGenerationRequest(intake())
  const cases = [
    {
      name: 'malformed topic identifier',
      change(clone) {
        clone.request.topic_id = 'topic_invalid'
        clone.request.integrity_lineage.source_theme_topic_id = 'topic_invalid'
      },
    },
    {
      name: 'forged snapshot hash',
      change(clone) {
        clone.request.integrity_lineage.source_theme_snapshot_hash = 'z'.repeat(64)
      },
    },
    {
      name: 'malformed source summary hash',
      change(clone) {
        clone.request.integrity_lineage.source_summary_hash = 'a'.repeat(63)
      },
    },
    {
      name: 'malformed snapshot token',
      change(clone) {
        clone.request.integrity_lineage.source_theme_snapshot_id = 'snapshot id with spaces'
      },
    },
    {
      name: 'malformed row-version token',
      change(clone) {
        clone.request.integrity_lineage.source_theme_row_version = 'version 3'
      },
    },
  ]

  for (const { name, change } of cases) {
    const forged = structuredClone(request)
    change(forged)
    assert.throws(
      () => buildThemeBlogDraftArtifact(forged, syntheticModelResponse()),
      /theme-blog draft artifact is invalid/,
      name,
    )
  }
})

test('does not mutate either input and deeply freezes independently copied artifact data', () => {
  const sourceRequest = buildThemeBlogDraftGenerationRequest(intake())
  const sourceResponse = syntheticModelResponse()
  const requestBefore = structuredClone(sourceRequest)
  const responseBefore = structuredClone(sourceResponse)
  const result = buildThemeBlogDraftArtifact(sourceRequest, sourceResponse)

  assert.deepEqual(sourceRequest, requestBefore)
  assert.deepEqual(sourceResponse, responseBefore)
  assert.notStrictEqual(result.request, sourceRequest.request)
  assert.notStrictEqual(result.request.avoid_claims, sourceRequest.request.avoid_claims)
  assert.notStrictEqual(result.draft, sourceResponse.draft)
  assert.notStrictEqual(result.integrity_lineage, sourceRequest.request.integrity_lineage)
  for (const value of [result, result.request, result.request.avoid_claims, result.draft, result.integrity_lineage]) {
    assert.equal(Object.isFrozen(value), true)
  }
  assert.throws(() => { result.draft.title = '変更' }, TypeError)
  assert.throws(() => { result.request.avoid_claims.push('追加') }, TypeError)
  assert.throws(() => { result.integrity_lineage.source_theme_topic_id = 'topic_1111111111111111' }, TypeError)
})

test('module boundary is local validation only, with no model, network, publish, approval, dispatch, or UI integration', async () => {
  const source = await readFile(new URL('../scripts/lib/theme-blog-draft-artifact.mjs', import.meta.url), 'utf8')

  assert.match(source, /import \{ THEME_BLOG_DRAFT_GENERATION_REQUEST_SCHEMA \} from '\.\/theme-blog-draft-generation-request\.mjs'/)
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|openai|telegram|child_process|spawn|exec|process\.env|document|window)\b/i)
})
