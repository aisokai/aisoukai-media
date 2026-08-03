import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  GATE_POLICIES, JOB_TYPES, TARGET_CHANNELS,
  assertValidTransition, containsSecrets, createJob, effectiveGatePolicy, loadGateConfig,
  redactSecrets, resolveGatePolicy, saveJob, strictestGatePolicy,
  transitionJob, validateJob,
} from '../scripts/lib/media-queue.mjs'

const config = loadGateConfig()

test('gate config は承認済みTelegram通知のみONで、残りの自動実行フラグは全てOFF', () => {
  assert.ok(config)
  assert.equal(config.flags.telegram_notify, true, 'Telegram通知は先生の承認によりON')
  for (const [flag, value] of Object.entries(config.flags)) {
    if (flag === 'telegram_notify') continue
    assert.equal(value, false, `flag ${flag} はOFFであるべき`)
  }
})

test('不明な type / channel は安全側 (human_gate) に倒れる', () => {
  assert.equal(resolveGatePolicy({ type: 'unknown_type', channel: 'gmb', config }), 'human_gate')
  assert.equal(resolveGatePolicy({ type: 'gmb_update', channel: 'unknown_channel', config }), 'human_gate')
  assert.equal(resolveGatePolicy({ type: 'gmb_update', channel: 'gmb', config: null }), 'human_gate')
})

test('high risk は auto系でも human_gate に引き上げられる', () => {
  const policy = resolveGatePolicy({ type: 'review_reply', channel: 'gmb', riskLevel: 'high', config })
  assert.equal(policy, 'human_gate')
})

test('auto_when_enabled はフラグOFFなら実効 human_gate になる', () => {
  const policy = resolveGatePolicy({ type: 'review_reply', channel: 'gmb', riskLevel: 'low', config })
  assert.equal(policy, 'auto_when_enabled')
  assert.equal(effectiveGatePolicy({ type: 'review_reply', channel: 'gmb', policy, config }), 'human_gate')
})

test('strictestGatePolicy は最も厳しいpolicyを返す', () => {
  assert.equal(strictestGatePolicy(['auto', 'human_gate', 'auto_when_enabled']), 'human_gate')
  assert.equal(strictestGatePolicy([]), 'human_gate')
})

test('createJob は固定enum内のjobを生成し validator を通過する', () => {
  const job = createJob({
    type: 'temporary_closure_notice',
    source: 'manual',
    sourceText: '本日午後休診',
    targetChannels: ['gmb', 'website_notice', 'internal_print'],
    riskLevel: 'low',
    config,
  })
  assert.ok(JOB_TYPES.includes(job.type))
  assert.ok(job.target_channels.every((c) => TARGET_CHANNELS.includes(c)))
  assert.ok(GATE_POLICIES.includes(job.gate_policy))
  assert.equal(job.gate_policy, 'human_gate', 'website_notice を含むため最厳値はhuman_gate')
  assert.deepEqual(validateJob(job, { config }).errors, [])
})

test('validator は gate_policy の緩和を拒否する', () => {
  const job = createJob({
    type: 'gmb_campaign', source: 'manual', sourceText: 'キャンペーン',
    targetChannels: ['gmb'], riskLevel: 'medium', config,
  })
  const tampered = { ...job, gate_policy: 'auto' }
  const { errors } = validateJob(tampered, { config })
  assert.match(errors.join('\n'), /緩く設定/)
})

test('validator は固定enum外の値を拒否する', () => {
  const job = createJob({
    type: 'gmb_update', source: 'manual', sourceText: 'x', targetChannels: ['gmb'], config,
  })
  assert.ok(validateJob({ ...job, status: 'published' }, { config }).errors.length > 0)
  assert.ok(validateJob({ ...job, type: 'new_invented_type' }, { config }).errors.length > 0)
  assert.ok(validateJob({ ...job, target_channels: ['facebook'] }, { config }).errors.length > 0)
})

test('status遷移は固定表のみ許可される', () => {
  assertValidTransition('draft_requested', 'draft_generated')
  assertValidTransition('review_pending', 'approved')
  assert.throws(() => assertValidTransition('draft_requested', 'executed'))
  assert.throws(() => assertValidTransition('rejected', 'executed'))
  assert.throws(() => assertValidTransition('archived', 'approved'))
})

test('transitionJob は immutable フィールドの更新を拒否する', () => {
  const job = createJob({
    type: 'gmb_update', source: 'manual', sourceText: 'x', targetChannels: ['gmb'], config,
  })
  assert.throws(() => transitionJob(job, 'draft_generated', { type: 'blog_article' }))
  assert.throws(() => transitionJob(job, 'draft_generated', { source_text: '改ざん' }))
})

test('saveJob は既存jobの immutable フィールド変更を拒否する', () => {
  const dir = mkdtempSync(join(tmpdir(), 'media-queue-test-'))
  const logPath = join(dir, 'log.jsonl')
  const job = createJob({
    type: 'gmb_update', source: 'manual', sourceText: 'x', targetChannels: ['gmb'], config,
  })
  saveJob(job, { dir, logPath })
  const updated = transitionJob(job, 'draft_generated')
  saveJob(updated, { dir, logPath })
  assert.throws(() => saveJob({ ...updated, type: 'blog_article' }, { dir, logPath }))
})

test('review_reply:gmb の flag binding は variant 別に解禁できる', () => {
  const config = loadGateConfig()
  // テンプレ返信のみ解禁した仮config (実configは変更しない)
  const partial = { ...config, flags: { ...config.flags, gmb_reply_auto_template: true } }
  const policy = 'auto_when_enabled'
  assert.equal(
    effectiveGatePolicy({ type: 'review_reply', channel: 'gmb', policy, variant: 'template_only', config: partial }),
    'auto_after_notify', '星5本文なしテンプレ返信は gmb_reply_auto_template のみで解禁できる',
  )
  assert.equal(
    effectiveGatePolicy({ type: 'review_reply', channel: 'gmb', policy, variant: 'normal', config: partial }),
    'human_gate', '通常返信は gmb_reply_auto が必要',
  )
  assert.equal(
    effectiveGatePolicy({ type: 'review_reply', channel: 'gmb', policy, config: partial }),
    'human_gate', 'variant指定なしは通常返信扱い',
  )
})

test('containsSecrets は秘密値パターンを検出する', () => {
  assert.equal(containsSecrets('token=supersecretvalue123'), true)
  assert.equal(containsSecrets('Authorization: Bearer abcdef123456789'), true)
  assert.equal(containsSecrets('sk-abcdefghijklmnop を使う'), true)
  assert.equal(containsSecrets('AIzaSyA1234567890abc'), true)
  assert.equal(containsSecrets('本日午後休診のお知らせ'), false)
})

test('redactSecrets は秘密値らしき文字列をマスクする', () => {
  assert.ok(!redactSecrets('key sk-abcdefghijklmnop').includes('sk-abcdefghijklmnop'))
  assert.ok(!redactSecrets('Authorization: Bearer abcdef123456789').includes('abcdef123456789'))
  assert.ok(!redactSecrets('token=supersecretvalue123').includes('supersecretvalue123'))
})
