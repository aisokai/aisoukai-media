import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPostPublicationStatus,
  getTodayJst,
} from '../scripts/lib/post-publication-status.mjs'
import { getReviewedContentFingerprint } from '../src/lib/reviewContentFingerprint.mjs'

test('JSTの当日記事はUTC前日時間帯でも公開対象になる', () => {
  const today = getTodayJst(new Date('2026-06-21T23:30:00.000Z'))
  const data = {
    reviewed: true,
    reviewed_at: '2026-06-22',
    reviewed_by: '三谷',
    draft: false,
    publish_at: '2026-06-22',
  }
  data.reviewed_content_hash = getReviewedContentFingerprint(data, '')
  const status = getPostPublicationStatus(data, { today })

  assert.equal(today, '2026-06-22')
  assert.equal(status.publishable, true)
})

test('future publish_at は理由付きで公開対象外になる', () => {
  const data = {
    reviewed: true,
    reviewed_at: '2026-06-22',
    reviewed_by: '三谷',
    draft: false,
    publish_at: '2026-07-06',
  }
  data.reviewed_content_hash = getReviewedContentFingerprint(data, '')
  const status = getPostPublicationStatus(data, { today: '2026-06-22' })

  assert.equal(status.publishable, false)
  assert.equal(status.isFuture, true)
  assert.match(status.reasons.join('\n'), /publish_at:2026-07-06 は未来日付/)
})

test('auto_approved だけでは本文確認済みとして公開しない', () => {
  const status = getPostPublicationStatus({
    reviewed: false,
    draft: false,
    auto_approved: true,
    publication_status: 'auto_approved',
    legal_check_status: 'passed',
    image_check_status: 'passed',
    medical_risk: 'low',
    publish_at: '2026-06-22',
  }, { today: '2026-06-22' })

  assert.equal(status.publishable, false)
  assert.equal(status.approved, false)
  assert.match(status.reasons.join('\n'), /本文確認済みではありません/)
})
