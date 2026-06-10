import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSnsDrafts, PLATFORM_TO_CHANNEL, REPURPOSE_PLATFORMS } from '../scripts/generate-sns-from-post.mjs'
import { validateSnsDraftData } from '../scripts/lib/sns-drafts.mjs'
import { TARGET_CHANNELS } from '../scripts/lib/media-queue.mjs'

const postFile = '2026-06-01-sample-post.md'
const postData = {
  title: '歯ぐきから血が出るのは歯周病？',
  excerpt: 'セルフチェックと受診の目安を整理します。',
  tags: ['歯周病', 'セルフチェック'],
  medical_risk: 'low',
  source_topic_id: 'TOPIC-001',
}

test('ブログ記事から全platformの下書きが生成され、既存SNS規約を通過する', () => {
  const drafts = buildSnsDrafts({ postFile, postData, date: '2026-06-11' })
  assert.equal(drafts.length, REPURPOSE_PLATFORMS.length)
  for (const draft of drafts) {
    const result = validateSnsDraftData(draft.filename, draft.data, draft.content)
    assert.deepEqual(result.errors, [], `${draft.filename}: ${result.errors.join(' / ')}`)
    assert.equal(draft.data.publish_mode, 'manual_only')
    assert.equal(draft.data.status, 'pending_review')
    assert.equal(draft.data.reviewed, false)
  }
})

test('platform → channel の対応表は固定enum内に収まる', () => {
  for (const platform of REPURPOSE_PLATFORMS) {
    assert.ok(TARGET_CHANNELS.includes(PLATFORM_TO_CHANNEL[platform]))
  }
})

test('固定enum外のplatformは拒否される', () => {
  assert.throws(() => buildSnsDrafts({ postFile, postData, platforms: ['facebook'] }))
})
