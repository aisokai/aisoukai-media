import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('monthly topic candidates GitHub Action runs on the first day and notifies Telegram', () => {
  const workflow = readFileSync('.github/workflows/monthly-topic-candidates.yml', 'utf8')

  assert.match(workflow, /cron:\s*'0 0 1 \* \*'/)
  assert.match(workflow, /topic-candidates:generate/)
  assert.match(workflow, /topic-candidates:validate/)
  assert.match(workflow, /notify:topic-candidates/)
  assert.match(workflow, /TELEGRAM_BOT_TOKEN/)
  assert.match(workflow, /TELEGRAM_CHAT_ID/)
  assert.match(workflow, /git commit -m "chore: generate monthly topic candidates"/)
})
