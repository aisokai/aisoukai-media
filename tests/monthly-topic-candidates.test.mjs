import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('monthly topic candidate workflow files are wired', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const topicSource = readFileSync('src/lib/monthlyTopicCandidates.ts', 'utf8')
  const pageSource = readFileSync('src/app/admin/topic-candidates/page.tsx', 'utf8')
  const actionsSource = readFileSync('src/app/admin/topic-candidates/actions.ts', 'utf8')

  assert.equal(pkg.scripts['topic-candidates:generate'], 'node scripts/generate-monthly-topic-candidates.mjs')
  assert.equal(pkg.scripts['topic-candidates:validate'], 'node scripts/validate-monthly-topic-candidates.mjs')
  assert.equal(pkg.scripts['topic-candidates:convert'], 'node scripts/convert-selected-topics.mjs')
  assert.equal(pkg.scripts['notify:topic-candidates'], 'node scripts/notify-topic-candidates.mjs')

  assert.match(topicSource, /getMonthlyTopicCandidatesForAdmin/)
  assert.match(topicSource, /updateMonthlyTopicCandidateStatus/)
  assert.match(topicSource, /buildTopicCandidateSummary/)
  assert.match(pageSource, /PCで月次ネタ候補を確認/)
  assert.match(pageSource, /今月採用/)
  assert.match(pageSource, /12\s*\/\s*12/)
  assert.match(actionsSource, /commitGitHubFiles/)
})

test('monthly topic candidate scripts expose expected behavior', () => {
  const generator = readFileSync('scripts/generate-monthly-topic-candidates.mjs', 'utf8')
  const validator = readFileSync('scripts/validate-monthly-topic-candidates.mjs', 'utf8')
  const converter = readFileSync('scripts/convert-selected-topics.mjs', 'utf8')
  const notifier = readFileSync('scripts/notify-topic-candidates.mjs', 'utf8')

  assert.match(generator, /candidateCount\s*=\s*24/)
  assert.match(validator, /selectedCount/)
  assert.match(converter, /status\s*===\s*'selected'/)
  assert.match(converter, /Monday|月曜|MWF/)
  assert.match(notifier, /パソコンで月次ネタ候補を確認/)
})
