import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyScheduledDraftOutcome,
  scheduledDraftNotificationBoundary,
  shouldSendDraftReviewNotification,
  shouldSendScheduledIncidentNotification,
} from '../scripts/lib/scheduled-draft-notification.mjs'

test('only a zero-exit generated draft with successful sync is review-ready', () => {
  const awaitingSync = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
  })
  const reviewReady = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    draftSyncResult: { ok: true, committed: true },
  })

  assert.equal(awaitingSync.kind, 'generated-awaiting-sync')
  assert.equal(shouldSendDraftReviewNotification(awaitingSync), false)
  assert.equal(reviewReady.kind, 'review-ready')
  assert.equal(reviewReady.exitCode, 0)
  assert.equal(shouldSendDraftReviewNotification(reviewReady), true)
  assert.deepEqual(scheduledDraftNotificationBoundary(reviewReady), {
    kind: 'review-request',
    shouldSend: true,
    job: 'ops-mwf-review-request',
  })
})

test('nonzero child exits are distinct incidents and preserve their exact exit code', () => {
  for (const childStatus of [1, 2, 17, 130]) {
    const outcome = classifyScheduledDraftOutcome({
      childStatus,
      scheduledResult: { ok: false, generated: false },
    })
    assert.equal(outcome.kind, 'incident')
    assert.equal(outcome.exitCode, childStatus)
    assert.equal(shouldSendDraftReviewNotification(outcome), false)
    assert.equal(shouldSendScheduledIncidentNotification(outcome), true)
    assert.equal(scheduledDraftNotificationBoundary(outcome).job, 'ops-mwf-incident')
  }
})

test('null and malformed child results fail closed as incidents', () => {
  const cases = [
    { childStatus: null, scheduledResult: { ok: true, generated: true } },
    { childStatus: 0, scheduledResult: null },
    { childStatus: 0, scheduledResult: {} },
    { childStatus: 0, scheduledResult: { ok: true, generated: 'yes' } },
    { childStatus: 0, scheduledResult: { ok: false, generated: true } },
  ]

  for (const input of cases) {
    const outcome = classifyScheduledDraftOutcome(input)
    assert.equal(outcome.kind, 'incident')
    assert.equal(outcome.exitCode, 1)
    assert.equal(shouldSendDraftReviewNotification(outcome), false)
  }
})

test('no-draft and sync-failure outcomes have zero review-request sends', () => {
  const noDraft = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: false },
  })
  const syncFailure = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    draftSyncResult: { ok: false, reason: 'test failure' },
  })
  const skippedSync = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    draftSyncResult: { ok: true, committed: true, skipped: true },
  })
  const uncommittedSync = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    draftSyncResult: { ok: true, committed: false },
  })
  const incompleteSync = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    draftSyncResult: { ok: true },
  })

  assert.equal(noDraft.kind, 'no-draft')
  assert.equal(noDraft.exitCode, 0)
  assert.equal(scheduledDraftNotificationBoundary(noDraft).shouldSend, false)
  assert.equal(syncFailure.kind, 'sync-failure')
  assert.equal(syncFailure.exitCode, 1)
  assert.equal(shouldSendDraftReviewNotification(syncFailure), false)
  assert.equal(shouldSendScheduledIncidentNotification(syncFailure), true)
  assert.equal(skippedSync.kind, 'sync-failure')
  assert.equal(uncommittedSync.kind, 'sync-failure')
  assert.equal(incompleteSync.kind, 'sync-failure')
  assert.equal(shouldSendDraftReviewNotification(uncommittedSync), false)
  assert.equal(shouldSendDraftReviewNotification(incompleteSync), false)
})

test('review requests and incidents use separate stable dedupe identities', () => {
  const reviewReady = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    draftSyncResult: { ok: true, committed: true },
  })
  const incident = classifyScheduledDraftOutcome({
    childStatus: 7,
    scheduledResult: { ok: false, generated: false },
  })

  assert.equal(scheduledDraftNotificationBoundary(reviewReady).job, 'ops-mwf-review-request')
  assert.equal(scheduledDraftNotificationBoundary(incident).job, 'ops-mwf-incident')
  assert.notEqual(
    scheduledDraftNotificationBoundary(reviewReady).job,
    scheduledDraftNotificationBoundary(incident).job,
  )
})
