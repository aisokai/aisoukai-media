// media-queue.mjs
// Media Automation Core v1 の共通モジュール。
// 固定enum / gate_policy表引き / status遷移表 / redact / JSONLログ。
//
// 設計正本:
//   docs/media-automation-system-plan.md
//   docs/media-automation-human-gate.md
//
// 安全原則:
//   - 投稿可否・返信可否は AI が判断しない。config/media-gate.json の表引きのみ。
//   - 不明な type / channel / risk は安全側 (human_gate) に倒す。
//   - 外部送信処理はこのモジュールに存在しない。
//   - 秘密値はログ・JSONに出さない (redactSecrets を必ず通す)。

import {
  appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(__dirname, '..', '..')
export const MEDIA_QUEUE_DIR = join(ROOT, 'content', 'media-queue')
export const GATE_CONFIG_PATH = join(ROOT, 'config', 'media-gate.json')
export const MEDIA_LOG_PATH = join(ROOT, 'logs', 'media-automation.jsonl')

// ── 固定enum（AIによる新値発明は validator が拒否する） ──────────────────

export const JOB_TYPES = Object.freeze([
  'blog_article',
  'sns_repurpose',
  'gmb_update',
  'gmb_emergency_notice',
  'gmb_campaign',
  'temporary_closure_notice',
  'schedule_change_notice',
  'review_reply',
  'internal_notice',
  'lineworks_instruction',
  'telegram_instruction',
])

export const TARGET_CHANNELS = Object.freeze([
  'blog',
  'instagram',
  'x',
  'line_official',
  'gmb',
  'website_notice',
  'internal_print',
  'lineworks_internal',
  'telegram_internal',
  'obsidian',
])

export const JOB_STATUSES = Object.freeze([
  'draft_requested',
  'draft_generated',
  'review_pending',
  'approved',
  'rejected',
  'scheduled',
  'executed',
  'failed',
  'archived',
  'human_required',
])

export const RISK_LEVELS = Object.freeze(['low', 'medium', 'high'])

export const GATE_POLICIES = Object.freeze([
  'auto',
  'auto_after_notify',
  'auto_when_enabled',
  'human_gate',
  'forbidden',
])

export const JOB_SOURCES = Object.freeze([
  'telegram', 'lineworks', 'cron', 'blog', 'manual', 'watcher',
])

// gate_policy の厳しさ順（大きいほど厳しい）。job単位のgateは全channelの最厳値。
const GATE_SEVERITY = Object.freeze({
  auto: 0,
  auto_after_notify: 1,
  auto_when_enabled: 2,
  human_gate: 3,
  forbidden: 4,
})

// status遷移の固定表。表にない遷移は validator がエラーにする。
export const STATUS_TRANSITIONS = Object.freeze({
  draft_requested: ['draft_generated', 'failed', 'archived'],
  draft_generated: ['review_pending', 'approved', 'human_required', 'failed', 'archived'],
  review_pending: ['approved', 'rejected', 'human_required', 'failed', 'archived'],
  approved: ['scheduled', 'executed', 'failed', 'archived'],
  rejected: ['draft_requested', 'archived'],
  scheduled: ['executed', 'failed', 'archived'],
  executed: ['archived'],
  failed: ['draft_requested', 'scheduled', 'human_required', 'archived'],
  human_required: ['approved', 'rejected', 'archived'],
  archived: [],
})

// queue item で更新してよいフィールド。それ以外は生成後 immutable。
export const MUTABLE_FIELDS = Object.freeze([
  'status', 'updated_at', 'approved_by', 'approved_at',
  'executed_at', 'external_result', 'error', 'retry_count',
])

export const REQUIRED_JOB_FIELDS = Object.freeze([
  'id', 'type', 'source', 'source_text', 'target_channels', 'status',
  'risk_level', 'gate_policy', 'created_at', 'updated_at',
])

export const MAX_RETRY = 3

// ── 時刻・ID ──────────────────────────────────────────────────────────────

export function getJstTimestamp() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00')
}

export function getTodayJst() {
  return getJstTimestamp().slice(0, 10)
}

export function generateJobId(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000).toISOString()
  const stamp = jst.slice(0, 19).replace(/[-:T]/g, '')
  const rand = Math.random().toString(36).slice(2, 6)
  return `mj-${stamp.slice(0, 8)}-${stamp.slice(8)}-${rand}`
}

// ── 秘密値redact / 個人情報マスク ────────────────────────────────────────

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /AIza[A-Za-z0-9_-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._-]{8,}/g,
  /(token|secret|api[_-]?key|password|credential)\s*[=:]\s*[^\s"',}]{6,}/gi,
  /[A-Za-z0-9+/]{40,}={0,2}/g,
]

export function redactSecrets(text) {
  if (typeof text !== 'string') return text
  let out = text
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]')
  return out
}

// 秘密値らしき文字列の検出 (validator用)。検出したら validation fail にする。
export function containsSecrets(text) {
  if (typeof text !== 'string') return false
  return SECRET_PATTERNS.some((re) => new RegExp(re.source, re.flags.replace('g', '')).test(text))
}

const PERSONAL_INFO_PATTERNS = [
  /0\d{1,4}[-(]?\d{1,4}[-)]?\d{3,4}/g,            // 電話番号
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // メール
  /\d{4}年\s?\d{1,2}月\s?\d{1,2}日/g,              // 具体的な日付
]

export function maskPersonalInfo(text) {
  if (typeof text !== 'string') return ''
  let out = text
  for (const re of PERSONAL_INFO_PATTERNS) out = out.replace(re, '[マスク]')
  return out.length > 120 ? `${out.slice(0, 120)}…` : out
}

export function containsPersonalInfo(text) {
  if (typeof text !== 'string') return false
  return PERSONAL_INFO_PATTERNS.some((re) => new RegExp(re.source).test(text))
}

// ── gate config ───────────────────────────────────────────────────────────

export function loadGateConfig(path = GATE_CONFIG_PATH) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

// type × channel × risk_level → gate_policy。
// 安全側ルール:
//   - config なし → human_gate
//   - 不明な type / channel → human_gate
//   - risk high → 最低でも human_gate
//   - 表に無い組み合わせ → fallback (human_gate)
export function resolveGatePolicy({ type, channel, riskLevel = 'low', config = loadGateConfig() }) {
  if (!config) return 'human_gate'
  if (!JOB_TYPES.includes(type)) return 'human_gate'
  if (!TARGET_CHANNELS.includes(channel)) return 'human_gate'
  const fallback = GATE_POLICIES.includes(config.fallback) ? config.fallback : 'human_gate'
  let policy = config.gate_table?.[type]?.[channel] ?? fallback
  if (!GATE_POLICIES.includes(policy)) policy = 'human_gate'
  if (!RISK_LEVELS.includes(riskLevel) || riskLevel === 'high') {
    if (GATE_SEVERITY[policy] < GATE_SEVERITY.human_gate) policy = 'human_gate'
  }
  return policy
}

// auto_when_enabled の実効判定。flag が無い / false なら human_gate に倒す。
// variant により同一 type:channel 内の細分化を許す
// (例: review_reply:gmb:template_only と review_reply:gmb:normal を別flagで解禁)。
export function effectiveGatePolicy({ type, channel, policy, variant = null, config = loadGateConfig() }) {
  if (policy !== 'auto_when_enabled') return policy
  const flags = config?.flags ?? {}
  const bindings = (variant ? config?.flag_bindings?.[`${type}:${channel}:${variant}`] : undefined)
    ?? config?.flag_bindings?.[`${type}:${channel}`]
    ?? []
  const enabled = bindings.length > 0 && bindings.every((f) => flags[f] === true)
  return enabled ? 'auto_after_notify' : 'human_gate'
}

export function strictestGatePolicy(policies) {
  let strictest = 'auto'
  for (const p of policies) {
    const policy = GATE_POLICIES.includes(p) ? p : 'human_gate'
    if (GATE_SEVERITY[policy] > GATE_SEVERITY[strictest]) strictest = policy
  }
  return policies.length === 0 ? 'human_gate' : strictest
}

// ── job 生成・検証・保存 ──────────────────────────────────────────────────

export function createJob({
  type, source, sourceText, targetChannels, riskLevel = 'low', outputPaths = [], config = loadGateConfig(),
}) {
  const now = getJstTimestamp()
  const channels = Array.isArray(targetChannels) ? targetChannels : []
  const gateByChannel = {}
  for (const channel of channels) {
    gateByChannel[channel] = resolveGatePolicy({ type, channel, riskLevel, config })
  }
  return {
    id: generateJobId(),
    type,
    source,
    source_text: redactSecrets(String(sourceText ?? '')),
    target_channels: channels,
    status: 'draft_requested',
    risk_level: riskLevel,
    gate_policy: strictestGatePolicy(Object.values(gateByChannel)),
    gate_by_channel: gateByChannel,
    created_at: now,
    updated_at: now,
    approved_by: null,
    approved_at: null,
    executed_at: null,
    output_paths: outputPaths,
    external_result: null,
    error: null,
    retry_count: 0,
  }
}

export function validateJob(job, { config = loadGateConfig() } = {}) {
  const errors = []
  const warnings = []
  if (!job || typeof job !== 'object') return { errors: ['job がオブジェクトではありません'], warnings }

  for (const field of REQUIRED_JOB_FIELDS) {
    if (job[field] === undefined || job[field] === null) errors.push(`${field} がありません`)
  }
  if (job.type !== undefined && !JOB_TYPES.includes(job.type)) {
    errors.push(`type が固定enum外です: "${job.type}"`)
  }
  if (job.source !== undefined && !JOB_SOURCES.includes(job.source)) {
    errors.push(`source が固定enum外です: "${job.source}"`)
  }
  if (job.status !== undefined && !JOB_STATUSES.includes(job.status)) {
    errors.push(`status が固定enum外です: "${job.status}"`)
  }
  if (job.risk_level !== undefined && !RISK_LEVELS.includes(job.risk_level)) {
    errors.push(`risk_level が固定enum外です: "${job.risk_level}"`)
  }
  if (job.gate_policy !== undefined && !GATE_POLICIES.includes(job.gate_policy)) {
    errors.push(`gate_policy が固定enum外です: "${job.gate_policy}"`)
  }
  if (Array.isArray(job.target_channels)) {
    if (job.target_channels.length === 0) errors.push('target_channels が空です')
    for (const channel of job.target_channels) {
      if (!TARGET_CHANNELS.includes(channel)) errors.push(`target_channel が固定enum外です: "${channel}"`)
    }
  } else if (job.target_channels !== undefined) {
    errors.push('target_channels が配列ではありません')
  }
  if (typeof job.retry_count === 'number' && job.retry_count > MAX_RETRY) {
    warnings.push(`retry_count が上限 ${MAX_RETRY} を超えています → human_required にすべきです`)
  }

  // gate_policy が表引き結果より緩くなっていないか検証（AIによる緩和を拒否）
  if (
    errors.length === 0 && config &&
    Array.isArray(job.target_channels) && job.target_channels.length > 0
  ) {
    const expected = strictestGatePolicy(job.target_channels.map((channel) =>
      resolveGatePolicy({ type: job.type, channel, riskLevel: job.risk_level, config }),
    ))
    if (GATE_SEVERITY[job.gate_policy] < GATE_SEVERITY[expected]) {
      errors.push(`gate_policy (${job.gate_policy}) が表引き結果 (${expected}) より緩く設定されています`)
    }
  }

  // 秘密値らしき文字列の混入チェック
  const serialized = JSON.stringify(job)
  if (serialized !== JSON.stringify(JSON.parse(redactSecrets(serialized)))) {
    errors.push('job に秘密値らしき文字列が含まれています (redact してください)')
  }

  return { errors, warnings }
}

export function assertValidTransition(fromStatus, toStatus) {
  const allowed = STATUS_TRANSITIONS[fromStatus]
  if (!allowed) throw new Error(`不明なstatusです: "${fromStatus}"`)
  if (!allowed.includes(toStatus)) {
    throw new Error(`status遷移が固定表にありません: ${fromStatus} → ${toStatus}`)
  }
}

export function transitionJob(job, toStatus, extra = {}) {
  assertValidTransition(job.status, toStatus)
  const updated = { ...job, status: toStatus, updated_at: getJstTimestamp() }
  for (const [key, value] of Object.entries(extra)) {
    if (!MUTABLE_FIELDS.includes(key)) {
      throw new Error(`immutableフィールドは更新できません: "${key}"`)
    }
    updated[key] = key === 'external_result' || key === 'error'
      ? JSON.parse(redactSecrets(JSON.stringify(value)))
      : value
  }
  return updated
}

export function jobPath(id, dir = MEDIA_QUEUE_DIR) {
  return join(dir, `${id}.json`)
}

// 保存。既存fileがある場合は immutable フィールドの変更を拒否する。
export function saveJob(job, { dir = MEDIA_QUEUE_DIR, logPath = MEDIA_LOG_PATH } = {}) {
  mkdirSync(dir, { recursive: true })
  const path = jobPath(job.id, dir)
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, 'utf8'))
    for (const key of Object.keys(existing)) {
      if (MUTABLE_FIELDS.includes(key)) continue
      if (JSON.stringify(existing[key]) !== JSON.stringify(job[key])) {
        throw new Error(`immutableフィールドが変更されています: "${key}" (job ${job.id})`)
      }
    }
  }
  writeFileSync(path, `${JSON.stringify(job, null, 2)}\n`)
  appendMediaLog({ event: 'job_saved', job_id: job.id, type: job.type, status: job.status }, logPath)
  return path
}

export function listJobs({ dir = MEDIA_QUEUE_DIR, status, type } = {}) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith('mj-') && f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .filter((job) => (!status || job.status === status) && (!type || job.type === type))
}

// ── append-only イベントログ ─────────────────────────────────────────────

export function appendMediaLog(event, logPath = MEDIA_LOG_PATH) {
  mkdirSync(dirname(logPath), { recursive: true })
  const entry = { ts: getJstTimestamp(), ...event }
  appendFileSync(logPath, `${redactSecrets(JSON.stringify(entry))}\n`)
}

// ── 医療広告ガイドライン警告（ブロッカーではない） ───────────────────────

export const MEDICAL_AD_WARNING_KEYWORDS = Object.freeze([
  '必ず治', '完全に治', '絶対', '無痛', '最新の', '日本一', 'No.1', '確実に治', '保証',
])

export function detectMedicalAdWarnings(text) {
  if (typeof text !== 'string') return []
  return MEDICAL_AD_WARNING_KEYWORDS
    .filter((kw) => text.includes(kw))
    .map((kw) => `医療広告ガイドライン警告: "${kw}" を含みます (レビュー推奨・ブロッカーではありません)`)
}
