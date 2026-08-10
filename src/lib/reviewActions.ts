import matter from 'gray-matter'
import { applyTeacherApproval, assertExpectedContentVersion } from './dmpArticleState.mjs'

export type ReviewAction = 'approve' | 'reject'

export type ReviewUpdate = {
  nextPostMarkdown: string
  logEntry: string
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10)
}

function getJstTimestamp() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().replace('Z', '+09:00')
}

function normalizeDates(data: Record<string, unknown>) {
  const out = { ...data }
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) out[key] = value.toISOString().slice(0, 10)
  }
  return out
}

function buildReviewLogEntry({
  action,
  slug,
  reviewedBy,
  reason,
  date,
  publishAt,
}: {
  action: ReviewAction
  slug: string
  reviewedBy: string
  reason?: string
  date?: unknown
  publishAt?: unknown
}) {
  const datetime = getJstTimestamp()
  const lines = [`## ${datetime}`]
  lines.push(`datetime: ${datetime}`)
  lines.push(`action: ${action}`)
  lines.push(`slug: ${slug}`)
  lines.push(`reviewed_by: ${reviewedBy}`)
  if (reason) {
    lines.push(`reason: ${reason}`)
    lines.push(`reject_reason: ${reason}`)
  }
  if (date) lines.push(`date: ${date}`)
  if (publishAt) lines.push(`publish_at: ${publishAt}`)
  lines.push('')
  return lines.join('\n') + '\n'
}

export function approvePostMarkdown(raw: string, slug: string, reviewedBy: string, expectedContentVersion: string): ReviewUpdate {
  const parsed = matter(raw)
  const data = normalizeDates(parsed.data)
  const today = getTodayIso()

  assertExpectedContentVersion({ data, content: parsed.content, expectedContentVersion })
  Object.assign(data, applyTeacherApproval({ data, content: parsed.content, reviewedBy, reviewedAt: today }))
  delete data.rejection_reason
  delete data.review_invalidated_at
  delete data.review_invalidation_reason

  return {
    nextPostMarkdown: matter.stringify(parsed.content, data),
    logEntry: buildReviewLogEntry({
      action: 'approve',
      slug,
      reviewedBy,
      date: data.date,
      publishAt: data.publish_at,
    }),
  }
}

export function rejectPostMarkdown(
  raw: string,
  slug: string,
  reviewedBy: string,
  reason: string,
  expectedContentVersion: string,
): ReviewUpdate {
  const parsed = matter(raw)
  const data = normalizeDates(parsed.data)
  assertExpectedContentVersion({ data, content: parsed.content, expectedContentVersion })

  data.reviewed = false
  data.rejection_reason = reason
  data.stock_status = 'rejected'
  delete data.reviewed_content_hash

  return {
    nextPostMarkdown: matter.stringify(parsed.content, data),
    logEntry: buildReviewLogEntry({
      action: 'reject',
      slug,
      reviewedBy,
      reason,
      date: data.date,
      publishAt: data.publish_at,
    }),
  }
}
