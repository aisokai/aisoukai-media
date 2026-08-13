import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { applyTeacherApproval, assertExpectedContentVersion, getDmpArticleState, getContentVersion } from '../src/lib/dmpArticleState.mjs'
import { getPostPublicationStatus } from '../scripts/lib/post-publication-status.mjs'
import matter from 'gray-matter'
import { classifyScheduledDraftOutcome, scheduledDraftNotificationBoundary } from '../scripts/lib/scheduled-draft-notification.mjs'
import { reserveNotificationSend } from '../scripts/lib/notification-dedupe.mjs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const data = { title: 'テスト', date: '2026-08-01', draft: false, reviewed: false }
const content = '本文\n'

function currentHumanApprovedPosts() {
  return readdirSync('content/posts')
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({ file, parsed: matter(readFileSync(`content/posts/${file}`, 'utf8')) }))
    .filter(({ parsed }) => parsed.data.reviewed === true && !parsed.data.draft && !parsed.data.archived && !parsed.data.rejection_reason)
}

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

test('all current Human-approved posts retain one locked, publishable version after migration', () => {
  const approvedPosts = currentHumanApprovedPosts()
  assert.equal(approvedPosts.length, 33)
  for (const { file, parsed } of approvedPosts) {
    const status = getPostPublicationStatus(parsed.data, { today: '2026-08-11', content: parsed.content })
    assert.equal(status.publishable, true, file)
    assert.equal(parsed.data.reviewed_content_hash, getContentVersion(parsed.data, parsed.content), file)
  }
})

test('a later title or body edit loses publication until a fresh exact Human approval', () => {
  const [{ parsed }] = currentHumanApprovedPosts()
  const exact = getPostPublicationStatus(parsed.data, { today: '2026-08-11', content: parsed.content })
  const changedTitle = getPostPublicationStatus(
    { ...parsed.data, title: `${parsed.data.title}（改訂）` },
    { today: '2026-08-11', content: parsed.content },
  )
  const changedBody = getPostPublicationStatus(parsed.data, { today: '2026-08-11', content: `${parsed.content}\n改訂` })
  assert.equal(exact.publishable, true)
  assert.equal(changedTitle.publishable, false)
  assert.equal(changedBody.publishable, false)
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
