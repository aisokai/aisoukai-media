import test from 'node:test'
import assert from 'node:assert/strict'
import { GMB_POST_TYPES, buildGmbDraft } from '../scripts/generate-gmb-draft.mjs'
import { JOB_TYPES } from '../scripts/lib/media-queue.mjs'

test('GMB post type → job type の対応表は固定enum内に収まる', () => {
  for (const jobType of Object.values(GMB_POST_TYPES)) {
    assert.ok(JOB_TYPES.includes(jobType))
  }
})

test('下書きが生成され、文字数上限内に収まる', () => {
  const { draftText, warnings } = buildGmbDraft({ postType: 'update', inputText: '6月の診療カレンダーを掲載しました' })
  assert.ok(draftText.length > 0)
  assert.ok(draftText.length <= 1500)
  assert.deepEqual(warnings, [])
})

test('固定enum外のpost typeは拒否される', () => {
  assert.throws(() => buildGmbDraft({ postType: 'flash_sale', inputText: 'x' }))
})

test('入力に秘密値らしき文字列が混ざってもdraft_textでredactされる', () => {
  const { draftText } = buildGmbDraft({ postType: 'update', inputText: 'お知らせ api_key=verysecret123456' })
  assert.ok(!draftText.includes('verysecret123456'))
  assert.ok(draftText.includes('[REDACTED]'))
})

test('医療広告ガイドライン警告は付くがブロックしない', () => {
  const { draftText, warnings } = buildGmbDraft({ postType: 'campaign', inputText: '必ず治るホワイトニングキャンペーン' })
  assert.ok(draftText.length > 0, '警告があっても生成自体は行う')
  assert.match(warnings.join('\n'), /医療広告ガイドライン警告/)
})
