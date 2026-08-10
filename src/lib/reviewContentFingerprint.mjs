import { createHash } from 'node:crypto'

// Approval state is intentionally excluded: a Human approval fingerprints the
// article itself, not the metadata produced by that approval.
const APPROVAL_FIELDS = new Set([
  'reviewed',
  'reviewed_at',
  'reviewed_by',
  'reviewed_content_hash',
  'review_invalidated_at',
  'review_invalidation_reason',
])

function normalize(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !APPROVAL_FIELDS.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    )
  }
  return value
}

export function getReviewedContentFingerprint(data, content) {
  const canonical = JSON.stringify({ data: normalize(data), content: String(content ?? '') })
  return createHash('sha256').update(canonical).digest('hex')
}

export function hasStaleReviewedContent(data, content) {
  const stored = String(data.reviewed_content_hash ?? '').trim()
  return data.reviewed === true && stored !== getReviewedContentFingerprint(data, content)
}

const SERVER_OWNED_REVIEW_FIELDS = [
  'reviewed',
  'reviewed_at',
  'reviewed_by',
  'reviewed_content_hash',
  'review_invalidated_at',
  'review_invalidation_reason',
]

function preserveServerOwnedReviewFields(submittedData, currentData) {
  const next = { ...submittedData }
  for (const field of SERVER_OWNED_REVIEW_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(currentData, field)) next[field] = currentData[field]
    else delete next[field]
  }
  return next
}

export function applyAdminEditReviewState({
  currentData,
  currentContent,
  submittedData,
  submittedContent,
  invalidatedAt,
}) {
  const next = preserveServerOwnedReviewFields(submittedData, currentData)
  const materialChanged = getReviewedContentFingerprint(currentData, currentContent) !==
    getReviewedContentFingerprint(submittedData, submittedContent)
  const requiresRereview = currentData.reviewed === true && (
    materialChanged || hasStaleReviewedContent(currentData, currentContent)
  )

  if (requiresRereview) {
    next.reviewed = false
    next.stock_status = 'ready'
    next.review_invalidated_at = invalidatedAt
    next.review_invalidation_reason = '承認後に記事内容が編集されたため、Human review をやり直してください'
  }

  return { data: next, requiresRereview }
}
