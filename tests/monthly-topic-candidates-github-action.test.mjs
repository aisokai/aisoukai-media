import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('monthly topic candidates GitHub Action runs on the first day and notifies Telegram', () => {
  const workflow = readFileSync('.github/workflows/monthly-topic-candidates.yml', 'utf8')

  assert.match(workflow, /cron:\s*'0 0 1 \* \*'/)
  assert.match(workflow, /topic-candidates:generate/)
  assert.match(workflow, /topic-candidates:validate/)
  assert.match(workflow, /notify:topic-candidates/)
  assert.match(workflow, /TELEGRAM_BOT_TOKEN/)
  assert.match(workflow, /TELEGRAM_CHAT_ID/)
  assert.match(workflow, /git commit -m "chore: generate monthly topic candidates"/)
})

// Exercise the actual Server Action with isolated in-memory GitHub and auth.
import ts from 'typescript'
import * as adoptionPlanner from '../src/lib/selectedTopicAdoptions.mjs'
import { parseCsv } from '../scripts/csv-parser.mjs'
import { verifyBlogEvidence, topicContentVersion } from '../src/lib/tieredPublication.mjs'
const monthlyExports = {}
new Function('require', 'exports', 'process', ts.transpileModule(readFileSync('src/lib/monthlyTopicCandidates.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => { if (name === 'path') return { default: { join: (...parts) => parts.join('/') } }; if (name === 'fs' || name === './githubContents') return {}; throw Error(name) }, monthlyExports, { cwd: () => '/synthetic' })
const adoptionSecret = 'synthetic-action-adoption-key'
const syntheticFile = { month: '2026-09', targetPostCount: 1, topics: [{ id: '2026-09-topic-001', title: 'Synthetic topic', category: 'その他', targetKeyword: 'synthetic', searchIntent: 'Synthetic intent', priority: 'low', medicalRisk: 'low', sourceType: 'seo', recommendedPublishDate: '2026-09-30', status: 'selected' }] }
async function actionHarness({ unauthorized = false, changedHead = false, readError = false, configured = true } = {}) {
  const initial = await adoptionPlanner.planSelectedTopicAdoptions(syntheticFile, adoptionPlanner.TOPIC_CSV_COLUMNS.join(',') + '\n', { loadAdoption: async () => null, secret: adoptionSecret })
  const store = new Map([['data/monthly-topic-candidates/2026-09.json', JSON.stringify(syntheticFile)], ['data/article-topics.sample.csv', adoptionPlanner.TOPIC_CSV_COLUMNS.join(',') + '\n' + initial.lines[0] + '\n']])
  const calls = [], commits = [], head = 'a'.repeat(40)
  const modules = {
    fs: {}, path: {}, 'next/cache': { revalidatePath() {} },
    '@/lib/adminAuth': { requireAdmin: async () => { calls.push('auth'); if (unauthorized) throw Error('Unauthorized') } },
    '@/lib/monthlyTopicCandidates': { updateMonthlyTopicCandidateStatus: monthlyExports.updateMonthlyTopicCandidateStatus, getTopicCandidatePath: month => `data/monthly-topic-candidates/${month}.json` },
    '@/lib/selectedTopicAdoptions.mjs': { ...adoptionPlanner, planTopicCandidateStatusChange: (file, id, csv, options) => adoptionPlanner.planTopicCandidateStatusChange(file, id, csv, { ...options, secret: adoptionSecret }), planSelectedTopicAdoptions: (file, csv, options) => adoptionPlanner.planSelectedTopicAdoptions(file, csv, { ...options, secret: adoptionSecret }) },
    '@/lib/githubContents': {
      readGitHubBranchHead: async () => { calls.push('head'); return head },
      readGitHubFile: async (path, options) => { assert.equal(options.ref, head); calls.push('read'); if (path.includes('topic-adoptions') && readError) throw Object.assign(Error('failed'), { code: 'GITHUB_FAILED' }); if (!store.has(path)) throw Object.assign(Error('missing'), { code: 'NOT_FOUND' }); return { content: store.get(path) } },
      commitGitHubFiles: async (_message, files, options) => { calls.push('commit'); assert.equal(options.expectedHeadSha, head); if (changedHead) throw Error('GitHub branch changed'); commits.push(structuredClone(files)); for (const item of files) store.set(item.path, item.content); return { sha: 'b'.repeat(40) } },
    },
  }
  const exports = {}
  new Function('require', 'exports', 'process', ts.transpileModule(readFileSync('src/app/admin/topic-candidates/actions.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => { if (!(name in modules)) throw Error(`unexpected import ${name}`); return modules[name] }, exports, { env: configured ? { GITHUB_REVIEW_TOKEN: 'synthetic' } : {}, cwd: () => '/synthetic' })
  return { run: () => exports.finalizeSelectedTopicCandidatesAction('2026-09'), update: (status, id = '2026-09-topic-001') => exports.updateTopicCandidateStatusAction({ month: '2026-09', id, status }), calls, store, commits }
}
test('authenticated finalize repairs existing CSV adoption with pinned reads/CAS and is idempotent', async () => {
  const h = await actionHarness(); const original = h.store.get('data/article-topics.sample.csv')
  assert.equal((await h.run()).ok, true); assert.equal(h.calls[0], 'auth'); assert.equal(h.store.size, 3)
  assert.equal(h.store.get('data/article-topics.sample.csv'), original)
  assert.equal((await h.run()).ok, true); assert.equal(h.calls.filter(c => c === 'commit').length, 1)
})
test('unauthorized finalize does no reads, branch movement and unavailable adoption do not report success', async () => {
  const denied = await actionHarness({ unauthorized: true }); assert.equal((await denied.run()).ok, false); assert.deepEqual(denied.calls, ['auth'])
  const raced = await actionHarness({ changedHead: true }); assert.equal((await raced.run()).ok, false); assert.equal(raced.store.size, 2)
  const unavailable = await actionHarness({ readError: true }); assert.equal((await unavailable.run()).ok, false); assert.equal(unavailable.calls.includes('commit'), false)
})

test('one Human click atomically saves candidate, CSV and signed receipt only for the clicked theme', async () => {
  const h = await actionHarness()
  const file = structuredClone(syntheticFile); file.targetPostCount = 1; file.topics[0].status = 'pending'
  file.topics.push({ ...file.topics[0], id: '2026-09-topic-002', title: 'Other historical selection', status: 'selected' })
  h.store.set('data/monthly-topic-candidates/2026-09.json', JSON.stringify(file))
  h.store.set('data/article-topics.sample.csv', adoptionPlanner.TOPIC_CSV_COLUMNS.join(',') + '\n')
  assert.equal((await h.update('selected')).ok, true)
  assert.equal(h.calls[0], 'auth'); assert.equal(h.commits.length, 1)
  assert.deepEqual(h.commits[0].map(f => f.path).sort(), ['data/article-topics.sample.csv', 'data/monthly-topic-candidates/2026-09.json', 'data/topic-adoptions/MONTHLY-202609TOPIC001.json'])
  const rows = parseCsv(h.store.get('data/article-topics.sample.csv')); assert.equal(rows.length, 1)
  const adopted = verifyBlogEvidence(JSON.parse(h.store.get('data/topic-adoptions/MONTHLY-202609TOPIC001.json')), 'teacher-topic-adoption', adoptionSecret)
  assert.equal(adopted.topicId, rows[0].id); assert.equal(adopted.topicVersion, topicContentVersion(rows[0]))
  assert.equal(h.store.has('data/topic-adoptions/MONTHLY-202609TOPIC002.json'), false)
  assert.equal(JSON.parse(h.store.get('data/monthly-topic-candidates/2026-09.json')).topics.filter(t => t.status === 'selected').length, 2)
})
test('clicking an unchanged selected theme repairs only its missing receipt and then stays idempotent', async () => {
  const h = await actionHarness(); const csv = h.store.get('data/article-topics.sample.csv')
  assert.equal((await h.update('selected')).ok, true)
  assert.deepEqual(h.commits[0].map(f => f.path), ['data/topic-adoptions/MONTHLY-202609TOPIC001.json'])
  assert.equal(h.store.get('data/article-topics.sample.csv'), csv)
  const signed = h.store.get('data/topic-adoptions/MONTHLY-202609TOPIC001.json')
  assert.equal((await h.update('selected')).ok, true); assert.equal(h.commits.length, 1)
  assert.equal(h.store.get('data/topic-adoptions/MONTHLY-202609TOPIC001.json'), signed)
})
test('every nonselected status atomically disables new generation while preserving adoption history', async () => {
  for (const status of ['pending', 'backup', 'hold', 'rejected']) {
    const h = await actionHarness(); await h.update('selected')
    const signed = h.store.get('data/topic-adoptions/MONTHLY-202609TOPIC001.json')
    assert.equal((await h.update(status)).ok, true)
    assert.equal(parseCsv(h.store.get('data/article-topics.sample.csv'))[0].status, 'hold')
    assert.equal(JSON.parse(h.store.get('data/monthly-topic-candidates/2026-09.json')).topics[0].status, status)
    assert.deepEqual(h.commits[1].map(f => f.path).sort(), ['data/article-topics.sample.csv', 'data/monthly-topic-candidates/2026-09.json'])
    assert.equal(h.store.get('data/topic-adoptions/MONTHLY-202609TOPIC001.json'), signed)
    assert.equal((await h.update('selected')).ok, true)
    assert.equal(parseCsv(h.store.get('data/article-topics.sample.csv'))[0].status, 'approved')
    assert.equal(h.store.get('data/topic-adoptions/MONTHLY-202609TOPIC001.json'), signed)
  }
})
test('failed auth, configuration, receipt read and CAS leave all selection state untouched', async () => {
  for (const options of [{ unauthorized: true }, { configured: false }, { readError: true }, { changedHead: true }]) {
    const h = await actionHarness(options), before = [...h.store.entries()]
    assert.equal((await h.update('selected')).ok, false)
    assert.deepEqual([...h.store.entries()], before); assert.equal(h.commits.length, 0)
    if (options.unauthorized || options.configured === false) assert.deepEqual(h.calls, ['auth'])
  }
})

test('two Human clicks cannot revive terminal CSV state through a nonselected candidate status', async () => {
  for (const terminal of ['used', 'archived', 'drafting', 'reviewed', 'published']) {
    const h = await actionHarness(); await h.update('selected')
    const receipt = h.store.get('data/topic-adoptions/MONTHLY-202609TOPIC001.json')
    const terminalCsv = h.store.get('data/article-topics.sample.csv').replace('"approved"', `"${terminal}"`)
    h.store.set('data/article-topics.sample.csv', terminalCsv)
    assert.equal((await h.update('pending')).ok, true)
    assert.deepEqual(h.commits[1].map(f => f.path), ['data/monthly-topic-candidates/2026-09.json'])
    assert.equal(h.store.get('data/article-topics.sample.csv'), terminalCsv)
    assert.equal((await h.update('selected')).ok, false)
    assert.equal(h.commits.length, 2)
    assert.equal(h.store.get('data/topic-adoptions/MONTHLY-202609TOPIC001.json'), receipt)
    assert.equal(JSON.parse(h.store.get('data/monthly-topic-candidates/2026-09.json')).topics[0].status, 'pending')
  }
})
