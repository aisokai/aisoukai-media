import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getReviewedContentFingerprint,
  hasStaleReviewedContent,
  applyAdminEditReviewState,
} from '../src/lib/reviewContentFingerprint.mjs'
import { getPostPublicationStatus } from '../scripts/lib/post-publication-status.mjs'

const approved = {
  title: '承認済み記事',
  excerpt: '確認済みの要約',
  reviewed: true,
  reviewed_at: '2026-08-01',
  reviewed_by: 'Human reviewer',
  draft: false,
  publish_at: '2026-08-01',
}
const content = '## 本文\n確認済みです。\n'

test('approved content fingerprint ignores approval metadata but detects material edits', () => {
  const fingerprint = getReviewedContentFingerprint(approved, content)
  const stored = { ...approved, reviewed_content_hash: fingerprint }

  assert.equal(hasStaleReviewedContent(stored, content), false)
  assert.equal(hasStaleReviewedContent({ ...stored, reviewed_at: '2026-08-02' }, content), false)
  assert.equal(hasStaleReviewedContent({ ...stored, excerpt: '編集済みの要約' }, content), true)
  assert.equal(hasStaleReviewedContent({ ...stored, reviewed: false, excerpt: '編集済みの要約' }, content), false)
})

test('a stale or hashless reviewed fingerprint is not publishable', () => {
  const fingerprint = getReviewedContentFingerprint(approved, content)
  const stale = getPostPublicationStatus(
    { ...approved, reviewed_content_hash: fingerprint, title: '承認後に変更された記事' },
    { today: '2026-08-02', content },
  )
  const legacy = getPostPublicationStatus(approved, { today: '2026-08-02', content })

  assert.equal(stale.publishable, false)
  assert.ok(stale.blockers.some((blocker) => blocker.code === 'review_content_stale'))
  assert.equal(legacy.publishable, false)
  assert.ok(legacy.blockers.some((blocker) => blocker.code === 'review_content_stale'))
})

test('low-risk auto approval, rejected posts, and future posts retain their closed publication policy', () => {
  const autoApproved = getPostPublicationStatus({
    ...approved,
    reviewed: false,
    auto_approved: true,
    publication_status: 'auto_approved',
    medical_risk: 'low',
    legal_check_status: 'passed',
    image_check_status: 'passed',
  }, { today: '2026-08-02', content })
  const rejected = getPostPublicationStatus({ ...approved, rejection_reason: '根拠を要確認' }, { today: '2026-08-02', content })
  const future = getPostPublicationStatus({ ...approved, publish_at: '2026-08-10' }, { today: '2026-08-02', content })

  assert.equal(autoApproved.publishable, false)
  assert.equal(rejected.publishable, false)
  assert.equal(future.publishable, false)
  assert.equal(future.isFuture, true)
})

test('admin edit compares canonical submitted content with the authoritative approved post, not submitted review metadata', () => {
  const current = {
    ...approved,
    reviewed_content_hash: getReviewedContentFingerprint(approved, content),
  }
  const titleEditWithRemovedHash = applyAdminEditReviewState({
    currentData: current,
    currentContent: content,
    submittedData: { ...approved, title: '編集されたタイトル' },
    submittedContent: content,
    invalidatedAt: '2026-08-02T00:00:00.000+09:00',
  })
  const bodyEditWithForgedHash = applyAdminEditReviewState({
    currentData: current,
    currentContent: content,
    submittedData: { ...current, reviewed_content_hash: 'forged', reviewed: true },
    submittedContent: '## 編集後の本文\n',
    invalidatedAt: '2026-08-02T00:00:00.000+09:00',
  })
  const unchangedForgedMetadata = applyAdminEditReviewState({
    currentData: current,
    currentContent: content,
    submittedData: { ...current, reviewed_content_hash: 'forged', reviewed: false },
    submittedContent: content,
    invalidatedAt: '2026-08-02T00:00:00.000+09:00',
  })

  assert.equal(titleEditWithRemovedHash.requiresRereview, true)
  assert.equal(titleEditWithRemovedHash.data.reviewed, false)
  assert.equal(bodyEditWithForgedHash.requiresRereview, true)
  assert.equal(bodyEditWithForgedHash.data.reviewed, false)
  assert.equal(unchangedForgedMetadata.requiresRereview, false)
  assert.equal(unchangedForgedMetadata.data.reviewed, true)
  assert.equal(unchangedForgedMetadata.data.reviewed_content_hash, current.reviewed_content_hash)
})
