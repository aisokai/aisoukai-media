import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STAR_RATING_MAP, buildLocalPostPayload, mapApiReview, requireCredentials,
} from '../scripts/lib/gmb-api.mjs'

test('starRating enum は数値に変換される', () => {
  assert.equal(STAR_RATING_MAP.FIVE, 5)
  assert.equal(STAR_RATING_MAP.ONE, 1)
})

test('v4 review レスポンスは watcher 共通形式に変換される', () => {
  const mapped = mapApiReview({
    reviewId: 'r-123',
    starRating: 'FIVE',
    comment: 'とても良かったです',
    reviewer: { displayName: 'テスト太郎' },
    reviewReply: { comment: '返信済み' },
  })
  assert.deepEqual(mapped, {
    review_id: 'r-123', rating: 5, text: 'とても良かったです',
    reviewer_display: 'テスト太郎', has_reply: true,
  })
})

test('本文なし・返信なしレビューも正しく変換される', () => {
  const mapped = mapApiReview({ reviewId: 'r-9', starRating: 'FOUR' })
  assert.equal(mapped.text, '')
  assert.equal(mapped.has_reply, false)
  assert.equal(mapped.reviewer_display, '匿名')
})

test('localPost payload は日本語STANDARD投稿として組み立てられる', () => {
  const payload = buildLocalPostPayload({ draftText: '本日午後休診です', ctaUrl: 'https://example.com/x' })
  assert.equal(payload.languageCode, 'ja')
  assert.equal(payload.topicType, 'STANDARD')
  assert.equal(payload.callToAction.actionType, 'LEARN_MORE')
  const noCta = buildLocalPostPayload({ draftText: 'x' })
  assert.ok(!('callToAction' in noCta))
})

test('認証情報が未設定なら明示エラーで停止する (秘密値は表示しない)', () => {
  const saved = {}
  for (const key of ['GMB_CLIENT_ID', 'GMB_CLIENT_SECRET', 'GMB_REFRESH_TOKEN']) {
    saved[key] = process.env[key]
    process.env[key] = ''
  }
  try {
    assert.throws(() => requireCredentials(), /GMB_CLIENT_ID|GMB認証情報/)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
