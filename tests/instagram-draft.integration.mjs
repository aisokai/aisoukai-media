import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  buildInstagramDraftData, buildInstagramPrompt, findTopicById,
} from '../scripts/generate-instagram-draft.mjs'
import { validateSnsDraftData } from '../scripts/lib/sns-drafts.mjs'

const topic = {
  id: '2026-08-topic-001',
  title: '定期検診は何か月ごとが目安？通院間隔の考え方',
  category: '予防歯科',
  targetKeyword: '歯科定期検診 頻度',
  patientConcern: '定期検診の適切な受診ペースを知りたい',
  medicalRisk: 'low',
}

test('frontmatter が既存 SNS schema を満たす', () => {
  const { filename, data } = buildInstagramDraftData({ topic, date: '2026-07-03' })
  const result = validateSnsDraftData(filename, data, '## キャプション\n\nテスト')
  assert.deepEqual(result.errors, [])
  assert.equal(data.platform, 'instagram')
  assert.equal(data.publish_mode, 'manual_only')
  assert.equal(data.reviewed, false)
  assert.equal(data.source_topic_id, '2026-08-topic-001')
})

test('prompt にカルーセル構成と禁止表現の指示が含まれる', () => {
  const prompt = buildInstagramPrompt({ topic })
  for (const kw of ['カルーセル', '表紙', '受診目安', '必ず', '断定']) {
    assert.ok(prompt.includes(kw), `prompt に「${kw}」が含まれていません`)
  }
  assert.ok(prompt.includes(topic.title))
})

test('medicalRisk: high の topic は拒否する', () => {
  assert.throws(
    () => buildInstagramDraftData({ topic: { ...topic, medicalRisk: 'high' }, date: '2026-07-03' }),
    /medicalRisk が high/,
  )
})

test('findTopicById: id の YYYY-MM 接頭辞から月ファイルを解決して topic を返す', () => {
  const found = findTopicById('2026-08-topic-001')
  assert.equal(found.id, '2026-08-topic-001')
  assert.ok(found.title.length > 0)
})
