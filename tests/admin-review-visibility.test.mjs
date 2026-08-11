import { readdirSync, readFileSync } from 'node:fs'
import matter from 'gray-matter'
import test from 'node:test'
import assert from 'node:assert/strict'

test('the migrated approved snapshot has no spurious re-review item', () => {
  const invalidated = readdirSync('content/posts')
    .filter((file) => file.endsWith('.md'))
    .map((file) => ({ file, data: matter(readFileSync(`content/posts/${file}`, 'utf8')).data }))
    .filter(({ data }) => data.reviewed === false && data.review_invalidation_reason)

  assert.deepEqual(invalidated, [])
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

test('admin and public sources route a non-exact approved version into pending review rather than publication', () => {
  const posts = readFileSync('src/lib/posts.ts', 'utf8')
  const pendingPage = readFileSync('src/app/admin/pending-review/page.tsx', 'utf8')
  const actions = readFileSync('src/app/admin/pending-review/actions.ts', 'utf8')

  assert.match(posts, /getDmpArticleState/)
  assert.match(posts, /\.publishable/)
  assert.match(posts, /state\.approvedExactVersion/)
  assert.match(pendingPage, /再レビューが必要です/)
  assert.match(actions, /assertExpectedContentVersion/)
})
