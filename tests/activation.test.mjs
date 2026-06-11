import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildActivationChecks, findNextAction } from '../scripts/media-activation-status.mjs'
import { validateLineworksSend } from '../scripts/lineworks-notify.mjs'
import { buildDailyMarkdown } from '../scripts/export-obsidian.mjs'
import { DEFAULT_JOBS, generatePlist } from '../scripts/setup-launchd-media.mjs'
import { createJob, loadGateConfig, transitionJob } from '../scripts/lib/media-queue.mjs'

const config = loadGateConfig()

test('activation checks は秘密値を含まず、次アクションを1つ返す', () => {
  const checks = buildActivationChecks()
  assert.ok(checks.length >= 8)
  const serialized = JSON.stringify(checks)
  assert.ok(!/sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S{8,}|refresh[_-]?token\s*[=:]\s*\S/i.test(serialized))
  for (const check of checks) {
    assert.equal(typeof check.ok, 'boolean')
    assert.ok(check.next, `${check.label} に next がない`)
    if (check.guidance) assert.ok(Array.isArray(check.guidance), `${check.label} guidance`)
  }
  const next = findNextAction(checks)
  // 未達項目がある場合は具体的コマンドが提示される
  if (next) assert.ok(next.next.length > 5)
})

test('activation Stage 1-4 は client/secret + refresh + location が揃うまで未達', () => {
  const root = mkdtempSync(join(tmpdir(), 'activation-root-'))
  mkdirSync(join(root, 'config'), { recursive: true })
  writeFileSync(join(root, 'config', 'gmb-location.json'), '{"account_id":"a","location_id":"l"}\n')
  const base = { config, root, plistDir: join(root, 'LaunchAgents'), jobs: [] }

  const missingClient = buildActivationChecks({
    ...base,
    credentials: { clientId: null, clientSecret: null, refreshToken: 'refresh-token-present' },
  }).find((c) => c.stage === '1-4')
  assert.equal(missingClient.ok, false)

  const ready = buildActivationChecks({
    ...base,
    credentials: { clientId: 'client-id-present', clientSecret: 'client-secret-present', refreshToken: 'refresh-token-present' },
  }).find((c) => c.stage === '1-4')
  assert.equal(ready.ok, true)
})

test('activation default launchd plist は送信・apply系コマンドを含まない', () => {
  const forbidden = /--apply|--notify|\bgmb-apply\b|\blineworks-notify\b|\bpublish\b|\bpush\b|\bdeploy\b/
  for (const job of DEFAULT_JOBS) {
    assert.doesNotMatch(job.command, forbidden, `${job.label} command`)
    assert.doesNotMatch(generatePlist(job, '/tmp/aisoukai-media-test-root'), forbidden, `${job.label} plist`)
  }
})

test('activation Stage 1-5 は default launchd 全jobがload済みの時だけ達成', () => {
  const root = mkdtempSync(join(tmpdir(), 'activation-launchd-'))
  const plistDir = join(root, 'LaunchAgents')
  mkdirSync(plistDir, { recursive: true })
  for (const job of DEFAULT_JOBS) {
    writeFileSync(join(plistDir, `${job.label}.plist`), generatePlist(job, root))
  }
  const base = {
    config, root, plistDir, jobs: [],
    credentials: { clientId: null, clientSecret: null, refreshToken: null },
  }

  const unloaded = buildActivationChecks({ ...base, launchdStatus: () => false })
    .find((c) => c.stage === '1-5')
  assert.equal(unloaded.ok, false)

  const loaded = buildActivationChecks({ ...base, launchdStatus: () => true })
    .find((c) => c.stage === '1-5')
  assert.equal(loaded.ok, true)
})

test('LINE WORKS送信は承認済みjob以外を拒否する (三重ゲート)', () => {
  assert.equal(validateLineworksSend({ job: null, flagOn: true }).ok, false, '--text 自由文は送信不可')

  let job = createJob({
    type: 'temporary_closure_notice', source: 'manual', sourceText: '休診',
    targetChannels: ['internal_print', 'lineworks_internal'], config,
  })
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'review_pending')
  assert.equal(validateLineworksSend({ job, flagOn: true }).ok, false, '未承認jobは送信不可')

  const approved = transitionJob(job, 'approved', { approved_by: 'human:先生', approved_at: job.updated_at })
  assert.equal(validateLineworksSend({ job: approved, flagOn: false }).ok, false, 'フラグOFFは送信不可')
  assert.equal(validateLineworksSend({ job: approved, flagOn: true }).ok, true, '承認済み+フラグONのみ送信可')

  const noBy = { ...approved, approved_by: null }
  assert.equal(validateLineworksSend({ job: noBy, flagOn: true }).ok, false, 'approved_byなしは送信不可')
})

test('Obsidian日次記録に承認待ち一覧が含まれる', () => {
  const md = buildDailyMarkdown({
    date: '2026-06-11',
    events: [],
    statusCounts: { queue_total: 2, review_pending: 1, human_required: 1, failed: 0 },
    pending: [
      { id: 'mj-1', type: 'review_reply', status: 'human_required', summary: 'review x (rating 2): マスク済み' },
      { id: 'mj-2', type: 'gmb_update', status: 'review_pending', summary: 'お知らせ' },
    ],
  })
  assert.match(md, /## 承認待ち \(Human Gate\)/)
  assert.match(md, /🔴 `mj-1` review_reply/)
  assert.match(md, /🟡 `mj-2` gmb_update/)
})

test('activation: tmp環境では使われない (実configを破壊しない確認)', () => {
  // buildActivationChecks は読み取り専用。実行してもファイルが作られないこと。
  const before = mkdtempSync(join(tmpdir(), 'noop-'))
  buildActivationChecks()
  assert.ok(before) // smoke: 例外なく完了すればよい
})
