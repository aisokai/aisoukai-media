import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPostApprovalNotification,
  notifyPostApprovedTelegram,
} from '../src/lib/reviewApprovalNotification.mjs'

test('approval notification text includes article details and production links', () => {
  const text = buildPostApprovalNotification({
    title: '仕上げ磨きはいつまで必要？小学生の歯みがきサポート',
    slug: '2026-07-10-monthly-202606topic014',
    reviewedBy: '三谷',
    commitSha: 'abcdef1234567890',
    publishDate: '2026-07-10',
    today: '2026-06-29',
    env: { NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' },
  })

  assert.match(text, /✅ 記事を承認しました/)
  assert.match(text, /仕上げ磨きはいつまで必要？小学生の歯みがきサポート/)
  assert.match(text, /承認者: 三谷/)
  assert.match(text, /GitHub commit: abcdef1/)
  assert.match(text, /公開予定日: 2026-07-10/)
  assert.match(text, /公開予定日まではサイト上では非公開/)
  assert.match(text, /https:\/\/aisoukai-media\.vercel\.app\/blog\/2026-07-10-monthly-202606topic014/)
  assert.doesNotMatch(text, /localhost/)
})

test('approval notification sender posts to Telegram when credentials exist', async () => {
  const calls = []
  const sent = await notifyPostApprovedTelegram({
    title: 'テスト記事',
    slug: '2026-06-29-test-post',
    reviewedBy: 'Reviewer',
    commitSha: '1234567890abcdef',
    publishDate: '2026-06-29',
    today: '2026-06-29',
    env: {
      TELEGRAM_BOT_TOKEN: 'dummy-token',
      TELEGRAM_CHAT_ID: '12345',
      NEXT_PUBLIC_SITE_URL: 'https://clinic.example.jp',
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return { ok: true, json: async () => ({ ok: true }) }
    },
  })

  assert.equal(sent, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.telegram.org/botdummy-token/sendMessage')
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.chat_id, '12345')
  assert.match(body.text, /✅ 記事を承認しました/)
  assert.match(body.text, /https:\/\/clinic\.example\.jp\/blog\/2026-06-29-test-post/)
})

test('approval notification sender is a no-op without Telegram credentials', async () => {
  const sent = await notifyPostApprovedTelegram({
    title: 'テスト記事',
    slug: '2026-06-29-test-post',
    reviewedBy: 'Reviewer',
    commitSha: '1234567890abcdef',
    publishDate: '2026-06-29',
    today: '2026-06-29',
    env: {},
    fetchImpl: async () => {
      throw new Error('fetch should not be called')
    },
  })

  assert.equal(sent, false)
})
