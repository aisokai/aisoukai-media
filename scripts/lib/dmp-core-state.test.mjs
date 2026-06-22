import test from 'node:test'
import assert from 'node:assert/strict'

import {
  WORKFLOW_STATUS,
  REVIEW_STATUS,
  IMAGE_STATUS,
  GIT_STATUS,
  classifyWorkflowStatus,
  classifyReviewStatus,
  isReviewQueueItem,
  classifyImageStatus,
  isImageMissing,
  normalizeGitStatus,
  summarizeWorkflowCounts,
} from './dmp-core-state.mjs'

const TODAY = '2026-06-22'
const FUTURE = '2026-12-31'
const PAST = '2026-01-01'

// ── workflow_status ──────────────────────────────────────────────────────────

test('draft:true は draft', () => {
  assert.equal(classifyWorkflowStatus({ draft: true, date: PAST }, { today: TODAY }), WORKFLOW_STATUS.DRAFT)
})

test('archived:true は blocked（draft より優先）', () => {
  assert.equal(
    classifyWorkflowStatus({ archived: true, draft: true, date: PAST }, { today: TODAY }),
    WORKFLOW_STATUS.BLOCKED,
  )
})

test('rejection_reason ありは blocked（差し戻し）', () => {
  assert.equal(
    classifyWorkflowStatus({ rejection_reason: '表現を修正', date: PAST }, { today: TODAY }),
    WORKFLOW_STATUS.BLOCKED,
  )
})

test('未承認は review_waiting', () => {
  assert.equal(classifyWorkflowStatus({ date: PAST }, { today: TODAY }), WORKFLOW_STATUS.REVIEW_WAITING)
})

test('reviewed:true かつ日付到来は published', () => {
  assert.equal(
    classifyWorkflowStatus({ reviewed: true, date: PAST }, { today: TODAY }),
    WORKFLOW_STATUS.PUBLISHED,
  )
})

test('reviewed:true だが未来日付は publish_waiting', () => {
  assert.equal(
    classifyWorkflowStatus({ reviewed: true, date: FUTURE }, { today: TODAY }),
    WORKFLOW_STATUS.PUBLISH_WAITING,
  )
})

test('不正入力は unknown', () => {
  assert.equal(classifyWorkflowStatus(null, { today: TODAY }), WORKFLOW_STATUS.UNKNOWN)
  assert.equal(classifyWorkflowStatus('x', { today: TODAY }), WORKFLOW_STATUS.UNKNOWN)
})

// ── review_status ────────────────────────────────────────────────────────────

test('review_status: 差し戻し / 承認 / 待ち', () => {
  assert.equal(classifyReviewStatus({ rejection_reason: 'x' }), REVIEW_STATUS.RETURNED)
  assert.equal(classifyReviewStatus({ reviewed: true }), REVIEW_STATUS.APPROVED)
  assert.equal(classifyReviewStatus({}), REVIEW_STATUS.REVIEW_WAITING)
})

// ── isReviewQueueItem（/admin pending-review と一致）──────────────────────────

test('isReviewQueueItem: archived 除外 / reviewed 除外 / 差し戻しは残す', () => {
  assert.equal(isReviewQueueItem({ archived: true }), false)
  assert.equal(isReviewQueueItem({ reviewed: true }), false)
  assert.equal(isReviewQueueItem({ rejection_reason: 'x' }), true)
  assert.equal(isReviewQueueItem({}), true)
})

// ── image_status ─────────────────────────────────────────────────────────────

test('image_status: 未設定 / alt不足 / ok を区別', () => {
  assert.equal(classifyImageStatus({}), IMAGE_STATUS.MISSING_IMAGE)
  assert.equal(classifyImageStatus({ image: '/images/a.jpg' }), IMAGE_STATUS.MISSING_ALT)
  assert.equal(classifyImageStatus({ image: '/images/a.jpg', image_alt: '説明' }), IMAGE_STATUS.OK)
})

test('image_status: repoRoot 指定でファイル欠落を検出', () => {
  const fileExists = (p) => p.endsWith('/public/images/exists.jpg')
  assert.equal(
    classifyImageStatus({ image: '/images/exists.jpg', image_alt: 'a' }, { repoRoot: '/repo', fileExists }),
    IMAGE_STATUS.OK,
  )
  assert.equal(
    classifyImageStatus({ image: '/images/gone.jpg', image_alt: 'a' }, { repoRoot: '/repo', fileExists }),
    IMAGE_STATUS.MISSING_FILE,
  )
})

test('isImageMissing は未設定/alt不足/欠落で true', () => {
  assert.equal(isImageMissing(IMAGE_STATUS.MISSING_IMAGE), true)
  assert.equal(isImageMissing(IMAGE_STATUS.MISSING_ALT), true)
  assert.equal(isImageMissing(IMAGE_STATUS.MISSING_FILE), true)
  assert.equal(isImageMissing(IMAGE_STATUS.OK), false)
  assert.equal(isImageMissing(IMAGE_STATUS.NOT_REQUIRED), false)
})

// ── summarizeWorkflowCounts ──────────────────────────────────────────────────

// ── normalizeGitStatus（MitaniOS buildGitSync とパリティ）────────────────────

const baseGit = { localHead: 'aaaaaaa', refAvailable: true, dirtyCount: 0, untrackedCount: 0 }

test('normalizeGitStatus: ahead>0 は needs_push', () => {
  assert.equal(normalizeGitStatus({ ...baseGit, ahead: 2, behind: 0 }), GIT_STATUS.NEEDS_PUSH)
})

test('normalizeGitStatus: behind>0 は behind_origin / ahead&behind は diverged', () => {
  assert.equal(normalizeGitStatus({ ...baseGit, ahead: 0, behind: 3 }), GIT_STATUS.BEHIND_ORIGIN)
  assert.equal(normalizeGitStatus({ ...baseGit, ahead: 1, behind: 1 }), GIT_STATUS.DIVERGED)
})

test('normalizeGitStatus: clean / dirty+ahead0 / untracked', () => {
  assert.equal(normalizeGitStatus({ ...baseGit, ahead: 0, behind: 0 }), GIT_STATUS.CLEAN)
  assert.equal(normalizeGitStatus({ ...baseGit, ahead: 0, behind: 0, dirtyCount: 1 }), GIT_STATUS.MODIFIED)
  assert.equal(normalizeGitStatus({ ...baseGit, ahead: 0, behind: 0, untrackedCount: 1 }), GIT_STATUS.UNTRACKED)
})

test('normalizeGitStatus: origin ref 無し / localHead 無しは dirty/untracked or unknown', () => {
  assert.equal(
    normalizeGitStatus({ localHead: 'aaaaaaa', refAvailable: false, ahead: null, behind: null, dirtyCount: 0, untrackedCount: 1 }),
    GIT_STATUS.UNTRACKED,
  )
  assert.equal(
    normalizeGitStatus({ localHead: 'aaaaaaa', refAvailable: false, ahead: null, behind: null, dirtyCount: 0, untrackedCount: 0 }),
    GIT_STATUS.UNKNOWN,
  )
  assert.equal(
    normalizeGitStatus({ localHead: null, refAvailable: true, ahead: 0, behind: 0, dirtyCount: 0, untrackedCount: 0 }),
    GIT_STATUS.UNKNOWN,
  )
})

test('summarizeWorkflowCounts: 状態別件数と画像未設定件数', () => {
  const posts = [
    { data: { draft: true, date: PAST } }, // draft
    { data: { date: PAST } }, // review_waiting, 画像未設定
    { data: { date: PAST, image: '/i.jpg', image_alt: 'a' } }, // review_waiting, 画像ok
    { data: { reviewed: true, date: PAST, image: '/i.jpg', image_alt: 'a' } }, // published
    { data: { reviewed: true, date: FUTURE, image: '/i.jpg', image_alt: 'a' } }, // publish_waiting
    { data: { archived: true } }, // blocked
  ]
  const counts = summarizeWorkflowCounts(posts, { today: TODAY })
  assert.equal(counts.draft_count, 1)
  assert.equal(counts.review_waiting_count, 2)
  assert.equal(counts.publish_waiting_count, 1)
  assert.equal(counts.published_count, 1)
  assert.equal(counts.blocked_count, 1)
  assert.equal(counts.image_missing_count, 3) // draft(画像なし) + review_waiting(画像なし) + archived(画像なし)
})
