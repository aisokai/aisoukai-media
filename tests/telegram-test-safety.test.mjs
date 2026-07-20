import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EXPLICIT_SEND_FLAG, runTelegramLiveCheck } from '../scripts/telegram-notify-live-check.mjs'

const ROOT = process.cwd()

test('通常テストは *.test.mjs の明示対象だけを収集する', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(packageJson.scripts.test, 'node --test tests/*.test.mjs scripts/*.test.mjs scripts/lib/*.test.mjs')
  assert.ok(!('test:telegram' in packageJson.scripts))
  assert.match(packageJson.scripts['telegram:notify:live-check'], /telegram-notify-live-check\.mjs/)
})

test('live Telegram確認は --send なしでは環境読込も送信も行わない', async () => {
  let loadEnvCalled = false
  let sendCalled = false
  const result = await runTelegramLiveCheck({
    argv: [],
    env: {},
    loadEnvImpl: () => { loadEnvCalled = true },
    sendTelegramImpl: async () => { sendCalled = true },
  })
  assert.deepEqual(result, { sent: false, reason: 'explicit-send-required' })
  assert.equal(loadEnvCalled, false)
  assert.equal(sendCalled, false)
})

test('live Telegram確認は --send を明示しても注入したmockだけを使う', async () => {
  let sent = null
  const env = { TELEGRAM_BOT_TOKEN: 'synthetic-token', TELEGRAM_CHAT_ID: 'synthetic-chat' }
  const result = await runTelegramLiveCheck({
    argv: [EXPLICIT_SEND_FLAG],
    env,
    loadEnvImpl: () => {},
    sendTelegramImpl: async (token, chatId, text) => { sent = { token, chatId, text } },
  })
  assert.deepEqual(result, { sent: true, reason: 'sent' })
  assert.deepEqual(sent, {
    token: 'synthetic-token', chatId: 'synthetic-chat', text: 'aisoukai-media Telegram notification test',
  })
})
