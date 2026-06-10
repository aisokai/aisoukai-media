import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHANNEL_LIMITS, buildEmergencyNotice, classifyNoticeType,
} from '../scripts/generate-emergency-notice.mjs'

test('notice type はキーワード固定表で分類される', () => {
  assert.equal(classifyNoticeType('本日午後休診'), 'temporary_closure_notice')
  assert.equal(classifyNoticeType('台風のため本日の午後診療を休診'), 'temporary_closure_notice')
  assert.equal(classifyNoticeType('院長急用で診療時間を変更'), 'schedule_change_notice')
  assert.equal(classifyNoticeType('電話回線不具合'), 'gmb_emergency_notice')
})

test('1入力から全媒体の文面が生成され、文字数上限内に収まる', () => {
  const { drafts, warnings } = buildEmergencyNotice({ inputText: '本日午後休診', date: '2026-06-11' })
  const channels = Object.keys(CHANNEL_LIMITS)
  assert.deepEqual(Object.keys(drafts).sort(), [...channels].sort())
  for (const [channel, text] of Object.entries(drafts)) {
    assert.ok(text.trim().length > 0, `${channel} の文面が空`)
    assert.ok(text.length <= CHANNEL_LIMITS[channel], `${channel} が文字数上限超過`)
  }
  assert.deepEqual(warnings, [])
})

test('入力に秘密値らしき文字列が混ざっても全保存経路でredactされる', () => {
  const { drafts, cleanInput } = buildEmergencyNotice({
    inputText: '本日午後休診 token=supersecret123456', date: '2026-06-11',
  })
  assert.ok(!cleanInput.includes('supersecret123456'))
  for (const text of Object.values(drafts)) {
    assert.ok(!text.includes('supersecret123456'))
    assert.ok(text.includes('[REDACTED]'))
  }
})

test('医療効果の断定表現が入力に混ざると警告が付く (ブロッカーではない)', () => {
  const { warnings } = buildEmergencyNotice({ inputText: '必ず治る特別治療のため休診', date: '2026-06-11' })
  assert.ok(warnings.length > 0)
  assert.match(warnings.join('\n'), /医療広告ガイドライン警告/)
})
