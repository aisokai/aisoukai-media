import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { applyTeacherApproval, assertExpectedContentVersion, getDmpArticleState, getContentVersion } from '../src/lib/dmpArticleState.mjs'
import { classifyScheduledDraftOutcome, scheduledDraftNotificationBoundary } from '../scripts/lib/scheduled-draft-notification.mjs'
import { reserveNotificationSend } from '../scripts/lib/notification-dedupe.mjs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const data = { title: 'テスト', date: '2026-08-01', draft: false, reviewed: false }
const content = '本文\n'

test('only exact Human approval makes a draft publishable', () => {
  const version = getContentVersion(data, content)
  assert.throws(() => assertExpectedContentVersion({ data, content, expectedContentVersion: 'f'.repeat(64) }), /更新/)
  const generated = { ...data, draft: true, stock_status: 'ready' }
  const approved = applyTeacherApproval({ data: generated, content, reviewedBy: '先生', reviewedAt: '2026-08-01' })
  assert.equal(approved.reviewed_content_hash, getContentVersion(approved, content))
  assert.equal(getDmpArticleState({ data: approved, content, today: '2026-08-02' }).publishable, true)
  assert.equal(getDmpArticleState({ data: { ...data, reviewed: false }, content, today: '2026-08-02' }).publishable, false)
  assert.equal(version.length, 64)
})

test('monthly CSV generation and MWF schedule remain, while only successful sends dedupe', () => {
  const monthly = readFileSync('scripts/generate-monthly-topic-candidates.mjs', 'utf8')
  const ops = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  assert.match(monthly, /candidateCount = 24/)
  assert.match(monthly, /cadence: 'MWF'/)
  assert.match(ops, /SEND_DAYS/)
  const outcome = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true, path: 'content/posts/2026-08-01-test.md' },
    stockResult: { ok: true, stocked: true },
  })
  const boundary = scheduledDraftNotificationBoundary(outcome)
  const root = mkdtempSync(join(tmpdir(), 'dmp-simple-flow-'))
  const first = reserveNotificationSend({ root, date: '2026-08-12', job: boundary.job, text: 'review', contentVersion: boundary.contentVersion })
  first.commit({ text: 'review' })
  const duplicate = reserveNotificationSend({ root, date: '2026-08-13', job: boundary.job, text: 'review', contentVersion: boundary.contentVersion })
  assert.equal(boundary.shouldSend, true)
  assert.equal(duplicate.shouldSend, false)
})
