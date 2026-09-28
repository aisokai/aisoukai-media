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
const adoptionSecret = 'synthetic-action-adoption-key'
const syntheticFile = { month: '2026-09', targetPostCount: 1, topics: [{ id: '2026-09-topic-001', title: 'Synthetic topic', category: 'その他', targetKeyword: 'synthetic', searchIntent: 'Synthetic intent', priority: 'low', medicalRisk: 'low', sourceType: 'seo', recommendedPublishDate: '2026-09-30', status: 'selected' }] }
async function actionHarness({ unauthorized = false, changedHead = false, readError = false } = {}) {
  const initial = await adoptionPlanner.planSelectedTopicAdoptions(syntheticFile, adoptionPlanner.TOPIC_CSV_COLUMNS.join(',') + '\n', { loadAdoption: async () => null, secret: adoptionSecret })
  const store = new Map([['data/monthly-topic-candidates/2026-09.json', JSON.stringify(syntheticFile)], ['data/article-topics.sample.csv', adoptionPlanner.TOPIC_CSV_COLUMNS.join(',') + '\n' + initial.lines[0] + '\n']])
  const calls = [], head = 'a'.repeat(40)
  const modules = {
    fs: {}, path: {}, 'next/cache': { revalidatePath() {} },
    '@/lib/adminAuth': { requireAdmin: async () => { calls.push('auth'); if (unauthorized) throw Error('Unauthorized') } },
    '@/lib/monthlyTopicCandidates': { getTopicCandidatePath: month => `data/monthly-topic-candidates/${month}.json` },
    '@/lib/selectedTopicAdoptions.mjs': { ...adoptionPlanner, planSelectedTopicAdoptions: (file, csv, options) => adoptionPlanner.planSelectedTopicAdoptions(file, csv, { ...options, secret: adoptionSecret }) },
    '@/lib/githubContents': {
      readGitHubBranchHead: async () => { calls.push('head'); return head },
      readGitHubFile: async (path, options) => { assert.equal(options.ref, head); calls.push('read'); if (path.includes('topic-adoptions') && readError) throw Object.assign(Error('failed'), { code: 'GITHUB_FAILED' }); if (!store.has(path)) throw Object.assign(Error('missing'), { code: 'NOT_FOUND' }); return { content: store.get(path) } },
      commitGitHubFiles: async (_message, files, options) => { calls.push('commit'); assert.equal(options.expectedHeadSha, head); if (changedHead) throw Error('GitHub branch changed'); for (const item of files) store.set(item.path, item.content); return { sha: 'b'.repeat(40) } },
    },
  }
  const exports = {}
  new Function('require', 'exports', 'process', ts.transpileModule(readFileSync('src/app/admin/topic-candidates/actions.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => { if (!(name in modules)) throw Error(`unexpected import ${name}`); return modules[name] }, exports, { env: { GITHUB_REVIEW_TOKEN: 'synthetic' }, cwd: () => '/synthetic' })
  return { run: () => exports.finalizeSelectedTopicCandidatesAction('2026-09'), calls, store }
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
