import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  GATE_POLICIES, JOB_TYPES, SNS_SUSPEND_CHANNELS, SNS_SUSPEND_TYPES, TARGET_CHANNELS,
  isSnsAutoSuspended, isSnsSuspendTarget,
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
  const policy = resolveGatePolicy({ type: 'gmb_update', channel: 'gmb', riskLevel: 'low', config })
  assert.equal(policy, 'auto_when_enabled')
  assert.equal(effectiveGatePolicy({ type: 'gmb_update', channel: 'gmb', policy, config }), 'human_gate')
  // 新方針 (2026-11-06): review_reply.gmb は low risk でも human_gate 固定
  assert.equal(resolveGatePolicy({ type: 'review_reply', channel: 'gmb', riskLevel: 'low', config }), 'human_gate')
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

test('review_reply:gmb は binding 除去によりフラグONでも解禁できない（二重ロック）', () => {
  const config = loadGateConfig()
  // 実configの構造確認: review_reply 系の binding が1件も無い
  assert.deepEqual(Object.keys(config.flag_bindings).filter((k) => k.startsWith('review_reply:')), [])
  // 仮config (実configは変更しない): テンプレのみON / 両フラグON
  const templateOn = { ...config, flags: { ...config.flags, gmb_reply_auto_template: true } }
  const bothOn = { ...config, flags: { ...config.flags, gmb_reply_auto_template: true, gmb_reply_auto: true } }
  const policy = 'auto_when_enabled'
  for (const cfg of [templateOn, bothOn]) {
    for (const variant of ['template_only', 'short_positive', 'normal', null]) {
      assert.equal(
        effectiveGatePolicy({ type: 'review_reply', channel: 'gmb', policy, variant, config: cfg }),
        'human_gate', `variant=${variant} はフラグONでも human_gate`,
      )
    }
  }
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

// ── sns_auto_suspend (指示書B 附属仕様) ─────────────────────────────────────
// 実ファイル config/media-gate.json は読まず・書き換えず、§4 と同型の fixture を使う。
const SNS = ['instagram', 'facebook', 'x', 'threads']
const SUSPEND_FIXTURE_BASE = Object.freeze({
  version: 1,
  fallback: 'human_gate',
  flags: {
    telegram_media_approve: false, telegram_notify: true, health_notify: false, launchd_apply_jobs: false,
    gmb_post_auto: false, gmb_post_auto_all: false, gmb_reply_auto_template: false, gmb_reply_auto: false,
    x_auto: false, x_notice_auto: false, instagram_auto: false, instagram_notice_auto: false,
    facebook_auto: false, facebook_notice_auto: false, threads_auto: false, threads_notice_auto: false,
    sns_auto_suspend: false, lineworks_internal_auto: false,
  },
  gate_table: {
    blog_article: { blog: 'human_gate', obsidian: 'auto' },
    sns_repurpose: {
      instagram: 'auto_when_enabled', facebook: 'auto_when_enabled', x: 'auto_when_enabled',
      threads: 'auto_when_enabled', line_official: 'human_gate', obsidian: 'auto',
    },
    temporary_closure_notice: {
      gmb: 'auto_when_enabled', website_notice: 'human_gate', line_official: 'human_gate',
      instagram: 'auto_when_enabled', facebook: 'auto_when_enabled', x: 'auto_when_enabled',
      threads: 'auto_when_enabled', internal_print: 'auto', lineworks_internal: 'auto_when_enabled',
      telegram_internal: 'auto', obsidian: 'auto',
    },
    schedule_change_notice: {
      gmb: 'auto_when_enabled', website_notice: 'human_gate', line_official: 'human_gate',
      instagram: 'auto_when_enabled', facebook: 'auto_when_enabled', x: 'auto_when_enabled',
      threads: 'auto_when_enabled', internal_print: 'auto', lineworks_internal: 'auto_when_enabled',
      telegram_internal: 'auto', obsidian: 'auto',
    },
    review_reply: { gmb: 'human_gate', telegram_internal: 'auto', obsidian: 'auto' },
  },
  flag_bindings: {
    'temporary_closure_notice:gmb': ['gmb_post_auto'],
    'schedule_change_notice:gmb': ['gmb_post_auto'],
    'temporary_closure_notice:instagram': ['instagram_notice_auto'],
    'temporary_closure_notice:facebook': ['facebook_notice_auto'],
    'temporary_closure_notice:x': ['x_notice_auto'],
    'temporary_closure_notice:threads': ['threads_notice_auto'],
    'schedule_change_notice:instagram': ['instagram_notice_auto'],
    'schedule_change_notice:facebook': ['facebook_notice_auto'],
    'schedule_change_notice:x': ['x_notice_auto'],
    'schedule_change_notice:threads': ['threads_notice_auto'],
    'sns_repurpose:instagram': ['instagram_auto'],
    'sns_repurpose:facebook': ['facebook_auto'],
    'sns_repurpose:x': ['x_auto'],
    'sns_repurpose:threads': ['threads_auto'],
    'schedule_change_notice:lineworks_internal': ['lineworks_internal_auto'],
  },
})

function suspendFixture({ suspend = false, flags = {} } = {}) {
  const base = structuredClone(SUSPEND_FIXTURE_BASE)
  base.flags = { ...base.flags, ...flags, sns_auto_suspend: suspend }
  return base
}

test('suspend 観点1: suspend=false では対象セルの判定が従来どおり', () => {
  const cfg = suspendFixture({ suspend: false })
  assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', config: cfg }), 'auto_when_enabled')
  assert.equal(resolveGatePolicy({ type: 'temporary_closure_notice', channel: 'instagram', config: cfg }), 'auto_when_enabled')
  assert.equal(resolveGatePolicy({ type: 'schedule_change_notice', channel: 'x', config: cfg }), 'auto_when_enabled')
})

test('suspend 観点2: suspend=true では対象 type × instagram/x が human_gate、対象集合は4チャンネル', () => {
  const cfg = suspendFixture({ suspend: true })
  for (const type of SNS_SUSPEND_TYPES) {
    for (const channel of ['instagram', 'x']) {
      assert.equal(resolveGatePolicy({ type, channel, config: cfg }), 'human_gate', `${type}:${channel}`)
    }
    for (const channel of SNS) assert.equal(isSnsSuspendTarget(type, channel), true, `${type}:${channel}`)
  }
  assert.deepEqual([...SNS_SUSPEND_CHANNELS], SNS)
  assert.equal(isSnsSuspendTarget('temporary_closure_notice', 'gmb'), false)
  assert.equal(isSnsSuspendTarget('sns_repurpose', 'line_official'), false)
  assert.equal(isSnsSuspendTarget('review_reply', 'gmb'), false)
  assert.equal(isSnsSuspendTarget('gmb_update', 'instagram'), false)
})

test('suspend 観点3: suspend=true でも対象外セルの判定は不変', () => {
  const on = suspendFixture({ suspend: true })
  const off = suspendFixture({ suspend: false })
  const cases = [
    ['temporary_closure_notice', 'gmb', 'auto_when_enabled'],
    ['schedule_change_notice', 'gmb', 'auto_when_enabled'],
    ['sns_repurpose', 'obsidian', 'auto'],
    ['schedule_change_notice', 'lineworks_internal', 'auto_when_enabled'],
    ['blog_article', 'blog', 'human_gate'],
    ['review_reply', 'gmb', 'human_gate'],
  ]
  for (const [type, channel, expected] of cases) {
    assert.equal(resolveGatePolicy({ type, channel, config: on }), expected, `${type}:${channel}`)
    assert.equal(resolveGatePolicy({ type, channel, config: off }), expected, `${type}:${channel} (off)`)
  }
})

test('suspend 観点4: suspend=true の対象セルは risk low/high とも human_gate', () => {
  const cfg = suspendFixture({ suspend: true })
  for (const riskLevel of ['low', 'high']) {
    assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', riskLevel, config: cfg }), 'human_gate')
    assert.equal(resolveGatePolicy({ type: 'schedule_change_notice', channel: 'x', riskLevel, config: cfg }), 'human_gate')
  }
})

test('suspend 観点5: effectiveGatePolicy は suspend=true なら対象flagがtrueでも human_gate', () => {
  const cfg = suspendFixture({ suspend: true, flags: { instagram_auto: true, x_notice_auto: true } })
  const policy = 'auto_when_enabled'
  assert.equal(effectiveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', policy, config: cfg }), 'human_gate')
  assert.equal(effectiveGatePolicy({ type: 'temporary_closure_notice', channel: 'x', policy, config: cfg }), 'human_gate')
  // 保存済みjobの gate が auto 系でも実行時点で止める
  assert.equal(effectiveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', policy: 'auto', config: cfg }), 'human_gate')
})

test('suspend 観点6: effectiveGatePolicy は suspend=false なら従来どおり', () => {
  const policy = 'auto_when_enabled'
  const enabled = suspendFixture({ suspend: false, flags: { instagram_auto: true } })
  const disabled = suspendFixture({ suspend: false })
  assert.equal(effectiveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', policy, config: enabled }), 'auto_after_notify')
  assert.equal(effectiveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', policy, config: disabled }), 'human_gate')
  // 通常投稿フラグはお知らせ投稿を解禁しない
  assert.equal(effectiveGatePolicy({ type: 'temporary_closure_notice', channel: 'instagram', policy, config: enabled }), 'human_gate')
})

test('suspend 観点7: 対象外 channel は従来判定のまま、forbidden は forbidden のまま', () => {
  const cfg = suspendFixture({ suspend: true, flags: { gmb_post_auto: true } })
  assert.equal(
    effectiveGatePolicy({ type: 'temporary_closure_notice', channel: 'gmb', policy: 'auto_when_enabled', config: cfg }),
    'auto_after_notify',
  )
  assert.equal(
    effectiveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', policy: 'forbidden', config: cfg }),
    'forbidden',
  )
})

test('suspend 観点8: sns_auto_suspend キーが無い旧形式 config は suspend なしとして扱う', () => {
  const legacy = suspendFixture({ flags: { instagram_auto: true } })
  delete legacy.flags.sns_auto_suspend
  assert.equal(isSnsAutoSuspended(legacy), false)
  assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', config: legacy }), 'auto_when_enabled')
  assert.equal(
    effectiveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', policy: 'auto_when_enabled', config: legacy }),
    'auto_after_notify',
  )
  assert.equal(isSnsAutoSuspended({}), false)
  assert.equal(isSnsAutoSuspended(undefined), false)
})

test('suspend 観点9: config=null は従来どおり human_gate', () => {
  assert.equal(isSnsAutoSuspended(null), false)
  assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', config: null }), 'human_gate')
  assert.equal(
    effectiveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', policy: 'auto_when_enabled', config: null }),
    'human_gate',
  )
})

test('suspend 観点10: job 整合 (suspend中の作成は通過、解除中に作成した緩いjobは suspend 中に拒否)', () => {
  const on = suspendFixture({ suspend: true })
  const off = suspendFixture({ suspend: false })
  const params = { type: 'sns_repurpose', source: 'manual', sourceText: '院内ニュース', targetChannels: ['instagram'] }
  const suspendedJob = createJob({ ...params, config: on })
  assert.equal(suspendedJob.gate_policy, 'human_gate')
  assert.equal(suspendedJob.gate_by_channel.instagram, 'human_gate')
  assert.deepEqual(validateJob(suspendedJob, { config: on }).errors, [])

  const looseJob = createJob({ ...params, config: off })
  assert.equal(looseJob.gate_policy, 'auto_when_enabled')
  assert.deepEqual(validateJob(looseJob, { config: off }).errors, [])
  assert.match(validateJob(looseJob, { config: on }).errors.join('\n'), /緩く設定/, '意図した安全側の挙動')
})

// ── sns_auto_suspend tighten-only (指示書B2 §4) ─────────────────────────────
// 対象セルに forbidden を置いた合成 config。実ファイルは読まず・書き換えない。
function forbiddenFixture({ suspend, cell = ['sns_repurpose', 'instagram'], flags = {} } = {}) {
  const cfg = suspendFixture({ suspend, flags })
  cfg.gate_table[cell[0]][cell[1]] = 'forbidden'
  return cfg
}

test('B2-1 suspend ON でも forbidden の対象セルは forbidden のまま（tighten-only、レビュー再現ケース）', () => {
  const cfg = forbiddenFixture({ suspend: true })
  assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', config: cfg }), 'forbidden')
})

test('B2-2 suspend OFF でも forbidden の対象セルは forbidden のまま', () => {
  const cfg = forbiddenFixture({ suspend: false })
  assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', config: cfg }), 'forbidden')
})

test('B2-3 suspend ON の auto_when_enabled 対象セルはフラグONでも resolve/effective とも human_gate', () => {
  const cfg = suspendFixture({ suspend: true, flags: { instagram_auto: true } })
  const resolved = resolveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', config: cfg })
  assert.equal(resolved, 'human_gate')
  assert.equal(
    effectiveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', policy: 'auto_when_enabled', config: cfg }),
    'human_gate',
  )
})

test('B2-4 human_gate の対象セルは suspend ON/OFF とも human_gate のまま', () => {
  for (const suspend of [true, false]) {
    const cfg = suspendFixture({ suspend })
    cfg.gate_table.sns_repurpose.x = 'human_gate'
    assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel: 'x', config: cfg }), 'human_gate', `suspend=${suspend}`)
  }
})

test('B2-5 effectiveGatePolicy: suspend ON で forbidden は forbidden、auto/auto_after_notify は human_gate', () => {
  const cfg = suspendFixture({ suspend: true, flags: { instagram_auto: true } })
  const args = { type: 'sns_repurpose', channel: 'instagram', config: cfg }
  assert.equal(effectiveGatePolicy({ ...args, policy: 'forbidden' }), 'forbidden')
  assert.equal(effectiveGatePolicy({ ...args, policy: 'auto' }), 'human_gate')
  assert.equal(effectiveGatePolicy({ ...args, policy: 'auto_after_notify' }), 'human_gate')
  assert.equal(effectiveGatePolicy({ ...args, policy: 'human_gate' }), 'human_gate')
})

test('B2-6 入口: forbidden 対象セルを含む複合 job は createJob/validateJob とも suspend ON/OFF で forbidden を維持', () => {
  const on = forbiddenFixture({ suspend: true })
  const off = forbiddenFixture({ suspend: false })
  const params = { type: 'sns_repurpose', source: 'manual', sourceText: '院内ニュース', targetChannels: ['instagram', 'x', 'obsidian'] }
  for (const createCfg of [on, off]) {
    const job = createJob({ ...params, config: createCfg })
    assert.equal(job.gate_by_channel.instagram, 'forbidden')
    assert.equal(job.gate_policy, 'forbidden', 'job単位は最厳値の forbidden')
    for (const validateCfg of [on, off]) {
      assert.deepEqual(validateJob(job, { config: validateCfg }).errors, [])
      const loosened = { ...job, gate_policy: 'human_gate' }
      assert.match(validateJob(loosened, { config: validateCfg }).errors.join('\n'), /緩く設定/)
    }
  }
})

test('B2-7 suspend ON・risk high でも forbidden の対象セルは forbidden', () => {
  const cfg = forbiddenFixture({ suspend: true })
  assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel: 'instagram', riskLevel: 'high', config: cfg }), 'forbidden')
})

test('B2-8 対象外セルの forbidden は suspend ON でも forbidden（対象外へ波及しない）', () => {
  const cfg = forbiddenFixture({ suspend: true, cell: ['review_reply', 'gmb'] })
  assert.equal(resolveGatePolicy({ type: 'review_reply', channel: 'gmb', config: cfg }), 'forbidden')
  assert.equal(
    effectiveGatePolicy({ type: 'review_reply', channel: 'gmb', policy: 'forbidden', config: cfg }),
    'forbidden',
  )
})
