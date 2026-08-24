import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScheduledReviewNotification, buildScheduledStockNotification, contentVersionForResolvedEntries, classifyScheduledDraftOutcome, scheduledDraftNotificationBoundary, shouldSendDraftReviewNotification, shouldSendStockNoticeNotification } from '../scripts/lib/scheduled-draft-notification.mjs'

const generated = { ok: true, generated: true, path: 'content/posts/2026-08-12-topic.md' }
const stocked = { ok: true, stocked: true, contentVersion: 'a'.repeat(64) }

test('stock notification identifies local-only storage without a production approval CTA or URL', () => {
  const notification = buildScheduledStockNotification()

  assert.match(notification, /ローカルのストックに1件保存しました/)
  assert.match(notification, /本番の管理画面にはまだ反映されていません/)
  assert.doesNotMatch(notification, /承認|\/admin|https?:\/\//)
})

test('a generated article reaches notification only after durable stock', () => {
  const waiting = classifyScheduledDraftOutcome({ childStatus: 0, scheduledResult: generated })
  assert.equal(waiting.kind, 'generated-awaiting-stock')
  assert.equal(scheduledDraftNotificationBoundary(waiting).shouldSend, false)
  const outcome = classifyScheduledDraftOutcome({ childStatus: 0, scheduledResult: generated, stockResult: stocked })
  assert.equal(outcome.kind, 'stocked')
  assert.equal(scheduledDraftNotificationBoundary(outcome).kind, 'stock-notice')
  assert.equal(scheduledDraftNotificationBoundary(outcome).job, 'ops-mwf-stock-notice')
  assert.equal(shouldSendStockNoticeNotification(outcome), true)
  assert.equal(shouldSendDraftReviewNotification(outcome), false)
})

test('only an exactly verified remote sync may use the production review CTA', () => {
  const synced = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: generated,
    stockResult: stocked,
    draftSyncResult: { ok: true, synced: true, remoteHead: 'b'.repeat(40) },
  })
  assert.equal(synced.kind, 'synced')
  assert.deepEqual(scheduledDraftNotificationBoundary(synced), {
    kind: 'review-request',
    shouldSend: true,
    job: 'ops-mwf-review-request',
    contentVersion: 'a'.repeat(64),
  })
  assert.match(buildScheduledReviewNotification(), /Human承認/)
  assert.match(buildScheduledReviewNotification(), /\/admin\/pending-review/)

  const failed = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: generated,
    stockResult: stocked,
    draftSyncResult: { ok: false, pendingSync: true, reason: 'origin/main diverged' },
  })
  assert.equal(failed.kind, 'stocked')
  assert.equal(scheduledDraftNotificationBoundary(failed).job, 'ops-mwf-stock-notice')
  assert.doesNotMatch(buildScheduledStockNotification(), /\/admin|https?:\/\//)
})

test('a single review digest reports every resolved entry and has a set-based content version', () => {
  const resolvedEntries = [
    { path: 'content/posts/2026-08-12-topic.md', contentSha256: 'a'.repeat(64) },
    { path: 'content/posts/2026-08-14-topic.md', contentSha256: 'b'.repeat(64) },
  ]
  const expectedVersion = createHash('sha256')
    .update(['a'.repeat(64), 'b'.repeat(64)].join('\n'))
    .digest('hex')

  const notification = buildScheduledReviewNotification({ resolvedEntries })
  assert.match(notification, /2件/)
  assert.match(notification, /Human承認/)
  assert.match(notification, /\/admin\/pending-review/)
  assert.equal(contentVersionForResolvedEntries(resolvedEntries), expectedVersion)
  assert.equal(contentVersionForResolvedEntries([...resolvedEntries].reverse()), expectedVersion)
})

test('a changed resolved-entry set produces a different digest notification key', () => {
  const one = [{ path: 'content/posts/2026-08-12-topic.md', contentSha256: 'a'.repeat(64) }]
  const two = [...one, { path: 'content/posts/2026-08-14-topic.md', contentSha256: 'b'.repeat(64) }]
  assert.notEqual(contentVersionForResolvedEntries(one), contentVersionForResolvedEntries(two))
})

test('8/12 regression: stock, pending-sync, divergence, high-risk, and unapproved diagnostics do not suppress notification', () => {
  for (const diagnostics of [
    {},
    { draftSyncResult: { ok: false, reason: 'stocked-pending-sync' } },
    { gitReadiness: { ok: false, reason: 'ahead/behind divergence' } },
    { draftData: { medical_risk: 'high', reviewed: false } },
    { adminDiscoverability: null, draftData: { reviewed: false } },
  ]) {
    const outcome = classifyScheduledDraftOutcome({ childStatus: 0, scheduledResult: generated, stockResult: stocked, ...diagnostics })
    assert.equal(outcome.kind, 'stocked')
    assert.equal(scheduledDraftNotificationBoundary(outcome).shouldSend, true)
  }
})

test('only generation, stock, and malformed-result failures stop the review request', () => {
  for (const input of [
    { childStatus: 1, scheduledResult: { ok: false, generated: false } },
    { childStatus: 0, scheduledResult: generated, stockResult: { ok: false, stocked: false } },
    { childStatus: 0, scheduledResult: {} },
  ]) {
    const outcome = classifyScheduledDraftOutcome(input)
    assert.equal(outcome.kind, 'incident')
    assert.equal(scheduledDraftNotificationBoundary(outcome).shouldSend, true)
  }
  const empty = classifyScheduledDraftOutcome({ childStatus: 0, scheduledResult: { ok: true, generated: false } })
  assert.equal(empty.kind, 'no-draft')
  assert.equal(scheduledDraftNotificationBoundary(empty).shouldSend, false)
})
