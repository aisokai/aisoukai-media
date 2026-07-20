import test from 'node:test'
import assert from 'node:assert/strict'
import { runTelegramLiveCheck } from '../scripts/telegram-notify-live-check.mjs'

test('forged flags and env cannot unlock the hard-disabled Telegram CLI', () => {
  const result = runTelegramLiveCheck({
    argv: ['--send', '--human-approved'],
    env: { TELEGRAM_BOT_TOKEN: 'synthetic', TELEGRAM_CHAT_ID: 'synthetic' },
    loadEnvImpl: () => { throw new Error('must not load env') },
    loadSenderImpl: () => { throw new Error('must not load transport') },
  })
  assert.deepEqual(result, { sent: false, reason: 'HUMAN_GATE_REQUIRED' })
})
