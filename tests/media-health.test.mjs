import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHealthReport } from '../scripts/media-health.mjs'
import { buildStatusSummary } from '../scripts/media-status.mjs'

test('health report は必須チェックを含み、秘密値らしきキーを含まない', () => {
  const { checks } = buildHealthReport()
  const names = checks.map((c) => c.name).join('\n')
  assert.match(names, /media-queue/)
  assert.match(names, /gate config/)
  assert.match(names, /queue整合性/)
  const serialized = JSON.stringify(checks)
  assert.ok(!/token|secret|api[_-]?key|password/i.test(serialized))
})

test('status summary は件数のみを返す (本文・秘密値を含まない)', () => {
  const summary = buildStatusSummary()
  assert.equal(typeof summary.queue_total, 'number')
  assert.equal(typeof summary.review_pending, 'number')
  assert.equal(typeof summary.human_required, 'number')
  assert.equal(typeof summary.failed, 'number')
  assert.equal(typeof summary.sns_drafts, 'number')
  assert.equal(typeof summary.gmb_drafts, 'number')
  assert.equal(typeof summary.gmb_reply_drafts, 'number')
  assert.equal(typeof summary.emergency_drafts, 'number')
})
