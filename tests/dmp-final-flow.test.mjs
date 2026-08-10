import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { applyTeacherApproval, assertExpectedContentVersion, getDmpArticleState, getContentVersion } from '../src/lib/dmpArticleState.mjs'
import { confirmAdminReviewSourceVersion } from '../scripts/lib/admin-review-source-visibility.mjs'
import { classifyScheduledDraftOutcome, scheduledDraftNotificationBoundary } from '../scripts/lib/scheduled-draft-notification.mjs'
import { reserveNotificationSend } from '../scripts/lib/notification-dedupe.mjs'
import { recheckPendingReviewReceipt, writePendingReviewReceipt } from '../scripts/lib/pending-review-recheck.mjs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const data = { title: 'テスト', date: '2026-08-01', draft: false, reviewed: false }
const content = '本文\n'

test('five-stage DMP sequence requires exact discoverability, CAS review, then exact-version publication', () => {
  const version = getContentVersion(data, content)
  const drafted = getDmpArticleState({ data, content })
  const discoverable = getDmpArticleState({ data, content,
    adminDiscoverability: { status: 'confirmed', source: 'admin-review-source', contentVersion: version } })
  const approved = { ...data, reviewed: true, reviewed_at: '2026-08-01', reviewed_by: '先生', reviewed_content_hash: version }
  const published = getDmpArticleState({ data: approved, content, today: '2026-08-02' })
  assert.equal(drafted.reviewReady, false)
  assert.equal(discoverable.reviewReady, true)
  assert.equal(approved.reviewed_content_hash, version)
  assert.equal(published.publishable, true)
})

test('approval and rejection are content-version compare-and-set operations', () => {
  const version = getContentVersion(data, content)
  assert.throws(() => assertExpectedContentVersion({ data, content, expectedContentVersion: 'f'.repeat(64) }), /更新/)
  assert.throws(() => assertExpectedContentVersion({ data, content, expectedContentVersion: '' }), /更新/)
  assert.equal(assertExpectedContentVersion({ data, content, expectedContentVersion: version }), version)
  const rejected = { ...data, rejection_reason: '理由' }
  assert.equal(getDmpArticleState({ data: rejected, content, today: '2026-08-02' }).publishable, false)
  const approved = { ...data, reviewed: true, reviewed_at: '2026-08-01', reviewed_by: '先生', reviewed_content_hash: version }
  assert.equal(getDmpArticleState({ data: approved, content: '変更本文', today: '2026-08-02' }).publishable, false)
})

test('a generated ready draft becomes publishable immediately after exact approval', () => {
  const generatedDraft = { ...data, draft: true, stock_status: 'ready', reviewed: false }
  const expected = getContentVersion(generatedDraft, content)
  assert.equal(assertExpectedContentVersion({ data: generatedDraft, content, expectedContentVersion: expected }), expected)
  const approved = applyTeacherApproval({ data: generatedDraft, content, reviewedBy: '先生', reviewedAt: '2026-08-01' })
  assert.equal(approved.draft, false)
  assert.equal(approved.stock_status, 'adopted')
  assert.equal(getDmpArticleState({ data: approved, content, today: '2026-08-02' }).approvedExactVersion, true)
  assert.equal(getDmpArticleState({ data: approved, content, today: '2026-08-02' }).publishable, true)
})

test('monthly topic collection and three-per-week draft entry points remain intact', () => {
  const monthly = readFileSync('scripts/generate-monthly-topic-candidates.mjs', 'utf8')
  const batch = readFileSync('scripts/generate-scheduled-drafts.mjs', 'utf8')
  assert.match(monthly, /candidateCount = 24/)
  assert.match(monthly, /cadence: 'MWF'/)
  assert.match(batch, /article:batch-scheduled/)
  assert.match(batch, /\.slice\(0, limit\)/)
})

test('only an exact version found in the admin source branch confirms discoverability', () => {
  const exact = confirmAdminReviewSourceVersion({ localData: data, localContent: content, sourceData: data, sourceContent: content })
  const changed = confirmAdminReviewSourceVersion({ localData: data, localContent: content, sourceData: data, sourceContent: 'changed' })
  assert.equal(exact?.contentVersion, getContentVersion(data, content))
  assert.equal(changed, null)
  const ops = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  assert.match(ops, /git', \['show', `origin\/main:\$\{relativePath\}`\]/)
  assert.match(ops, /confirmAdminReviewSourceVersion/)
})

test('review action snapshots and conditionally updates the remote branch', () => {
  const actions = readFileSync('src/app/admin/pending-review/actions.ts', 'utf8')
  const github = readFileSync('src/lib/githubContents.ts', 'utf8')
  assert.match(actions, /readGitHubBranchHead/)
  assert.match(actions, /readGitHubFile\(postPath, \{ ref: expectedHeadSha \}\)/)
  assert.match(actions, /\{ expectedHeadSha \}/)
  assert.match(github, /ref\.object\.sha !== expectedHeadSha/)
  assert.match(github, /force: false/)
})

test('later weekly recheck promotes only an owned exact source version and durable dedupe suppresses repeats', () => {
  const local = { title: 'pending', draft: true, reviewed: false }
  const version = getContentVersion(local, content)
  const first = classifyScheduledDraftOutcome({
    childStatus: 0, scheduledResult: { ok: true, generated: true, path: 'content/posts/2026-08-01-pending.md' },
    stockResult: { ok: true, stocked: true }, draftSyncResult: { ok: true, committed: true }, draftData: local, draftContent: content,
  })
  assert.equal(first.kind, 'stocked-pending-sync')
  const confirmed = confirmAdminReviewSourceVersion({ localData: local, localContent: content, sourceData: local, sourceContent: content })
  const later = classifyScheduledDraftOutcome({
    childStatus: 0, scheduledResult: { ok: true, generated: true, path: 'content/posts/2026-08-01-pending.md' },
    stockResult: { ok: true, stocked: true }, draftSyncResult: { ok: true, committed: true, rechecked: true },
    draftData: local, draftContent: content, adminDiscoverability: confirmed,
  })
  const boundary = scheduledDraftNotificationBoundary(later)
  assert.equal(boundary.shouldSend, true)
  assert.equal(boundary.contentVersion, version)
  const root = mkdtempSync(join(tmpdir(), 'dmp-later-recheck-'))
  const receiptPath = join(root, 'ops-mwf-review-pending.json')
  assert.equal(writePendingReviewReceipt(receiptPath, { path: 'content/posts/2026-08-01-pending.md', contentVersion: version }), true)
  assert.equal(recheckPendingReviewReceipt({ filePath: receiptPath, adminSourceFresh: false, inspect: () => ({ reviewInput: { adminDiscoverability: confirmed } }) }), null)
  const rechecked = recheckPendingReviewReceipt({ filePath: receiptPath, adminSourceFresh: true,
    inspect: () => ({ reviewInput: { adminDiscoverability: confirmed } }) })
  assert.equal(rechecked?.receipt.contentVersion, version)
  const sent = reserveNotificationSend({ root, date: '2026-08-02', job: boundary.job, text: 'review', contentVersion: version })
  sent.commit()
  const duplicate = reserveNotificationSend({ root, date: '2026-08-09', job: boundary.job, text: 'review', contentVersion: version })
  assert.equal(duplicate.shouldSend, false)
  // Fresh source visibility is deliberately independent from a local worktree's
  // behind/dirty readiness; only the already-fetched source ref is required.
  assert.equal(readFileSync('scripts/ops-mwf.mjs', 'utf8').includes('adminSourceFresh: readiness.ok === true'), false)
  const ops = readFileSync('scripts/ops-mwf.mjs', 'utf8')
  assert.match(ops, /rememberOwnedPendingReviewDraft/)
  assert.match(ops, /pendingReviewRecheckReadiness\(gitReadiness\)/)
  assert.match(ops, /recheckOwnedPendingReviewDraft\(\{ adminSourceFresh: pendingReviewReadiness\?\.adminSourceFresh \}\)/)
  assert.match(readFileSync('scripts/lib/pending-review-recheck.mjs', 'utf8'), /if \(adminSourceFresh !== true\) return null/)
})
