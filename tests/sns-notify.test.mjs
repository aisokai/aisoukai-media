import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { buildSnsPendingDigest } from '../scripts/notify-sns-pending-review.mjs'

const drafts = [
  { filename: '2026-07-03-instagram-topic-001.md', data: { platform: 'instagram', title: '定期検診の目安', medical_risk: 'low' } },
  { filename: '2026-07-03-x-topic-002.md', data: { platform: 'x', title: 'しみる原因', medical_risk: 'medium' } },
]

test('digest に件数・platform・タイトルが含まれる', () => {
  const text = buildSnsPendingDigest(drafts)
  assert.ok(text.includes('2 件'))
  assert.ok(text.includes('instagram'))
  assert.ok(text.includes('定期検診の目安'))
  assert.ok(text.includes('medium'))
})

test('0 件のときは null を返す (通知しない)', () => {
  assert.equal(buildSnsPendingDigest([]), null)
})

test('件数が多いときは要約する (先頭10件 + 残り件数)', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({
    filename: `2026-07-03-instagram-t${i}.md`,
    data: { platform: 'instagram', title: `タイトル${i}`, medical_risk: 'low' },
  }))
  const text = buildSnsPendingDigest(many)
  assert.ok(text.includes('15 件'))
  assert.ok(text.includes('ほか 5 件'))
  assert.ok(!text.includes('タイトル14'))
})
