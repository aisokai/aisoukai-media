import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('admin dashboard links all management tools', () => {
  const dashboard = readFileSync('src/app/admin/page.tsx', 'utf8')
  const loginAction = readFileSync('src/app/admin/login/actions.ts', 'utf8')

  assert.match(dashboard, /href="\/admin\/pending-review"/)
  assert.match(dashboard, /href=\{`\/admin\/topic-candidates\?month=/)
  assert.match(dashboard, /href="\/admin\/article-topics"/)
  assert.match(dashboard, /href="\/admin\/posts"/)
  assert.doesNotMatch(dashboard, /準備中/)
  assert.match(loginAction, /redirect\('\/admin'\)/)
})

test('public header exposes a password-gated admin entry point', () => {
  const header = readFileSync('src/components/Header.tsx', 'utf8')

  assert.match(header, /href="\/admin"/)
  assert.match(header, /管理/)
})

test('admin dashboard metric cards link to filtered management pages', () => {
  const dashboard = readFileSync('src/app/admin/page.tsx', 'utf8')

  assert.match(dashboard, /href="\/admin\/pending-review\?status=pending"/)
  assert.match(dashboard, /href="\/admin\/pending-review\?status=rejected"/)
  assert.match(dashboard, /href=\{`\/admin\/topic-candidates\?month=.*status=selected`/)
  assert.match(dashboard, /href="\/admin\/article-topics\?status=approved"/)
})

test('post management exposes edit, archive, restore, and delete actions', () => {
  const page = readFileSync('src/app/admin/posts/page.tsx', 'utf8')
  const actions = readFileSync('src/app/admin/posts/actions.ts', 'utf8')
  const editor = readFileSync('src/app/admin/posts/[slug]/edit/page.tsx', 'utf8')

  assert.match(page, /記事管理/)
  assert.match(page, /PostManagementActions/)
  assert.match(page, /searchParams/)
  assert.match(page, /statusFilter/)
  assert.match(page, /sortPostsForAdmin/)
  assert.match(editor, /PostMarkdownEditor/)
  assert.match(actions, /savePostMarkdownAction/)
  assert.match(actions, /archivePostAction/)
  assert.match(actions, /restorePostAction/)
  assert.match(actions, /deletePostAction/)
  assert.match(actions, /admin-post-history\.md/)
})

test('article topic management exposes editable csv fields', () => {
  const page = readFileSync('src/app/admin/article-topics/page.tsx', 'utf8')
  const controls = readFileSync('src/app/admin/article-topics/ArticleTopicEditControls.tsx', 'utf8')
  const actions = readFileSync('src/app/admin/article-topics/actions.ts', 'utf8')

  assert.match(page, /ArticleTopicEditControls/)
  assert.match(page, /statusFilter/)
  assert.match(page, /riskFilter/)
  assert.match(page, /monthlyOnly/)
  assert.match(controls, /title_candidate/)
  assert.match(controls, /target_keyword/)
  assert.match(controls, /patient_intent/)
  assert.match(actions, /updateArticleTopicAction/)
  assert.match(actions, /title_candidate/)
  assert.match(actions, /medical_risk/)
})

test('topic candidates and pending review expose status filters and rejected body previews', () => {
  const topicCandidates = readFileSync('src/app/admin/topic-candidates/page.tsx', 'utf8')
  const pendingReview = readFileSync('src/app/admin/pending-review/page.tsx', 'utf8')
  const rejectedDeleteButton = readFileSync('src/app/admin/pending-review/RejectedPostDeleteButton.tsx', 'utf8')

  assert.match(topicCandidates, /statusFilter/)
  assert.match(topicCandidates, /riskFilter/)
  assert.match(topicCandidates, /sortTopicCandidatesForAdmin/)
  assert.match(pendingReview, /href="\/admin"/)
  assert.match(pendingReview, /管理トップ/)
  assert.match(pendingReview, /statusFilter/)
  assert.match(pendingReview, /renderReviewPostCard/)
  assert.match(pendingReview, /差し戻し理由/)
  assert.match(pendingReview, /PostBodyPreview/)
  assert.match(pendingReview, /RejectedPostDeleteButton/)
  assert.match(rejectedDeleteButton, /deletePostAction/)
  assert.match(rejectedDeleteButton, /差し戻し記事を削除/)
})
