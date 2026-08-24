import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const actionSource = readFileSync('src/app/admin/pending-review/actions.ts', 'utf8')

test('admin approval does not invoke Telegram notification transport', () => {
  assert.doesNotMatch(actionSource, /reviewApprovalNotification/)
  assert.doesNotMatch(actionSource, /notifyPostApprovedTelegram/)
  assert.doesNotMatch(actionSource, /Telegram通知/)
})
