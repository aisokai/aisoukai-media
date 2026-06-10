import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyReview, selectReplyTemplate, REPLY_TEMPLATES } from '../scripts/lib/review-rules.mjs'
import { buildReviewArtifacts } from '../scripts/gmb-review-watcher.mjs'
import { fetchReviews, postToGmb, replyToReview } from '../scripts/lib/gmb-adapter.mjs'
import { maskPersonalInfo } from '../scripts/lib/media-queue.mjs'

test('口コミ分類は固定優先順位のルールベースで決まる', () => {
  assert.equal(classifyReview({ rating: 5, text: '電話 03-1234-5678 で予約しました' }).matchedRule, 1)
  assert.equal(classifyReview({ rating: 5, text: '返金してほしい' }).matchedRule, 2)
  assert.equal(classifyReview({ rating: 5, text: 'インプラントをしました' }).matchedRule, 3)
  assert.equal(classifyReview({ rating: 2, text: '' }).matchedRule, 4)
  assert.equal(classifyReview({ rating: 5, text: '' }).classification, 'low_template_only')
  assert.equal(classifyReview({ rating: 5, text: 'とても丁寧でした' }).classification, 'low_short_positive')
  assert.equal(classifyReview({ rating: 4, text: '院内が清潔で待ち時間も少なく説明もわかりやすかったです。子どもも嫌がらず通えています。引き続きお願いします。' }).classification, 'low_normal')
})

test('返信テンプレートは分類から固定で選ばれ、結果保証・断定表現を含まない', () => {
  assert.equal(selectReplyTemplate({ classification: 'low_template_only', rating: 5, text: '' }), 'thanks_no_text')
  assert.equal(selectReplyTemplate({ classification: 'high', rating: 1, text: '不満' }), 'apology_low_rating')
  assert.equal(selectReplyTemplate({ classification: 'high', rating: 1, text: '返金しろ' }), 'calm_hostile')
  for (const text of Object.values(REPLY_TEMPLATES)) {
    assert.ok(text.length <= 200, '返信は200字以内')
    assert.ok(!/必ず|絶対|完全に/.test(text), '断定表現を含まない')
  }
})

test('maskPersonalInfo は電話番号・メールをマスクする', () => {
  assert.ok(!maskPersonalInfo('予約は 03-1234-5678 まで').includes('03-1234-5678'))
  assert.ok(!maskPersonalInfo('連絡先 test@example.com です').includes('test@example.com'))
})

test('返信案には raw_text が含まれず、snapshotのmasked_textは原文と分離される', () => {
  const { snapshot, replyDraft } = buildReviewArtifacts({
    review_id: 'r1', rating: 5, text: '予約は 03-1234-5678 でした。丁寧でした。', has_reply: false,
  })
  assert.ok(!('raw_text' in replyDraft))
  assert.ok(snapshot.masked_text.includes('[マスク]'))
  assert.ok(!snapshot.masked_text.includes('03-1234-5678'))
  assert.equal(snapshot.risk_level, 'high', '個人情報を含むためhigh')
})

test('GMB adapter の実API・送信系は blocked', async () => {
  await assert.rejects(() => fetchReviews({ source: 'api' }), /blocked/)
  await assert.rejects(() => postToGmb(), /blocked/)
  await assert.rejects(() => replyToReview(), /blocked/)
})
