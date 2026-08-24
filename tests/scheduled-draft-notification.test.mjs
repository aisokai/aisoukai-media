import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScheduledStockNotification, classifyScheduledDraftOutcome, scheduledDraftNotificationBoundary, shouldSendDraftReviewNotification, shouldSendStockNoticeNotification } from '../scripts/lib/scheduled-draft-notification.mjs'

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
