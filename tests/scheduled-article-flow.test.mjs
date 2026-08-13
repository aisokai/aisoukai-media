import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('scheduled article flow picks one unused CSV topic without topic status or risk gates', () => {
  const source = readFileSync('scripts/scheduled-article-flow.mjs', 'utf8')

  assert.match(source, /getTodayJst/)
  assert.match(source, /findUnusedTopics/)
  assert.match(source, /allowFuture/)
  assert.match(source, /publishDate > today/)
  assert.match(source, /未使用ネタはありません/)
  assert.doesNotMatch(source, /\(r\.status \?\? ''\)\.trim\(\) === 'approved'/)
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

test('scheduled article flow can prepare the next unused topic for today without auto publishing', () => {
  const source = readFileSync('scripts/scheduled-article-flow.mjs', 'utf8')
  const generateSource = readFileSync('scripts/generate-draft.mjs', 'utf8')

  assert.match(source, /publish_today/)
  assert.match(source, /allowFuture = args\.allow_future === true \|\| publishToday/)
  assert.match(source, /--publish-date/)
  assert.match(source, /TODAY/)
  assert.doesNotMatch(source, /auto-review-post\.mjs/)

  assert.match(generateSource, /publish_date_override/)
  assert.match(generateSource, /--publish-date/)
})

test('draft generation has save-before quality gates for broken prompt fragments', () => {
  const source = readFileSync('scripts/generate-draft.mjs', 'utf8')

  assert.match(source, /detectGeneratedDraftQualityIssues/)
  assert.match(source, /\\bbrief\\b/i)
  assert.match(source, /記事は保存しません/)
  assert.match(source, /process\.exit\(2\)/)
  assert.match(source, /writeFileSync\(filePath, content/)
})

test('a persisted article keeps image diagnostics for Human review and continues to stock/notification', () => {
  const source = readFileSync('scripts/scheduled-article-flow.mjs', 'utf8')
  const catchIndex = source.indexOf('画像を設定できませんでした')
  const exitAfterCatch = source.indexOf('process.exit(1)', catchIndex)
  const publicationIndex = source.indexOf('const publication = evaluatePostFile', catchIndex)
  assert.ok(catchIndex > 0)
  assert.ok(publicationIndex > catchIndex)
  assert.ok(exitAfterCatch === -1 || exitAfterCatch > publicationIndex)
  assert.match(source, /result\.reasons\.push\(`画像を設定できませんでした/)
})

test('ops review notification reports CSV exhaustion as no generated article', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /未使用ネタがないため生成しません/)
})

test('post validation rejects generated body corruption markers', () => {
  const source = readFileSync('scripts/validate-posts.mjs', 'utf8')

  assert.match(source, /detectGeneratedDraftQualityIssues/)
  assert.match(source, /\\bbrief\\b/i)
  assert.match(source, /本文にプロンプト断片/)
})
