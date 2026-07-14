// Codex安全レビュー指摘の固定化テスト。
// 破壊的操作のHuman Gate / launchdデフォルトの無害性 / 通知flagゲート / 秘密値非表示。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildAuthorizationUrl } from '../scripts/gmb-auth.mjs'
import {
  GMB_KEYCHAIN_SERVICES,
  getGmbKeychainCredentials,
  saveGmbRefreshToken,
} from '../scripts/lib/gmb-keychain.mjs'
import { applyJob, createDeleteRequest, DELETE_TYPES } from '../scripts/lib/media-apply.mjs'
import { approveMediaJob } from '../scripts/lib/telegram-media-commands.mjs'
import { notifyTelegramIfConfigured } from '../scripts/lib/telegram-notify.mjs'
import { APPLY_JOBS, DEFAULT_JOBS, generatePlist } from '../scripts/setup-launchd-media.mjs'
import { selectAutoExecutable } from '../scripts/media-executor.mjs'
import { ROOT, createJob, loadGateConfig, saveJob, transitionJob } from '../scripts/lib/media-queue.mjs'

const config = loadGateConfig()

// ── 1. 削除のHuman Gate 3段階 ────────────────────────────────────────────

test('削除リクエストは human_required / human_gate / high risk で作られる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'delete-gate-'))
  const logPath = join(dir, 'log.jsonl')
  const job = createDeleteRequest({ kind: 'delete_review_reply', target: 'r-1', by: '先生', dir, logPath, config })
  assert.equal(job.status, 'human_required')
  assert.equal(job.gate_policy, 'human_gate')
  assert.equal(job.risk_level, 'high')
  assert.equal(job.delete_target, 'r-1')
})

test('未承認の削除jobは実行を拒否される', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delete-gate-'))
  const logPath = join(dir, 'log.jsonl')
  const job = createDeleteRequest({ kind: 'delete_gmb_post', target: 'accounts/a/locations/l/localPosts/p', by: '先生', dir, logPath, config })
  await assert.rejects(
    () => applyJob({ id: job.id, apply: true, executedBy: '先生', dir, logPath, config, client: {} }),
    /approved ではありません/,
  )
})

test('承認済みでも --by なしの削除は拒否される', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delete-gate-'))
  const logPath = join(dir, 'log.jsonl')
  const job = createDeleteRequest({ kind: 'delete_review_reply', target: 'r-2', by: '先生', dir, logPath, config })
  approveMediaJob({ id: job.id, by: '先生', dir, logPath })
  await assert.rejects(
    () => applyJob({ id: job.id, apply: true, dir, logPath, config, client: {} }),
    /--by/,
  )
})

test('approved_by の記録がないjobは実行を拒否される', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delete-gate-'))
  const logPath = join(dir, 'log.jsonl')
  let job = createJob({
    type: 'gmb_update', source: 'manual', sourceText: 'x', targetChannels: ['gmb'], config,
  })
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'approved') // approved_by / approved_at を記録しない承認 (不正経路の再現)
  saveJob(job, { dir, logPath })
  await assert.rejects(
    () => applyJob({ id: job.id, apply: true, dir, logPath, config, client: {} }),
    /approved_by/,
  )
})

test('3段階を満たした削除のみ実行される (リクエスト→承認→--apply --by)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delete-gate-'))
  const logPath = join(dir, 'log.jsonl')
  const job = createDeleteRequest({ kind: 'delete_review_reply', target: 'r-3', by: '先生', dir, logPath, config })
  approveMediaJob({ id: job.id, by: '先生', dir, logPath })
  let deletedId = null
  const client = { deleteReply: async ({ reviewId }) => { deletedId = reviewId; return { deleted: true } } }
  const result = await applyJob({ id: job.id, apply: true, executedBy: '先生', dir, logPath, config, client })
  assert.equal(result.job.status, 'executed')
  assert.equal(deletedId, 'r-3')
})

test('削除typeは executor の自動実行対象に決してならない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'delete-gate-'))
  const logPath = join(dir, 'log.jsonl')
  const job = createDeleteRequest({ kind: 'delete_review_reply', target: 'r-4', by: '先生', dir, logPath, config })
  const allFlagsOn = {
    ...config,
    flags: Object.fromEntries(Object.keys(config.flags).map((k) => [k, true])),
  }
  assert.deepEqual(selectAutoExecutable([job], allFlagsOn), [])
  assert.ok(DELETE_TYPES.every((t) => t.startsWith('delete_')))
})

// ── 2. launchd デフォルトの無害性 ────────────────────────────────────────

test('launchd デフォルトjobは --apply / --notify を含まない', () => {
  for (const job of DEFAULT_JOBS) {
    assert.ok(!job.command.includes('--apply'), `${job.label} に --apply が含まれる`)
    assert.ok(!job.command.includes('--notify'), `${job.label} に --notify が含まれる`)
    const plist = generatePlist(job, ROOT)
    assert.ok(!plist.includes('--apply') && !plist.includes('--notify'), `${job.label} plist`)
    assert.ok(!/gmb-apply|lineworks-notify/.test(job.command), `${job.label} に送信スクリプトが含まれる`)
  }
})

test('apply/notify系jobはデフォルトと別ラベルに分離されている', () => {
  const defaultLabels = new Set(DEFAULT_JOBS.map((j) => j.label))
  for (const job of APPLY_JOBS) {
    assert.ok(!defaultLabels.has(job.label))
  }
  assert.equal(config.flags.launchd_apply_jobs, false, 'launchd_apply_jobs は初期OFF')
})

// ── 3. 通知flagゲート (env があっても flag OFF なら no-op) ───────────────

test('telegram_notify flag OFF なら env設定済みでも送信しない', async () => {
  const saved = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID }
  process.env.TELEGRAM_BOT_TOKEN = 'dummy-token-for-test'
  process.env.TELEGRAM_CHAT_ID = '12345'
  let fetchCalled = false
  try {
    const sent = await notifyTelegramIfConfigured('test', {
      config: { flags: { telegram_notify: false } },
      fetchImpl: async () => { fetchCalled = true; return { json: async () => ({ ok: true }) } },
    })
    assert.equal(sent, false)
    assert.equal(fetchCalled, false, 'flag OFFでfetchが呼ばれてはならない')
  } finally {
    if (saved.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = saved.token
    if (saved.chat === undefined) delete process.env.TELEGRAM_CHAT_ID
    else process.env.TELEGRAM_CHAT_ID = saved.chat
  }
})

test('telegram_notify flag ON のときのみ送信処理に進む', async () => {
  const saved = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID }
  process.env.TELEGRAM_BOT_TOKEN = 'dummy-token-for-test'
  process.env.TELEGRAM_CHAT_ID = '12345'
  let fetchCalled = false
  try {
    const sent = await notifyTelegramIfConfigured('test', {
      config: { flags: { telegram_notify: true } },
      fetchImpl: async () => { fetchCalled = true; return { json: async () => ({ ok: true }) } },
    })
    assert.equal(sent, true)
    assert.equal(fetchCalled, true)
  } finally {
    if (saved.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = saved.token
    if (saved.chat === undefined) delete process.env.TELEGRAM_CHAT_ID
    else process.env.TELEGRAM_CHAT_ID = saved.chat
  }
})

test('通知系flagは実configで初期OFF', () => {
  assert.equal(config.flags.telegram_notify, false)
  assert.equal(config.flags.health_notify, false)
  assert.equal(config.flags.lineworks_internal_auto, false)
})

// ── 4. gmb-auth は refresh token を stdout に表示しない ────────────────

test('gmb-auth は完全一致のHuman GateなしではOAuthを開始しない', () => {
  const result = spawnSync('node', ['scripts/gmb-auth.mjs', '--authorize'], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  })
  assert.notEqual(result.status, 0)
  const output = `${result.stdout}\n${result.stderr}`
  assert.doesNotMatch(output, /refresh_token|client_secret/i)
  assert.match(output, /GMB_OAUTH_KEYCHAIN/)
})

test('gmb-auth は refresh token を console 出力する実装を持たない', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'gmb-auth.mjs'), 'utf8')
  assert.doesNotMatch(source, /urn:ietf:wg:oauth:2\.0:oob/)
  assert.match(source, /127\.0\.0\.1/)
  assert.match(source, /saveGmbRefreshToken/)
  assert.doesNotMatch(source, /show-token/)
})

test('gmb-auth はloopback callbackとstateを認可URLへ固定する', () => {
  const url = new URL(buildAuthorizationUrl({
    clientId: 'synthetic-client',
    redirectUri: 'http://127.0.0.1:54321/oauth/callback',
    state: 'synthetic-state',
  }))
  assert.equal(url.hostname, 'accounts.google.com')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:54321/oauth/callback')
  assert.equal(url.searchParams.get('state'), 'synthetic-state')
  assert.equal(url.searchParams.get('access_type'), 'offline')
  assert.equal(url.searchParams.get('prompt'), 'consent')
})

test('GMB Keychain helperは値を標準出力へ出さず3項目をservice名で取得する', () => {
  const requested = []
  const credentials = getGmbKeychainCredentials({
    account: 'synthetic-user',
    execFileSyncImpl: (_file, args) => {
      requested.push(args)
      return `value-for-${args[4]}`
    },
  })
  assert.equal(Object.keys(credentials).length, 3)
  assert.deepEqual(requested.map((args) => args[4]), Object.values(GMB_KEYCHAIN_SERVICES))
})

test('Refresh Token保存はKeychain serviceだけを更新する', () => {
  let invocation
  saveGmbRefreshToken('synthetic-refresh-token-value', {
    account: 'synthetic-user',
    execFileSyncImpl: (file, args, options) => { invocation = { file, args, options } },
  })
  assert.equal(invocation.file, '/usr/bin/security')
  assert.ok(invocation.args.includes(GMB_KEYCHAIN_SERVICES.refreshToken))
  assert.deepEqual(invocation.options.stdio, ['ignore', 'ignore', 'ignore'])
})
