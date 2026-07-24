import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldSendDraftReviewNotification } from '../scripts/lib/scheduled-draft-notification.mjs'

test('draft recovery failure has zero review-notification sends', () => {
  assert.equal(shouldSendDraftReviewNotification({ ok: false }), false)
})

test('no draft sync failure permits the normal notification path', () => {
  assert.equal(shouldSendDraftReviewNotification(null), true)
  assert.equal(shouldSendDraftReviewNotification({ ok: true }), true)
})
