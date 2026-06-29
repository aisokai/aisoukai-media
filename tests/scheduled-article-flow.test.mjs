import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('scheduled article flow only picks due approved topics unless allow-future is explicit', () => {
  const source = readFileSync('scripts/scheduled-article-flow.mjs', 'utf8')

  assert.match(source, /getTodayJst/)
  assert.match(source, /findMissingApprovedTopics/)
  assert.match(source, /allowFuture/)
  assert.match(source, /publishDate > today/)
  assert.match(source, /公開日が今日以前の未生成 approved topic はありません/)
  assert.match(source, /source_topic_id/)
  assert.match(source, /--no-notify/)
  assert.match(source, /result_json/)
  assert.match(source, /loadBlockedScheduledTopics/)
  assert.match(source, /review-history\.md/)
  assert.match(source, /admin-post-history\.md/)
  assert.match(source, /delete-rejected/)
  assert.match(source, /archive_duplicate/)
  assert.match(source, /topicIdFromSlug/)
  assert.match(source, /blocked\.topicIds\.has/)
  assert.match(source, /blocked\.slugs\.has/)
  assert.match(source, /select_only/)
  assert.match(source, /品質NG/)
})

test('draft generation has save-before quality gates for broken prompt fragments', () => {
  const source = readFileSync('scripts/generate-draft.mjs', 'utf8')

  assert.match(source, /detectGeneratedDraftQualityIssues/)
  assert.match(source, /\\bbrief\\b/i)
  assert.match(source, /記事は保存しません/)
  assert.match(source, /process\.exit\(2\)/)
  assert.match(source, /writeFileSync\(filePath, content/)
})

test('ops review notification reports no due approved topic as no generated article', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /今日は生成対象の承認済みネタがありません/)
  assert.match(source, /生成記事: なし/)
  assert.match(source, /scheduledResult\?\.generated/)
})

test('post validation rejects generated body corruption markers', () => {
  const source = readFileSync('scripts/validate-posts.mjs', 'utf8')

  assert.match(source, /detectGeneratedDraftQualityIssues/)
  assert.match(source, /\\bbrief\\b/i)
  assert.match(source, /本文にプロンプト断片/)
})
