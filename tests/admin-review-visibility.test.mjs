import { readdirSync, readFileSync } from 'node:fs'
import matter from 'gray-matter'
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTeacherApproval, getDmpArticleState } from '../src/lib/dmpArticleState.mjs'

test('current corrective change is exactly Human-approved and preserves append-only history', () => {
  const post = matter(readFileSync('content/posts/2026-07-22-topic-090fbe37c5607d3d.md', 'utf8'))
  const reviewLog = readFileSync('logs/review-history.md', 'utf8')
  const adminLog = readFileSync('logs/admin-post-history.md', 'utf8')
  const invalidated = readdirSync('content/posts')
    .filter((file) => file.endsWith('.md'))
    .map((file) => ({ file, data: matter(readFileSync(`content/posts/${file}`, 'utf8')).data }))
    .filter(({ data }) => data.reviewed === false && data.review_invalidation_reason)

  assert.equal(post.data.reviewed, true)
  assert.match(post.data.reviewed_content_hash, /^[a-f0-9]{64}$/)
  assert.deepEqual(invalidated, [])
  assert.match(reviewLog, /action: approve\nslug: 2026-07-22-topic-090fbe37c5607d3d/)
  assert.match(reviewLog, /action: rereview_required\nslug: 2026-07-22-topic-090fbe37c5607d3d/)
  assert.match(adminLog, /action: edit-rereview-required\nslug: 2026-07-22-topic-090fbe37c5607d3d/)
})

test('admin dashboard differentiates selected progress from candidate and pending totals for both monthly files', () => {
  const dashboard = readFileSync('src/app/admin/page.tsx', 'utf8')
  assert.match(dashboard, /候補 \$\{monthlySummary\.candidateCount\}件・pending \$\{monthlySummary\.pendingCount\}件/)

  for (const month of ['2026-08', '2026-09']) {
    const candidateFile = JSON.parse(readFileSync(`data/monthly-topic-candidates/${month}.json`, 'utf8'))
    assert.equal(candidateFile.candidateCount, 24)
    assert.equal(candidateFile.topics.length, 24)
    assert.equal(candidateFile.targetPostCount, 12)
    assert.equal(candidateFile.topics.filter((topic) => topic.status === 'pending').length, 24)
  }
})

test('unapproved articles remain visible to admin review but cannot publish, while exact Human approval can publish', () => {
  const posts = readFileSync('src/lib/posts.ts', 'utf8')
  const pendingPage = readFileSync('src/app/admin/pending-review/page.tsx', 'utf8')
  const content = '本文\n'
  const unapproved = { title: '管理レビュー待ち記事', date: '2026-08-01', draft: false, reviewed: false }
  const pending = getDmpArticleState({ data: unapproved, content, today: '2026-08-02' })
  const approved = applyTeacherApproval({ data: unapproved, content, reviewedBy: '先生', reviewedAt: '2026-08-01' })
  const publishable = getDmpArticleState({ data: approved, content, today: '2026-08-02' })

  assert.equal(pending.state, 'pending-review')
  assert.equal(pending.approvedExactVersion, false)
  assert.equal(pending.publishable, false)
  assert.equal(publishable.approvedExactVersion, true)
  assert.equal(publishable.publishable, true)
  assert.match(posts, /if \(state\.approvedExactVersion\) return null/)
  assert.match(posts, /\)\.publishable/)
  assert.match(pendingPage, /再レビューが必要です/)
})
