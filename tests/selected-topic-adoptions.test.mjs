import test from 'node:test'
import assert from 'node:assert/strict'
import { planSelectedTopicAdoptions, TOPIC_CSV_COLUMNS } from '../src/lib/selectedTopicAdoptions.mjs'
import { issueTopicAdoption, verifyBlogEvidence, topicContentVersion } from '../src/lib/tieredPublication.mjs'
import { parseCsv } from '../scripts/csv-parser.mjs'
const secret = 'synthetic-adoption-test-only'
const candidate = { id: '2026-09-topic-001', title: 'Synthetic theme', category: 'その他', targetKeyword: 'synthetic', searchIntent: 'Synthetic intent', priority: 'low', medicalRisk: 'low', sourceType: 'seo', recommendedPublishDate: '2026-09-30', status: 'selected' }
const file = () => ({ month: '2026-09', targetPostCount: 1, topics: [{ ...candidate }] })
const header = `${TOPIC_CSV_COLUMNS.join(',')}\n`
const plan = (f, csv, previous = null) => planSelectedTopicAdoptions(f, csv, { secret, loadAdoption: async () => previous, today: '2026-09-28' })
async function existing() { const initial = await plan(file(), header); return { csv: `${header}${initial.lines[0]}\n`, adoption: JSON.parse(initial.adoptions[0].content) } }

test('explicit selected-theme confirmation repairs missing adoption without duplicate CSV rows', async () => {
  const { csv } = await existing(); const next = await plan(file(), csv)
  assert.equal(next.lines.length, 0); assert.equal(next.adoptions.length, 1)
  const payload = verifyBlogEvidence(JSON.parse(next.adoptions[0].content), 'teacher-topic-adoption', secret)
  assert.equal(payload.topicVersion, topicContentVersion(parseCsv(csv)[0]))
})
test('valid matching adoption is unchanged; signed older version can be explicitly re-adopted', async () => {
  const { csv, adoption } = await existing(); const next = await plan(file(), csv, adoption)
  assert.equal(next.lines.length, 0); assert.equal(next.adoptions.length, 0); assert.equal(next.preservedCount, 1)
  const stale = issueTopicAdoption({ ...parseCsv(csv)[0], title_candidate: 'Older synthetic title' }, secret)
  assert.equal((await plan(file(), csv, stale)).adoptions.length, 1)
})
test('CSV approval alone, semantic disagreement and rejected rows never issue adoption', async () => {
  const { csv } = await existing()
  await assert.rejects(plan({ ...file(), topics: [{ ...candidate, status: 'pending' }] }, csv))
  await assert.rejects(plan(file(), csv.replace('Synthetic theme', 'Different theme')), /一致/)
  await assert.rejects(plan(file(), csv.replace('"approved"', '"rejected"')), /一致/)
})
test('invalid signatures, another topic ID, duplicate IDs and protected markers fail closed', async () => {
  const { csv, adoption } = await existing()
  await assert.rejects(plan(file(), csv, { ...adoption, signature: '0'.repeat(64) }), /検証/)
  await assert.rejects(plan(file(), csv, issueTopicAdoption({ ...parseCsv(csv)[0], id: 'OTHER' }, secret)), /検証/)
  await assert.rejects(plan(file(), csv + csv.split('\n')[1] + '\n'), /重複/)
  await assert.rejects(plan({ ...file(), topics: [candidate, candidate] }, csv), /重複/)
  await assert.rejects(plan({ ...file(), topics: [{ ...candidate, sensitive_data: true }] }, csv), /保護/)
})
test('read errors cannot be treated as missing adoption', async () => {
  await assert.rejects(planSelectedTopicAdoptions(file(), header, { secret, loadAdoption: async () => { throw Error('unavailable') } }), /unavailable/)
})
