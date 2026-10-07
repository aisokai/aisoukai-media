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
  assert.match(pageSource, /スマホでもPCでも月次ネタ候補を確認/)
  assert.match(pageSource, /今月採用/)
  assert.match(pageSource, /未判断の残り/)
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
  assert.match(notifier, /スマホでもPCでも月次ネタ候補を確認/)
})

import ts from 'typescript'
test('monthly target is a planning goal: further Human selection preserves past decisions', () => {
  const output = {}
  new Function('require', 'exports', 'process', ts.transpileModule(readFileSync('src/lib/monthlyTopicCandidates.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => name === 'path' ? { default: { join: (...parts) => parts.join('/') } } : {}, output, { cwd: () => '/synthetic' })
  const file = { targetPostCount: 1, topics: [{ id: 'old', status: 'selected' }, { id: 'fresh', status: 'pending' }] }
  const updated = output.updateMonthlyTopicCandidateStatus(file, 'fresh', 'selected')
  assert.deepEqual(updated.topics.map(t => t.status), ['selected', 'selected'])
  assert.deepEqual(file.topics.map(t => t.status), ['selected', 'pending'])
  assert.equal(updated.targetPostCount, 1)
})

import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
function validateSyntheticCandidates(count, patch = {}) {
  const root = mkdtempSync(join(tmpdir(), 'monthly-candidate-validation-'))
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'data/monthly-topic-candidates'), { recursive: true })
  copyFileSync('scripts/validate-monthly-topic-candidates.mjs', join(root, 'scripts/validate-monthly-topic-candidates.mjs'))
  const topics = Array.from({ length: count }, (_, i) => ({ id: `2026-11-topic-${String(i + 1).padStart(3, '0')}`, title: `Synthetic ${i}`, targetReader: 'Synthetic', searchIntent: 'Synthetic', patientConcern: 'Synthetic', recommendedReason: 'Synthetic', targetKeyword: 'Synthetic', category: 'その他', medicalRisk: 'low', duplicateRisk: 'low', priority: 'low', status: i < 13 ? 'selected' : 'pending', recommendedPublishDate: '2026-11-02' }))
  writeFileSync(join(root, 'data/monthly-topic-candidates/2026-11.json'), JSON.stringify({ month: '2026-11', targetPostCount: 12, candidateCount: count, cadence: 'MWF', topics, ...patch }))
  return spawnSync(process.execPath, [join(root, 'scripts/validate-monthly-topic-candidates.mjs'), '--month', '2026-11'], { encoding: 'utf8' })
}
test('CLI accepts small fresh supply and replenished candidates beyond 24 with over-goal Human adoption', () => {
  for (const count of [6, 24, 30]) {
    const result = validateSyntheticCandidates(count)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Monthly topic candidates valid/)
  }
})
test('CLI rejects mismatched, empty, noninteger and oversized candidate counts', () => {
  for (const patch of [{ candidateCount: 5 }, { candidateCount: 0 }, { candidateCount: 6.5 }, { candidateCount: 1000 }]) {
    const result = validateSyntheticCandidates(6, patch)
    assert.equal(result.status, 1)
  }
})
