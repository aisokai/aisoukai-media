import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { readRetryableNotification, reserveNotificationSend } from '../scripts/lib/notification-dedupe.mjs'

test('same date, job, and text can only reserve one notification send', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-notify-dedupe-'))
  const first = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf', text: 'same message' })
  const second = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf', text: 'same message' })

  assert.equal(first.shouldSend, true)
  assert.equal(second.shouldSend, false)
  assert.equal(second.reason, 'in-flight')
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

test('legacy review-request failures remain stored but are not selected by the stock-notice retry job', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-notify-dedupe-'))
  const version = 'c'.repeat(64)
  const first = reserveNotificationSend({ root, date: '2026-08-12', job: 'ops-mwf-review-request', text: 'retry me', contentVersion: version })
  first.fail({ text: 'retry me' })
  assert.deepEqual(readRetryableNotification({ root, job: 'ops-mwf-review-request' })?.contentVersion, version)
  assert.equal(readRetryableNotification({ root, job: 'ops-mwf-stock-notice' }), null)
  const stockNotice = reserveNotificationSend({ root, date: '2026-08-13', job: 'ops-mwf-stock-notice', text: 'stock notice', contentVersion: version })
  assert.equal(stockNotice.shouldSend, true)
})

test('an interrupted stale reservation is retryable while a fresh reservation remains in flight', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-notify-dedupe-'))
  const version = 'd'.repeat(64)
  const first = reserveNotificationSend({ root, date: '2026-08-12', job: 'ops-mwf-review-request', text: 'retry me', contentVersion: version })
  const concurrent = reserveNotificationSend({ root, date: '2026-08-12', job: 'ops-mwf-review-request', text: 'retry me', contentVersion: version })
  assert.equal(concurrent.shouldSend, false)
  assert.equal(concurrent.reason, 'in-flight')
  const record = JSON.parse(readFileSync(first.path, 'utf8'))
  writeFileSync(first.path, `${JSON.stringify({ ...record, createdAt: '2000-01-01T00:00:00.000Z' })}\n`)
  assert.equal(readRetryableNotification({ root, job: 'ops-mwf-review-request' })?.contentVersion, version)
  const recovered = reserveNotificationSend({ root, date: '2026-08-12', job: 'ops-mwf-review-request', text: 'retry me', contentVersion: version })
  assert.equal(recovered.shouldSend, true)
})

test('a fresh interrupted reservation is not selected for retry', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-notify-dedupe-'))
  const version = 'e'.repeat(64)
  reserveNotificationSend({ root, date: '2026-08-12', job: 'ops-mwf-review-request', text: 'in flight', contentVersion: version })
  assert.equal(readRetryableNotification({ root, job: 'ops-mwf-review-request' }), null)
})

test('stock notices dedupe by durable content version across dates and allow changed versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-notify-dedupe-'))
  const one = 'a'.repeat(64)
  const two = 'b'.repeat(64)
  const first = reserveNotificationSend({ root, date: '2026-06-29', job: 'ops-mwf-stock-notice', text: 'one', contentVersion: one })
  first.commit()
  const otherDate = reserveNotificationSend({ root, date: '2026-07-01', job: 'ops-mwf-stock-notice', text: 'one revised', contentVersion: one })
  const changed = reserveNotificationSend({ root, date: '2026-07-01', job: 'ops-mwf-stock-notice', text: 'two', contentVersion: two })
  changed.release()
  const retry = reserveNotificationSend({ root, date: '2026-07-02', job: 'ops-mwf-stock-notice', text: 'two', contentVersion: two })
  assert.equal(otherDate.shouldSend, false)
  assert.equal(changed.shouldSend, true)
  assert.equal(retry.shouldSend, true)
})
