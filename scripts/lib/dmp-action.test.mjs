import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTION_TYPES,
  ACTION_STATUSES,
  CHANNELS,
  PHASE2_BLOCKED_TYPES,
  VALID_TRANSITIONS,
  validateActionInput,
  shouldBlockOnCreate,
  createAction,
  serializeAction,
  deserializeAction,
} from './dmp-action.mjs'

// ── テストヘルパー ──────────────────────────────────────────────────────────

function validInput(partial) {
  return {
    type: 'content.review.approve',
    channel: 'blog',
    origin_surface: 'mitanios_dmp',
    actor: { kind: 'human', display_name: '三谷' },
    target: { kind: 'post', id: 'blog-2026-06-22', path: 'content/posts/2026-06-22-test.md' },
    requested_transition: 'pending → validated',
    safety: {
      risk_level: 'high',
      requires_human: true,
      external_effect: false,
      production_effect: true,
      allowed_executor: 'local_mitani',
    },
    git: { repo: 'aisokai/aisoukai-media', base_ref: 'origin/main' },
    ...partial,
  }
}

// ── 定数の整合性 ────────────────────────────────────────────────────────────

test('ACTION_TYPES は mitanios-gui 側と同じ 22 種類', () => {
  assert.equal(ACTION_TYPES.length, 22)
  assert.ok(ACTION_TYPES.includes('content.review.approve'))
  assert.ok(ACTION_TYPES.includes('repo.push_request'))
})

test('ACTION_STATUSES は 10 種類', () => {
  assert.equal(ACTION_STATUSES.length, 10)
  assert.ok(ACTION_STATUSES.includes('pending'))
  assert.ok(ACTION_STATUSES.includes('blocked'))
})

test('CHANNELS は 8 種類', () => {
  assert.equal(CHANNELS.length, 8)
  assert.ok(CHANNELS.includes('blog'))
  assert.ok(CHANNELS.includes('gmb'))
})

test('PHASE2_BLOCKED_TYPES は 3 種類', () => {
  assert.equal(PHASE2_BLOCKED_TYPES.size, 3)
  assert.ok(PHASE2_BLOCKED_TYPES.has('repo.push_request'))
  assert.ok(PHASE2_BLOCKED_TYPES.has('media.approve'))
  assert.ok(PHASE2_BLOCKED_TYPES.has('content.delete_physical'))
})

test('VALID_TRANSITIONS の全 status にエントリがある', () => {
  for (const status of ACTION_STATUSES) {
    assert.ok(status in VALID_TRANSITIONS, `${status} の遷移定義がありません`)
  }
})

// ── validateActionInput ─────────────────────────────────────────────────────

test('有効な入力は valid: true', () => {
  const result = validateActionInput(validInput())
  assert.equal(result.valid, true)
  assert.equal(result.errors.length, 0)
})

test('null 入力はエラー', () => {
  const result = validateActionInput(null)
  assert.equal(result.valid, false)
})

test('type が空はエラー', () => {
  const result = validateActionInput(validInput({ type: '' }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('type')))
})

test('actor.display_name が空はエラー', () => {
  const result = validateActionInput(validInput({ actor: { kind: 'human', display_name: '' } }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('actor.display_name')))
})

test('production_effect: true で requires_human: false はエラー', () => {
  const result = validateActionInput(validInput({
    safety: {
      risk_level: 'high',
      requires_human: false,
      external_effect: false,
      production_effect: true,
      allowed_executor: 'local_mitani',
    },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('production_effect')))
})

test('allowlist 外の path はエラー', () => {
  const result = validateActionInput(validInput({
    target: { kind: 'post', id: 'x', path: 'node_modules/evil.js' },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('allowlist')))
})

test('allowlist 内の path は OK', () => {
  for (const path of ['content/posts/test.md', 'data/x.json', 'public/images/library/a.jpg']) {
    const result = validateActionInput(validInput({ target: { kind: 'post', id: 'x', path } }))
    assert.equal(result.valid, true, `${path} は OK のはず`)
  }
})

test('payload に secrets パターンがあればエラー', () => {
  const result = validateActionInput(validInput({ payload: { api_key: 'abc' } }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('secrets')))
})

// ── shouldBlockOnCreate ─────────────────────────────────────────────────────

test('repo.push_request は blocked', () => {
  assert.equal(shouldBlockOnCreate(validInput({ type: 'repo.push_request' })), true)
})

test('external_effect: true は blocked', () => {
  assert.equal(shouldBlockOnCreate(validInput({
    safety: { risk_level: 'low', requires_human: false, external_effect: true, production_effect: false, allowed_executor: 'none' },
  })), true)
})

test('通常の Action は blocked にならない', () => {
  assert.equal(shouldBlockOnCreate(validInput({ type: 'repo.validate' })), false)
})

// ── createAction ────────────────────────────────────────────────────────────

test('有効な入力で Action を作成できる', () => {
  const result = createAction(validInput())
  assert.equal(result.ok, true)
  assert.ok(result.data.id.startsWith('act-'))
  assert.equal(result.data.status, 'pending')
  assert.equal(result.data.type, 'content.review.approve')
  assert.equal(result.data.audit.length, 1)
})

test('blocked type は status: blocked で作成される', () => {
  const result = createAction(validInput({
    type: 'repo.push_request',
    safety: { risk_level: 'high', requires_human: true, external_effect: true, production_effect: true, allowed_executor: 'human_only' },
  }))
  assert.equal(result.ok, true)
  assert.equal(result.data.status, 'blocked')
})

test('バリデーション失敗は ok: false', () => {
  const result = createAction(validInput({ type: '' }))
  assert.equal(result.ok, false)
  assert.ok(result.errors.length > 0)
})

test('作成された Action は入力と独立（shallow copy）', () => {
  const input = validInput()
  const result = createAction(input)
  assert.equal(result.ok, true)
  input.actor.display_name = '変更'
  assert.equal(result.data.actor.display_name, '三谷')
})

// ── serialize / deserialize ─────────────────────────────────────────────────

test('serializeAction は整形済み JSON を返す', () => {
  const result = createAction(validInput())
  const json = serializeAction(result.data)
  assert.ok(json.includes('"type"'))
  assert.ok(json.includes('\n'))
})

test('deserializeAction は有効な JSON をパースする', () => {
  const result = createAction(validInput())
  const json = serializeAction(result.data)
  const parsed = deserializeAction(json)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.id, result.data.id)
})

test('deserializeAction は不正な JSON で ok: false', () => {
  const result = deserializeAction('not json')
  assert.equal(result.ok, false)
})

test('deserializeAction は id/type 欠損で ok: false', () => {
  const result = deserializeAction('{"foo": "bar"}')
  assert.equal(result.ok, false)
})

// ── P1: EXTERNAL_EFFECT_TYPES がサーバー側で強制される ─────────────────────

test('media.draft は EXTERNAL_EFFECT_TYPES で作成時 blocked', () => {
  assert.equal(shouldBlockOnCreate(validInput({ type: 'media.draft' })), true)
})

test('deploy.observe は EXTERNAL_EFFECT_TYPES で作成時 blocked', () => {
  assert.equal(shouldBlockOnCreate(validInput({ type: 'deploy.observe' })), true)
})

test('EXTERNAL_EFFECT_TYPES の type で external_effect:false を申告するとバリデーションエラー', () => {
  const result = validateActionInput(validInput({
    type: 'media.draft',
    safety: {
      risk_level: 'low',
      requires_human: false,
      external_effect: false,
      production_effect: false,
      allowed_executor: 'none',
    },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('外部効果')))
})

// ── P2: path traversal 防止 ─────────────────────────────────────────────────

test('path traversal (../) はエラー', () => {
  const result = validateActionInput(validInput({
    target: { kind: 'post', id: 'x', path: 'content/posts/../../tmp/out.md' },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('allowlist')))
})

test('absolute path はエラー', () => {
  const result = validateActionInput(validInput({
    target: { kind: 'post', id: 'x', path: '/etc/passwd' },
  }))
  assert.equal(result.valid, false)
})

test('backslash path はエラー', () => {
  const result = validateActionInput(validInput({
    target: { kind: 'post', id: 'x', path: 'content\\posts\\test.md' },
  }))
  assert.equal(result.valid, false)
})

test('NUL byte path はエラー', () => {
  const result = validateActionInput(validInput({
    target: { kind: 'post', id: 'x', path: 'content/posts/test.md\0.exe' },
  }))
  assert.equal(result.valid, false)
})

// ── P2: enum runtime 検証 ───────────────────────────────────────────────────

test('不正な type はエラー', () => {
  const result = validateActionInput(validInput({ type: 'evil.type' }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('type')))
})

test('不正な channel はエラー', () => {
  const result = validateActionInput(validInput({ channel: 'tiktok' }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('channel')))
})

test('不正な origin_surface はエラー', () => {
  const result = validateActionInput(validInput({ origin_surface: 'evil' }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('origin_surface')))
})

test('不正な safety.risk_level はエラー', () => {
  const result = validateActionInput(validInput({
    safety: {
      risk_level: 'ultra',
      requires_human: true,
      external_effect: false,
      production_effect: true,
      allowed_executor: 'local_mitani',
    },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('risk_level')))
})

test('safety.requires_human が boolean でなければエラー', () => {
  const result = validateActionInput(validInput({
    safety: {
      risk_level: 'high',
      requires_human: 'yes',
      external_effect: false,
      production_effect: false,
      allowed_executor: 'local_mitani',
    },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('boolean')))
})
