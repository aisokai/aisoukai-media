import { getReviewedContentFingerprint } from './reviewContentFingerprint.mjs'

const HASH = /^[a-f0-9]{64}$/

export function getContentVersion(data, content) {
  return getReviewedContentFingerprint(data, content)
}

// A local file or a local commit is deliberately not an admin-source confirmation.
// Callers must carry a confirmation produced by the existing admin source boundary.
export function isAdminDiscoverableVersion(adminDiscoverability, contentVersion) {
  return adminDiscoverability?.status === 'confirmed'
    && adminDiscoverability?.source === 'admin-review-source'
    && adminDiscoverability?.contentVersion === contentVersion
    && HASH.test(contentVersion)
}

/**
 * @param {{
 *   data?: Record<string, unknown>, content?: string, today?: string,
 *   adminDiscoverability?: null | { status: 'confirmed', source: 'admin-review-source', contentVersion: string }
 * }} input
 */
export function getDmpArticleState({ data = {}, content = '', adminDiscoverability = null, today = '' } = {}) {
  const contentVersion = getContentVersion(data, content)
  const approvedExactVersion = data.reviewed === true
    && Boolean(String(data.reviewed_at ?? '').trim())
    && Boolean(String(data.reviewed_by ?? '').trim())
    && data.reviewed_content_hash === contentVersion
  const rejected = Boolean(data.rejection_reason)
  const publishAt = String(data.publish_at ?? data.date ?? '')
  const future = Boolean(today && publishAt && publishAt > today)
  const publishable = approvedExactVersion && !data.draft && !data.archived && !rejected && !future
  const reviewReady = !data.archived && !rejected
    && isAdminDiscoverableVersion(adminDiscoverability, contentVersion)
  return { contentVersion, approvedExactVersion, rejected, future, publishable, reviewReady,
    state: reviewReady ? 'review-ready' : 'pending-review' }
}

export function assertExpectedContentVersion({ data, content, expectedContentVersion }) {
  const current = getContentVersion(data, content)
  if (!HASH.test(String(expectedContentVersion ?? '')) || expectedContentVersion !== current) {
    throw new Error('表示中の記事内容が更新されています。再読み込みしてからもう一度レビューしてください')
  }
  return current
}

export function applyTeacherApproval({ data, content, reviewedBy, reviewedAt }) {
  // The fingerprint deliberately includes publication-relevant fields such as
  // `draft` and `stock_status`, so calculate it from the final approved state.
  const next = { ...data, reviewed: true, draft: false, reviewed_at: reviewedAt, reviewed_by: reviewedBy,
    stock_status: 'adopted' }
  delete next.rejection_reason
  delete next.review_invalidated_at
  delete next.review_invalidation_reason
  next.reviewed_content_hash = getContentVersion(next, content)
  return next
}
