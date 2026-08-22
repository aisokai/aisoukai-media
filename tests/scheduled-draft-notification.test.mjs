import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScheduledStockNotification, classifyScheduledDraftOutcome, scheduledDraftNotificationBoundary, shouldSendDraftReviewNotification } from '../scripts/lib/scheduled-draft-notification.mjs'

const generated = { ok: true, generated: true, path: 'content/posts/2026-08-12-topic.md' }
const stocked = { ok: true, stocked: true, contentVersion: 'a'.repeat(64) }

test('stock notification states local storage and production-admin visibility without changing the review request', () => {
  const dashboardUrl = 'https://example.test/admin/pending-review'
  const notification = buildScheduledStockNotification({ dashboardUrl })

  assert.match(notification, /ローカルに1件保存しました/)
  assert.match(notification, /ローカル保存のため、本番の管理画面にはまだ表示されない場合があります/)
  assert.match(notification, /内容とリスク情報を確認して承認してください/)
  assert.match(notification, new RegExp(`${dashboardUrl.replaceAll('/', '\\/')}$`))
})

test('a generated article reaches notification only after durable stock', () => {
  const waiting = classifyScheduledDraftOutcome({ childStatus: 0, scheduledResult: generated })
  assert.equal(waiting.kind, 'generated-awaiting-stock')
  assert.equal(scheduledDraftNotificationBoundary(waiting).shouldSend, false)
  const outcome = classifyScheduledDraftOutcome({ childStatus: 0, scheduledResult: generated, stockResult: stocked })
  assert.equal(outcome.kind, 'stocked')
  assert.equal(shouldSendDraftReviewNotification(outcome), true)
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
