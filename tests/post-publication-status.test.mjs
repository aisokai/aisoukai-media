import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPostPublicationStatus,
  getTodayJst,
} from '../scripts/lib/post-publication-status.mjs'

test('JSTの当日記事はUTC前日時間帯でも公開対象になる', () => {
  const today = getTodayJst(new Date('2026-06-21T23:30:00.000Z'))
  const status = getPostPublicationStatus({
    reviewed: true,
    draft: false,
    publish_at: '2026-06-22',
  }, { today })

  assert.equal(today, '2026-06-22')
  assert.equal(status.publishable, true)
})

test('future publish_at は理由付きで公開対象外になる', () => {
  const status = getPostPublicationStatus({
    reviewed: true,
    draft: false,
    publish_at: '2026-07-06',
  }, { today: '2026-06-22' })

  assert.equal(status.publishable, false)
  assert.equal(status.isFuture, true)
  assert.match(status.reasons.join('\n'), /publish_at:2026-07-06 は未来日付/)
})
