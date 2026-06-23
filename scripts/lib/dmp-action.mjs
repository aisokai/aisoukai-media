// scripts/lib/dmp-action.mjs
//
// DMP Action envelope ヘルパー（Phase2 / ESM）。
//
// mitanios-gui の src/dmp/action.ts と同一語彙・同一制約を ESM 側で再現する。
// Phase2 では create / validate / serialize のみ。
// ファイル書き込み・Git操作・外部通信なし。
//
// 将来 Phase3 で data/dmp/actions/ への書き込みを追加する。

// ── 定数 ────────────────────────────────────────────────────────────────────

export const ACTION_TYPES = Object.freeze([
  'content.create_request',
  'content.generate_draft',
  'content.review.approve',
  'content.review.return',
  'content.review.request_revision',
  'content.review.hold',
  'content.edit_markdown',
  'content.archive',
  'content.restore',
  'content.mark_delete_candidate',
  'content.delete_physical',
  'image.upload_inbox',
  'image.ingest',
  'image.assign',
  'image.replace_request',
  'repo.validate',
  'repo.build',
  'repo.commit_local',
  'repo.push_request',
  'deploy.observe',
  'media.draft',
  'media.approve',
])

export const ACTION_STATUSES = Object.freeze([
  'draft',
  'pending',
  'validated',
  'waiting_human',
  'ready_for_local_execution',
  'executing',
  'done',
  'failed',
  'cancelled',
  'blocked',
])

export const CHANNELS = Object.freeze([
  'blog', 'gmb', 'instagram', 'x', 'facebook', 'youtube', 'image', 'system',
])

export const ORIGIN_SURFACES = Object.freeze([
  'mitanios_dmp', 'aisoukai_admin', 'telegram', 'cli', 'scheduler',
])

export const PHASE2_BLOCKED_TYPES = Object.freeze(new Set([
  'repo.push_request',
  'media.approve',
  'content.delete_physical',
]))

export const EXTERNAL_EFFECT_TYPES = Object.freeze(new Set([
  'repo.push_request',
  'media.approve',
  'media.draft',
  'deploy.observe',
]))

export const VALID_TRANSITIONS = Object.freeze({
  draft: ['pending', 'cancelled'],
  pending: ['validated', 'failed', 'cancelled'],
  validated: ['waiting_human', 'ready_for_local_execution', 'cancelled'],
  waiting_human: ['ready_for_local_execution', 'cancelled', 'blocked'],
  ready_for_local_execution: ['executing', 'cancelled'],
  executing: ['done', 'failed'],
  done: [],
  failed: ['pending'],
  cancelled: [],
  blocked: ['pending', 'cancelled'],
})

const ALLOWED_PATH_PREFIXES = [
  'content/posts/',
  'content/drafts/',
  'data/',
  'public/images/library/',
  'scripts/',
]

const SECRETS_PATTERNS = [
  /\.env\b/i,
  /credentials?\b/i,
  /secret/i,
  /token[_\s]?key/i,
  /private[_\s]?key/i,
  /api[_\s]?key/i,
  /password/i,
  /ssh[_\s]?key/i,
  /keychain/i,
  /service[_\s]?account/i,
]

// ── バリデーション ──────────────────────────────────────────────────────────

function containsSecrets(obj) {
  const json = JSON.stringify(obj)
  return SECRETS_PATTERNS.some((p) => p.test(json))
}

function normalizePath(path) {
  if (path.includes('\0')) return null
  if (/\\/.test(path)) return null
  if (path.startsWith('/')) return null
  const parts = path.split('/')
  const resolved = []
  for (const part of parts) {
    if (part === '..') return null
    if (part === '.' || part === '') continue
    resolved.push(part)
  }
  return resolved.join('/')
}

function isAllowedPath(path) {
  const normalized = normalizePath(path)
  if (normalized === null) return false
  return ALLOWED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

const VALID_ACTION_TYPES_SET = new Set(ACTION_TYPES)
const VALID_CHANNELS_SET = new Set(CHANNELS)
const VALID_ORIGINS_SET = new Set(ORIGIN_SURFACES)
const VALID_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical'])
const VALID_EXECUTORS = new Set(['none', 'local_mitani', 'github_api', 'human_only'])
const VALID_ACTOR_KINDS = new Set(['human', 'system', 'agent'])
const VALID_TARGET_KINDS = new Set(['post', 'image', 'media_draft', 'repo', 'system'])

/**
 * Action 作成入力のバリデーション。
 * @param {object} input
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateActionInput(input) {
  const errors = []

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['入力がオブジェクトではありません'] }
  }

  if (!input.type) errors.push('type は必須です')
  else if (!VALID_ACTION_TYPES_SET.has(input.type)) errors.push(`type が不正です: ${input.type}`)

  if (!input.channel) errors.push('channel は必須です')
  else if (!VALID_CHANNELS_SET.has(input.channel)) errors.push(`channel が不正です: ${input.channel}`)

  if (!input.origin_surface) errors.push('origin_surface は必須です')
  else if (!VALID_ORIGINS_SET.has(input.origin_surface)) errors.push(`origin_surface が不正です: ${input.origin_surface}`)

  if (!input.actor?.kind) errors.push('actor.kind は必須です')
  else if (!VALID_ACTOR_KINDS.has(input.actor.kind)) errors.push(`actor.kind が不正です: ${input.actor.kind}`)

  if (!input.actor?.display_name) errors.push('actor.display_name は必須です')

  if (!input.target?.kind) errors.push('target.kind は必須です')
  else if (!VALID_TARGET_KINDS.has(input.target.kind)) errors.push(`target.kind が不正です: ${input.target.kind}`)

  if (!input.target?.id) errors.push('target.id は必須です')

  if (!input.git?.repo) errors.push('git.repo は必須です')
  if (!input.git?.base_ref) errors.push('git.base_ref は必須です')

  if (!input.safety) {
    errors.push('safety は必須です')
  } else {
    if (typeof input.safety.requires_human !== 'boolean') errors.push('safety.requires_human は boolean 必須です')
    if (typeof input.safety.external_effect !== 'boolean') errors.push('safety.external_effect は boolean 必須です')
    if (typeof input.safety.production_effect !== 'boolean') errors.push('safety.production_effect は boolean 必須です')
    if (!VALID_RISK_LEVELS.has(input.safety.risk_level)) errors.push(`safety.risk_level が不正です: ${input.safety.risk_level}`)
    if (!VALID_EXECUTORS.has(input.safety.allowed_executor)) errors.push(`safety.allowed_executor が不正です: ${input.safety.allowed_executor}`)
    if (input.safety.production_effect && !input.safety.requires_human) {
      errors.push('production_effect: true の場合 requires_human: true が必須です')
    }
    if (input.type && EXTERNAL_EFFECT_TYPES.has(input.type) && !input.safety.external_effect) {
      errors.push(`${input.type} は外部効果を持つため safety.external_effect: true が必須です`)
    }
  }

  if (input.target?.path && !isAllowedPath(input.target.path)) {
    errors.push(`target.path が allowlist 外です: ${input.target.path}`)
  }

  if (input.payload && containsSecrets(input.payload)) {
    errors.push('payload に secrets パターンが検出されました')
  }

  if (input.target && containsSecrets(input.target)) {
    errors.push('target に secrets パターンが検出されました')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 作成時に blocked にすべきかを判定する。
 * @param {object} input
 * @returns {boolean}
 */
export function shouldBlockOnCreate(input) {
  if (PHASE2_BLOCKED_TYPES.has(input.type)) return true
  if (input.safety?.external_effect) return true
  if (EXTERNAL_EFFECT_TYPES.has(input.type)) return true
  return false
}

// ── Action 作成 ─────────────────────────────────────────────────────────────

let counter = 0

/**
 * Action envelope を作成する（インメモリ）。
 * @param {object} input
 * @returns {{ ok: boolean, data?: object, errors?: string[] }}
 */
export function createAction(input) {
  const validation = validateActionInput(input)
  if (!validation.valid) {
    return { ok: false, errors: validation.errors }
  }

  counter += 1
  const id = `act-${Date.now().toString(36)}-${counter.toString(36).padStart(4, '0')}`
  const timestamp = new Date().toISOString()
  const initialStatus = shouldBlockOnCreate(input) ? 'blocked' : 'pending'

  const action = {
    id,
    type: input.type,
    channel: input.channel,
    origin_surface: input.origin_surface,
    actor: { ...input.actor },
    target: { ...input.target },
    requested_transition: input.requested_transition ?? '',
    payload: { ...(input.payload ?? {}) },
    safety: { ...input.safety },
    git: { ...input.git },
    status: initialStatus,
    audit: [
      {
        timestamp,
        actor: input.actor.display_name,
        from_status: 'draft',
        to_status: initialStatus,
        note: initialStatus === 'blocked'
          ? `Phase2: ${input.type} は自動 blocked`
          : 'Action 作成',
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
    dedupe_key: input.dedupe_key ?? undefined,
  }

  return { ok: true, data: action }
}

// ── シリアライズ ────────────────────────────────────────────────────────────

/**
 * Action を JSON 文字列にシリアライズする。
 * @param {object} action
 * @returns {string}
 */
export function serializeAction(action) {
  return JSON.stringify(action, null, 2)
}

/**
 * JSON 文字列から Action をデシリアライズする。
 * @param {string} json
 * @returns {{ ok: boolean, data?: object, errors?: string[] }}
 */
export function deserializeAction(json) {
  try {
    const data = JSON.parse(json)
    if (!data || typeof data !== 'object' || !data.id || !data.type) {
      return { ok: false, errors: ['不正な Action JSON です'] }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, errors: [`JSON パースに失敗しました: ${err.message}`] }
  }
}
