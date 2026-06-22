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
})
