import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { applySnsReviewDecision } from '../scripts/lib/sns-review.mjs'

const baseData = {
  channel: 'instagram', platform: 'instagram', title: 'テスト投稿',
  date: '2026-07-03', status: 'pending_review', reviewed: false,
  approved_for_manual_post: false, ai_generated: true, medical_risk: 'low',
  source_topic_id: 'topic-001', publish_mode: 'manual_only',
}

test('approve: status/reviewed/approved_for_manual_post を設定する', () => {
  const out = applySnsReviewDecision({
    data: baseData, decision: 'approve', reviewedBy: '三谷院長',
    timestamp: '2026-07-03T21:00:00+09:00',
  })
  assert.equal(out.status, 'approved')
  assert.equal(out.reviewed, true)
  assert.equal(out.approved_for_manual_post, true)
  assert.equal(out.reviewed_by, '三谷院長')
  assert.equal(out.reviewed_at, '2026-07-03T21:00:00+09:00')
})

test('reject: status と理由を設定し reviewed は false のまま', () => {
  const out = applySnsReviewDecision({
    data: baseData, decision: 'reject', reviewedBy: '三谷院長',
    reason: '表現が断定的', timestamp: '2026-07-03T21:00:00+09:00',
  })
  assert.equal(out.status, 'rejected')
  assert.equal(out.reviewed, false)
  assert.equal(out.approved_for_manual_post, false)
  assert.equal(out.rejected_reason, '表現が断定的')
  assert.equal(out.rejected_at, '2026-07-03T21:00:00+09:00')
})

test('approve に reviewedBy が無いとエラー', () => {
  assert.throws(() => applySnsReviewDecision({
    data: baseData, decision: 'approve', timestamp: '2026-07-03T21:00:00+09:00',
  }), /reviewed-by/)
})

test('reject に reason が無いとエラー', () => {
  assert.throws(() => applySnsReviewDecision({
    data: baseData, decision: 'reject', reviewedBy: '三谷院長',
    timestamp: '2026-07-03T21:00:00+09:00',
  }), /reason/)
})

test('pending_review / draft 以外のドラフトは操作できない', () => {
  for (const status of ['approved', 'rejected', 'posted', 'archived']) {
    assert.throws(() => applySnsReviewDecision({
      data: { ...baseData, status }, decision: 'approve', reviewedBy: '三谷院長',
      timestamp: '2026-07-03T21:00:00+09:00',
    }), /操作できません/)
  }
})
