import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('admin pending review reads GitHub branch data when review token is configured', () => {
  const postsSource = readFileSync('src/lib/posts.ts', 'utf8')
  const pageSource = readFileSync('src/app/admin/pending-review/page.tsx', 'utf8')

  assert.match(postsSource, /readGitHubDirectory/)
  assert.match(postsSource, /getPendingReviewPostsForAdmin/)
  assert.match(postsSource, /process\.env\.GITHUB_REVIEW_TOKEN/)
  assert.match(pageSource, /getPendingReviewPostsForAdmin/)
  assert.match(pageSource, /dynamic\s*=\s*['"]force-dynamic['"]/)
})
