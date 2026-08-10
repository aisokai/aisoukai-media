import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { reserveNotificationSend } from '../scripts/lib/notification-dedupe.mjs'

test('same date, job, and text can only reserve one notification send', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-notify-dedupe-'))
  const first = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf', text: 'same message' })
  const second = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf', text: 'same message' })

  assert.equal(first.shouldSend, true)
  assert.equal(second.shouldSend, false)
  assert.equal(second.reason, 'duplicate')
})

test('changed notification text is not suppressed for the same job and date', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-notify-dedupe-'))
  const first = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf', text: 'no topic' })
  const second = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf', text: 'important error' })

  assert.equal(first.shouldSend, true)
  assert.equal(second.shouldSend, true)
})

test('failed sends can release the reservation so a retry can notify later', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-notify-dedupe-'))
  const first = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf', text: 'retry me' })
  first.release()

  const second = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf', text: 'retry me' })
  assert.equal(second.shouldSend, true)
})

test('review notifications dedupe by durable content version across dates, retry failures, and allow changed versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-notify-dedupe-'))
  const one = 'a'.repeat(64)
  const two = 'b'.repeat(64)
  const first = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf-review-request', text: 'one', contentVersion: one })
  first.commit()
  const otherDate = reserveNotificationSend({ root, date: '2026-07-01', job: 'ops-mwf-review-request', text: 'one revised', contentVersion: one })
  const changed = reserveNotificationSend({ root, date: '2026-07-01', job: 'ops-mwf-review-request', text: 'two', contentVersion: two })
  changed.release()
  const retry = reserveNotificationSend({ root, date: '2026-07-02', job: 'ops-mwf-review-request', text: 'two', contentVersion: two })
  assert.equal(otherDate.shouldSend, false)
  assert.equal(changed.shouldSend, true)
  assert.equal(retry.shouldSend, true)
})
