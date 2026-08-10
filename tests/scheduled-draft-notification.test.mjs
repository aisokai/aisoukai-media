import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyScheduledDraftOutcome,
  scheduledDraftNotificationBoundary,
  shouldSendDraftReviewNotification,
  shouldSendScheduledIncidentNotification,
  shouldSendStockUpdateNotification,
} from '../scripts/lib/scheduled-draft-notification.mjs'
import { getContentVersion } from '../src/lib/dmpArticleState.mjs'
import { confirmAdminReviewSourceVersion } from '../scripts/lib/admin-review-source-visibility.mjs'

const generated = { ok: true, generated: true }
const stocked = { ok: true, stocked: true }

test('a generated draft is not classified for notification until durable stocking is recorded', () => {
  const outcome = classifyScheduledDraftOutcome({ childStatus: 0, scheduledResult: generated })
  assert.equal(outcome.kind, 'generated-awaiting-stock')
  assert.equal(outcome.exitCode, 0)
  assert.equal(scheduledDraftNotificationBoundary(outcome).shouldSend, false)
})

test('pending sync cannot notify; only a confirmed exact admin-source version can notify', () => {
  const pending = classifyScheduledDraftOutcome({
    childStatus: 0, scheduledResult: generated, stockResult: stocked,
    draftSyncResult: { ok: true, committed: true }, draftData: { title: '下書き' }, draftContent: '本文',
  })
  assert.equal(pending.kind, 'stocked-pending-sync')
  assert.equal(shouldSendDraftReviewNotification(pending), false)
  const contentVersion = getContentVersion({ title: '下書き' }, '本文')
  const outcome = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: generated,
    stockResult: stocked,
    draftSyncResult: { ok: true, committed: true }, draftData: { title: '下書き' }, draftContent: '本文',
    adminDiscoverability: confirmAdminReviewSourceVersion({
      localData: { title: '下書き' }, localContent: '本文',
      sourceData: { title: '下書き' }, sourceContent: '本文',
    }),
  })
  assert.equal(outcome.kind, 'review-ready')
  assert.equal(outcome.exitCode, 0)
  assert.equal(shouldSendDraftReviewNotification(outcome), true)
  assert.equal(shouldSendStockUpdateNotification(outcome), false)
  assert.equal(scheduledDraftNotificationBoundary(outcome).kind, 'review-request')
  assert.equal(scheduledDraftNotificationBoundary(outcome).contentVersion, contentVersion)
})

test('Git-only sync inability is an exit-zero stocked update and never an incident', () => {
  for (const draftSyncResult of [
    { ok: false, reason: 'foreign tracked change' },
    { ok: false, reason: 'foreign untracked change' },
    { ok: false, reason: 'foreign staged change' },
    { ok: false, reason: 'behind' },
    { ok: false, reason: 'diverged' },
    { ok: false, reason: 'fetch failure' },
    { ok: false, reason: 'index lock' },
    { ok: false, reason: 'unknown status' },
  ]) {
    const outcome = classifyScheduledDraftOutcome({
      childStatus: 0,
      scheduledResult: generated,
      stockResult: stocked,
      draftSyncResult,
    })
    assert.equal(outcome.kind, 'stocked-pending-sync')
    assert.equal(outcome.exitCode, 0)
    assert.equal(shouldSendScheduledIncidentNotification(outcome), false)
    assert.equal(shouldSendStockUpdateNotification(outcome), false)
    assert.deepEqual(scheduledDraftNotificationBoundary(outcome), { kind: 'suppressed', shouldSend: false, job: null })
  }
})

test('only inability to stock or generation failure is an incident', () => {
  const stockFailure = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: generated,
    stockResult: { ok: false, stocked: false, reason: 'unsafe path' },
  })
  assert.equal(stockFailure.kind, 'incident')
  assert.equal(stockFailure.exitCode, 1)
  assert.equal(shouldSendScheduledIncidentNotification(stockFailure), true)

  for (const childStatus of [1, 2, 17, 130, 143]) {
    const failure = classifyScheduledDraftOutcome({
      childStatus,
      scheduledResult: { ok: false, generated: false },
    })
    assert.equal(failure.kind, 'incident')
    assert.equal(failure.exitCode, childStatus)
  }
})

test('malformed child results fail closed and no-draft remains a quiet success', () => {
  for (const input of [
    { childStatus: null, scheduledResult: generated },
    { childStatus: 0, scheduledResult: null },
    { childStatus: 0, scheduledResult: {} },
    { childStatus: 0, scheduledResult: { ok: true, generated: 'yes' } },
    { childStatus: 0, scheduledResult: { ok: false, generated: true } },
  ]) {
    const outcome = classifyScheduledDraftOutcome(input)
    assert.equal(outcome.kind, 'incident')
    assert.equal(outcome.exitCode, 1)
  }

  const noDraft = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: false },
  })
  assert.equal(noDraft.kind, 'no-draft')
  assert.equal(noDraft.exitCode, 0)
  assert.equal(scheduledDraftNotificationBoundary(noDraft).shouldSend, false)
})

test('notification boundaries reject incomplete forged outcome shapes', () => {
  assert.equal(shouldSendDraftReviewNotification({ kind: 'review-ready', reviewReady: true, exitCode: 0 }), false)
  assert.equal(shouldSendStockUpdateNotification({ kind: 'stocked-pending-sync', exitCode: 0 }), false)
})
