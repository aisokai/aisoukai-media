// Legacy helper tests use injected effects only; the new runtime never imports them.
import { runMwfCli } from '../scripts/ops-mwf.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { isTelegramNotificationEnabled, notifySyncedDraftLedger, reconcileBeforeGeneration } from '../scripts/lib/scheduled-draft-notification.mjs'

test('review notification failure leaves the synced ledger untouched', async () => {
  let finalizeCalls = 0
  const result = await notifySyncedDraftLedger({
    root: '/tmp/injected-root',
    draftSyncResult: { ok: true, synced: true, ledgerPending: true, resolvedEntries: [{ path: 'content/posts/2026-08-12-topic.md', contentSha256: 'a'.repeat(64) }] },
    sendNotification: async () => { throw new Error('injected notification failure') },
    finalizeLedger: () => { finalizeCalls += 1; return { ok: true } },
  })
  assert.equal(result.ok, false)
  assert.equal(result.notified, false)
  assert.equal(result.finalized, false)
  assert.equal(finalizeCalls, 0)
})

test('already-sent dedupe finalizes the ledger without a resend', async () => {
  let sends = 0
  let finalized
  const resolvedEntries = [{ path: 'content/posts/2026-08-12-topic.md', contentSha256: 'a'.repeat(64) }]
  const result = await notifySyncedDraftLedger({
    root: '/tmp/injected-root',
    draftSyncResult: { ok: true, synced: true, ledgerPending: true, resolvedEntries },
    sendNotification: async () => { sends += 1; return { sent: false, duplicate: true } },
    finalizeLedger: (input) => { finalized = input; return { ok: true } },
  })
  assert.equal(sends, 1)
  assert.equal(result.ok, true)
  assert.equal(result.duplicate, true)
  assert.equal(result.finalized, true)
  assert.deepEqual(finalized, { root: '/tmp/injected-root', resolvedEntries })
})

test('a multi-entry synced ledger emits one digest with a set-based dedupe version', async () => {
  const resolvedEntries = [
    { path: 'content/posts/2026-08-12-topic.md', contentSha256: 'a'.repeat(64) },
    { path: 'content/posts/2026-08-14-topic.md', contentSha256: 'b'.repeat(64) },
  ]
  const calls = []
  const result = await notifySyncedDraftLedger({
    root: '/tmp/injected-root',
    draftSyncResult: { ok: true, synced: true, ledgerPending: true, resolvedEntries },
    sendNotification: async (text, boundary) => { calls.push({ text, boundary }); return { sent: true, duplicate: false } },
    finalizeLedger: () => ({ ok: true }),
  })
  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.match(calls[0].text, /2件/)
  assert.match(calls[0].boundary.contentVersion, /^[a-f0-9]{64}$/)
})

test('Telegram notifications are fail-closed unless the media gate flag is explicitly true', () => {
  assert.equal(isTelegramNotificationEnabled({ flags: { telegram_notify: true } }), true)
  assert.equal(isTelegramNotificationEnabled({ flags: { telegram_notify: false } }), false)
  assert.equal(isTelegramNotificationEnabled({ flags: {} }), false)
  assert.equal(isTelegramNotificationEnabled({}), false)
})

test('no-draft path still invokes the pre-generation ledger reconciliation', async () => {
  let syncCalls = 0
  let notifyCalls = 0
  const draftSyncResult = { ok: true, committed: false, recovered: false, reason: '同期対象の管理済みdraftはありません' }
  const result = await reconcileBeforeGeneration({
    root: '/tmp/injected-root',
    runCommand: () => { throw new Error('no Git command is needed for an empty ledger') },
    sync: (input) => { syncCalls += 1; assert.equal(input.root, '/tmp/injected-root'); return draftSyncResult },
    notify: async (input) => { notifyCalls += 1; assert.deepEqual(input, { root: '/tmp/injected-root', draftSyncResult }); return { ok: true, notified: false } },
  })
  assert.equal(syncCalls, 1)
  assert.equal(notifyCalls, 1)
  assert.equal(result.draftSyncResult, draftSyncResult)
})

test('unbound runtime is stopped and old auto-publish options are rejected', async () => {
  let status
  assert.equal(await runMwfCli([], { output: value => { status = value } }), 2)
  assert.equal(status.status, 'stopped')
  await assert.rejects(runMwfCli(['--auto-publish']), /unsupported_argument/)
})
