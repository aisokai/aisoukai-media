// SNS AI 相互監視の第2層 (証拠照合・IOあり)。
// policy aisoukai-media-tiered-blog-sns-2026-11-06 / AGENTS.md の sns-mutual-review-20261106 節に対応する。
//
// - hash 算出 (sns-content-hash/v1) はこのファイルの computeSnsContentHash だけが行う。複製しないこと。
// - 証拠ログ・投稿監査ログは append-only。既存行を書き換える・削除する・並べ替えるコードはここに置かない。
// - 署名は使わない (サーバ側鍵の複製は Server authority amendment で禁止)。ハッシュチェーン + git 履歴で担保する。
// - この関数群は投稿を実行しない。外部送信・publish API は持たない。
// - media-gate のフラグ (sns_auto_suspend を含む) は読まない。「いま投稿してよいか」は実行主体が gate 判定で別途行う。
import { createHash, randomUUID } from 'node:crypto'
import {
  appendFileSync, closeSync, constants as fsConstants, existsSync, fstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, statSync, writeFileSync,
} from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import matter from 'gray-matter'
import {
  EXCEPTION_CATEGORIES,
  ROOT,
  MEDIA_ALLOWED_PREFIX,
  isAllowedMediaPath,
  normalizeDraftData,
  parseIdentity,
  readSnsDraftFile,
  toDateStr,
  validateSnsDraftData,
} from './sns-drafts.mjs'

export const HASH_ALGORITHM = 'sns-content-hash/v1'
export const SNS_REVIEW_DIR = join(ROOT, 'data', 'sns-review')
export const EVIDENCE_FILE = 'evidence.jsonl'
export const POSTING_AUDIT_FILE = 'posting-audit.jsonl'
export const EVIDENCE_RECORD_TYPE = 'sns_review_evidence'
export const POSTING_AUDIT_RECORD_TYPE = 'sns_posting_audit'
export const RECORD_VERSION = 1

// 運用初期値: 作成 = Claude 系統、レビュー = ChatGPT 系統。組み替えはこの定数の変更 + テスト追加で行う。
export const ALLOWED_REVIEW_PAIRS = Object.freeze([Object.freeze({ creator: 'claude', reviewer: 'chatgpt' })])

export const REVIEW_CHECK_KEYS = Object.freeze([
  'medical_ad',
  'facts',
  'exception_category',
  'brand_tone',
  'media_rights',
  'mixup_prevention',
  'flag_alignment',
])
export const REVIEW_DECISIONS = Object.freeze(['pass', 'changes_requested', 'escalate'])
export const DECISION_TO_STATE = Object.freeze({
  pass: 'passed',
  changes_requested: 'changes_requested',
  escalate: 'escalated',
})
export const POSTING_ACTIONS = Object.freeze(['post', 'patrol_check', 'delete', 'edit', 'escalate'])

const EVIDENCE_KEYS = [
  'record_id', 'record_type', 'version', 'recorded_at', 'draft_file', 'content_hash', 'hash_algorithm',
  'media_hashes', 'created_by', 'creator_system', 'reviewed_by', 'reviewer_system', 'decision', 'checks',
  'exception_category', 'policy_version', 'notes', 'prev_hash',
]
const POSTING_AUDIT_KEYS = [
  'record_id', 'record_type', 'version', 'recorded_at', 'draft_file', 'evidence_id', 'content_hash',
  'platform', 'action', 'post_id', 'post_url', 'result', 'detail', 'prev_hash',
]
const KEYS_BY_TYPE = {
  [EVIDENCE_RECORD_TYPE]: EVIDENCE_KEYS,
  [POSTING_AUDIT_RECORD_TYPE]: POSTING_AUDIT_KEYS,
}

export function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex')
}

// media-queue.mjs の getJstTimestamp() と同形式 (テストで時刻を固定できるよう now を受け取る)
export function getJstTimestamp(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00')
}

// ---- policy version (正本は AGENTS.md の Policy record。二重にハードコードしない) ----

export function readCurrentPolicyVersion(agentsPath = join(ROOT, 'AGENTS.md')) {
  const text = readFileSync(agentsPath, 'utf8')
  const match = text.match(/^- Policy version: `([^`]+)`/m)
  if (!match) throw new Error(`AGENTS.md の Policy record から Policy version を読み取れません: ${agentsPath}`)
  return match[1]
}

// ---- hash (sns-content-hash/v1) ----

export function normalizeBody(content) {
  return String(content ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, '') + '\n'
}

function isInside(root, full) {
  return full.startsWith(root + sep)
}

function checkMediaRealPath(root, real, relPath) {
  if (!isInside(root, real)) return `media_files の実体が repo 外を指しています: "${relPath}"`
  const relReal = real.slice(root.length + 1).split(sep).join('/')
  if (!isAllowedMediaPath(relReal)) return `media_files の実体が許可されないパスです (${MEDIA_ALLOWED_PREFIX} 配下のみ): "${relPath}"`
  return null
}

/**
 * メディアファイルを検査済みの実体に結び付けて読み込む (検査と読み込みの間の差し替え対策)。
 * 1. symlink 解決後の実体パスが許可領域 (public/images/) 内であることを確認
 * 2. 実体パスを O_NOFOLLOW で open し、descriptor が通常ファイルであることを確認
 * 3. open 後に実体パスを再解決し、パスが変わっていないこと・descriptor と同じファイル (dev/ino) であることを確認
 *    (親ディレクトリの差し替えで領域外の実体を開いた場合はここで不一致になる)
 * 4. 検証済み descriptor から読む
 * hooks.beforeOpen はテスト専用 (差し替えの競合を再現するため)。
 */
export function readMediaFileBound(rootDir, relPath, hooks = {}) {
  const root = realpathSync(resolve(rootDir))
  const full = resolve(root, relPath)
  if (!isInside(root, full)) return { error: `media_files が repo 外を指しています: "${relPath}"` }
  if (!existsSync(full)) return { error: `media_files のファイルが存在しません: ${relPath}` }
  const real = realpathSync(full)
  const before = checkMediaRealPath(root, real, relPath)
  if (before) return { error: before }
  hooks.beforeOpen?.(real)

  let fd
  try {
    fd = openSync(real, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  } catch (e) {
    return { error: `media_files を安全に開けません (${e.code ?? e.message}): ${relPath}` }
  }
  try {
    const opened = fstatSync(fd)
    if (!opened.isFile()) return { error: `media_files が通常ファイルではありません: ${relPath}` }
    let realAfter
    let current
    try {
      realAfter = realpathSync(real)
      current = statSync(realAfter)
    } catch {
      return { error: `media_files が読み込み中に変更されました: ${relPath}` }
    }
    const after = checkMediaRealPath(root, realAfter, relPath)
    if (after) return { error: after }
    if (realAfter !== real || current.dev !== opened.dev || current.ino !== opened.ino) {
      return { error: `media_files が検査後に差し替えられました: ${relPath}` }
    }
    return { bytes: readFileSync(fd) }
  } finally {
    closeSync(fd)
  }
}

// media_files の検査と hash 算出。欠落・不正パスは errors に積み、hash は算出しない。
export function collectMediaHashes(mediaFiles, rootDir = ROOT, hooks = {}) {
  const errors = []
  const list = mediaFiles === undefined || mediaFiles === null ? [] : mediaFiles
  if (!Array.isArray(list)) return { errors: ['media_files は配列である必要があります'], mediaHashes: null }
  const hashes = []
  for (const p of [...list].sort()) {
    if (!isAllowedMediaPath(p)) {
      errors.push(`media_files に不正なパスがあります (${MEDIA_ALLOWED_PREFIX} 配下の repo 相対パスのみ): "${p}"`)
      continue
    }
    const { bytes, error } = readMediaFileBound(rootDir, p, hooks)
    if (error) {
      errors.push(error)
      continue
    }
    hashes.push({ path: p, sha256: sha256Hex(bytes) })
  }
  return { errors, mediaHashes: errors.length > 0 ? null : hashes }
}

export function computeContentHashFromParts({ data, content, mediaHashes }) {
  const payload = {
    title: data.title ?? null,
    channel: data.channel ?? null,
    platform: data.platform ?? null,
    date: data.date === undefined || data.date === null ? null : toDateStr(data.date),
    source_topic_id: data.source_topic_id ?? null,
    body: normalizeBody(content),
    media: mediaHashes.map(({ path, sha256 }) => ({ path, sha256 })),
  }
  return sha256Hex(JSON.stringify(payload))
}

// 証拠記録時と投稿直前の照合の双方で使う唯一の算出関数。media が欠落していれば throw する。
export function computeSnsContentHash({ data, content, rootDir = ROOT }) {
  const { errors, mediaHashes } = collectMediaHashes(data.media_files, rootDir)
  if (errors.length > 0) throw new Error(errors.join(' / '))
  return { contentHash: computeContentHashFromParts({ data, content, mediaHashes }), mediaHashes }
}

// ---- JSONL / hash chain ----

function canonicalize(record, keys) {
  const out = {}
  for (const key of keys) out[key] = record[key] === undefined ? null : record[key]
  return out
}

function canonicalChecks(checks) {
  const out = {}
  for (const key of REVIEW_CHECK_KEYS) out[key] = checks?.[key]
  return out
}

export function computeRecordHash(record) {
  const keys = KEYS_BY_TYPE[record.record_type]
  if (!keys) throw new Error(`record_type が無効です: "${record.record_type}"`)
  const body = canonicalize(record, keys)
  if (record.record_type === EVIDENCE_RECORD_TYPE) {
    body.checks = canonicalChecks(record.checks)
    body.media_hashes = (record.media_hashes ?? []).map(({ path, sha256 }) => ({ path, sha256 }))
  }
  return sha256Hex(JSON.stringify(body))
}

export function serializeRecord(record) {
  const keys = KEYS_BY_TYPE[record.record_type]
  const body = canonicalize(record, keys)
  if (record.record_type === EVIDENCE_RECORD_TYPE) {
    body.checks = canonicalChecks(record.checks)
    body.media_hashes = (record.media_hashes ?? []).map(({ path, sha256 }) => ({ path, sha256 }))
  }
  return JSON.stringify({ ...body, record_hash: record.record_hash })
}

export function readJsonl(filePath) {
  if (!existsSync(filePath)) return { exists: false, records: [], errors: [] }
  const records = []
  const errors = []
  const lines = readFileSync(filePath, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (line === '' && i === lines.length - 1) return
    if (line.trim() === '') {
      errors.push(`${basename(filePath)}:${i + 1} 空行があります`)
      return
    }
    try {
      records.push(JSON.parse(line))
    } catch {
      errors.push(`${basename(filePath)}:${i + 1} JSON として読めません`)
    }
  })
  return { exists: true, records, errors }
}

// レコード形式の厳格検査。定義外キーは hash の対象外になるため、存在自体をエラーにする
export function validateRecordShape(record, expectedType) {
  const errors = []
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['レコードがオブジェクトではありません']
  const keys = KEYS_BY_TYPE[expectedType]
  const allowed = new Set([...keys, 'record_hash'])
  const unknown = Object.keys(record).filter((k) => !allowed.has(k))
  if (unknown.length > 0) errors.push(`定義外のキーがあります: ${unknown.join(', ')}`)
  const missing = [...allowed].filter((k) => !(k in record))
  if (missing.length > 0) errors.push(`キーが欠落しています: ${missing.join(', ')}`)
  if (record.version !== RECORD_VERSION) errors.push(`version が ${RECORD_VERSION} ではありません`)
  if (expectedType === EVIDENCE_RECORD_TYPE) {
    const checks = record.checks
    if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
      errors.push('checks がオブジェクトではありません')
    } else {
      const extra = Object.keys(checks).filter((k) => !REVIEW_CHECK_KEYS.includes(k))
      if (extra.length > 0) errors.push(`checks に定義外の項目があります: ${extra.join(', ')}`)
    }
    if (!Array.isArray(record.media_hashes)) {
      errors.push('media_hashes が配列ではありません')
    } else if (record.media_hashes.some((m) => !m || typeof m !== 'object'
      || Object.keys(m).length !== 2 || typeof m.path !== 'string' || typeof m.sha256 !== 'string')) {
      errors.push('media_hashes の要素が { path, sha256 } 形式ではありません')
    }
  }
  return errors
}

export function verifyChain(records, expectedType, label = expectedType) {
  const errors = []
  let prev = null
  records.forEach((record, i) => {
    const at = `${label} ${i + 1}行目`
    if (record?.record_type !== expectedType) {
      errors.push(`${at}: record_type が ${expectedType} ではありません`)
      prev = record?.record_hash ?? null
      return
    }
    for (const e of validateRecordShape(record, expectedType)) errors.push(`${at}: ${e}`)
    if (record.prev_hash !== prev) errors.push(`${at}: prev_hash が直前レコードの record_hash と一致しません (チェーン破損)`)
    let recomputed = null
    try {
      recomputed = computeRecordHash(record)
    } catch (e) {
      errors.push(`${at}: ${e.message}`)
    }
    if (recomputed !== null && recomputed !== record.record_hash) {
      errors.push(`${at}: record_hash が内容と一致しません (改竄の疑い)`)
    }
    prev = record.record_hash ?? null
  })
  return errors
}

export function loadLog(dir, file, recordType) {
  const path = join(dir, file)
  const { exists, records, errors } = readJsonl(path)
  return { path, exists, records, errors: [...errors, ...verifyChain(records, recordType, file)] }
}

// 追記専用。既存チェーンが壊れていれば追記しない。
function appendRecord(dir, file, recordType, fields, now) {
  const { records, errors } = loadLog(dir, file, recordType)
  if (errors.length > 0) throw new Error(`${file} のチェーンが壊れているため追記できません: ${errors.join(' / ')}`)
  const record = {
    ...fields,
    record_id: fields.record_id ?? randomUUID(),
    record_type: recordType,
    version: RECORD_VERSION,
    recorded_at: fields.recorded_at ?? getJstTimestamp(now),
    prev_hash: records.length > 0 ? records[records.length - 1].record_hash : null,
  }
  record.record_hash = computeRecordHash(record)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  appendFileSync(join(dir, file), serializeRecord(record) + '\n', 'utf8')
  return record
}

export function appendEvidenceRecord(fields, { evidenceDir = SNS_REVIEW_DIR, now = Date.now() } = {}) {
  return appendRecord(evidenceDir, EVIDENCE_FILE, EVIDENCE_RECORD_TYPE, fields, now)
}

export function appendPostingAuditRecord(fields, { evidenceDir = SNS_REVIEW_DIR, now = Date.now() } = {}) {
  if (!POSTING_ACTIONS.includes(fields.action)) throw new Error(`action が無効です: "${fields.action}"`)
  if (fields.action === 'post' && (!fields.post_id || !fields.post_url)) {
    throw new Error('action: post では post_id と post_url が必須です')
  }
  return appendRecord(evidenceDir, POSTING_AUDIT_FILE, POSTING_AUDIT_RECORD_TYPE, fields, now)
}

// ---- 証拠レコード自体の妥当性 ----

function validateChecks(checks, decision, errors) {
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
    errors.push('checks がありません')
    return
  }
  for (const key of REVIEW_CHECK_KEYS) {
    if (typeof checks[key] !== 'boolean') errors.push(`checks.${key} が boolean ではありません`)
  }
  if (decision === 'pass' && REVIEW_CHECK_KEYS.some((key) => checks[key] !== true)) {
    errors.push('decision: pass ですが checks に true でない項目があります')
  }
}

export function validateReviewPair(creatorSystem, reviewerSystem) {
  const errors = []
  if (creatorSystem && reviewerSystem && creatorSystem === reviewerSystem) {
    errors.push(`作成とレビューが同一系統です (${creatorSystem})`)
  }
  if (!ALLOWED_REVIEW_PAIRS.some((p) => p.creator === creatorSystem && p.reviewer === reviewerSystem)) {
    errors.push(`許可されていない作成/レビューの組み合わせです (${creatorSystem} → ${reviewerSystem})`)
  }
  return errors
}

// ---- 第2層: 照合 ----

/**
 * 第2層の照合 (証拠の存在 / hash 一致 / 系統分離 / ペア固定 / decision-state 対応 / checks /
 * policy_version / チェーン / 投稿済み監査 / メディア実在) を行う。
 * publishable は「証拠と内容が一致し state: passed である」ことだけを意味する。
 * フラグ ON・suspend 非該当の判定は含まない (実行主体が gate 判定で別途行う)。
 */
export function verifySnsPublishable(draftPath, {
  evidenceDir = SNS_REVIEW_DIR,
  rootDir = ROOT,
  policyVersion,
  agentsPath,
} = {}) {
  const draft = readSnsDraftFile(draftPath)
  const errors = []
  const { data, content, file } = draft

  const layer1 = validateSnsDraftData(file, data, content)
  errors.push(...layer1.errors)

  if (data.publish_mode !== 'ai_mutual_review') {
    return { file, errors, publishable: false, skipped: true }
  }
  const review = data.mutual_review ?? {}
  const state = review.state
  const evidenceLog = loadLog(evidenceDir, EVIDENCE_FILE, EVIDENCE_RECORD_TYPE)
  // 証拠追記後に frontmatter 更新が失敗した状態 (未反映の証拠) を検出する。
  // このドラフトの証拠のうち最新のものが、frontmatter の evidence_id と一致しなければならない
  const ownRecords = evidenceLog.records.filter((r) => r?.draft_file === file)
  const latest = ownRecords[ownRecords.length - 1]
  if (state === 'pending' || state === undefined) {
    if (latest) {
      errors.push(`state: pending ですが証拠ログにこのドラフトの証拠 (${latest.record_id}) があります (frontmatter への未反映)`)
    }
    return { file, errors, publishable: false, skipped: errors.length === 0 }
  }
  if (latest && latest.record_id !== review.evidence_id) {
    errors.push(`このドラフトの最新の証拠 (${latest.record_id}) が mutual_review.evidence_id と一致しません (frontmatter への未反映)`)
  }

  // 10. メディアの実在 (hash 再計算の前提)
  const media = collectMediaHashes(data.media_files, rootDir)
  errors.push(...media.errors)

  if (!evidenceLog.exists) {
    errors.push(`証拠ログ ${EVIDENCE_FILE} がありません (state: ${state} を裏付ける証拠がない)`)
    return { file, errors, publishable: false, skipped: false }
  }
  // 8. チェーン検証
  errors.push(...evidenceLog.errors)

  // 1. 証拠の存在
  const matches = evidenceLog.records.filter((r) => r?.record_id === review.evidence_id)
  if (matches.length !== 1) {
    errors.push(matches.length === 0
      ? `evidence_id ${review.evidence_id} の証拠レコードがありません`
      : `evidence_id ${review.evidence_id} の証拠レコードが複数あります`)
    return { file, errors, publishable: false, skipped: false }
  }
  const evidence = matches[0]

  if (evidence.draft_file !== file) errors.push(`証拠レコードの draft_file (${evidence.draft_file}) が対象ドラフトと一致しません`)
  if (evidence.hash_algorithm !== HASH_ALGORITHM) errors.push(`hash_algorithm が ${HASH_ALGORITHM} ではありません`)
  if (evidence.created_by !== data.created_by) errors.push('証拠レコードの created_by がドラフトと一致しません')
  if (evidence.reviewed_by !== review.reviewed_by) errors.push('証拠レコードの reviewed_by がドラフトと一致しません')

  // 2. hash 一致
  if (media.mediaHashes) {
    const current = computeContentHashFromParts({ data, content, mediaHashes: media.mediaHashes })
    if (current !== review.content_hash) errors.push('現在のコンテンツ hash が mutual_review.content_hash と一致しません (レビュー後に内容が変更された)')
    if (current !== evidence.content_hash) errors.push('現在のコンテンツ hash が証拠レコードの content_hash と一致しません')
  }

  // 3-4. 系統の分離・初期ペア固定 (記録された system と identity の整合も確認)
  const creator = parseIdentity(evidence.created_by)
  const reviewer = parseIdentity(evidence.reviewed_by)
  if (!creator || creator.system !== evidence.creator_system) errors.push('証拠レコードの creator_system が created_by と一致しません')
  if (!reviewer || reviewer.system !== evidence.reviewer_system) errors.push('証拠レコードの reviewer_system が reviewed_by と一致しません')
  errors.push(...validateReviewPair(evidence.creator_system, evidence.reviewer_system))

  // 5. decision と state の対応
  if (DECISION_TO_STATE[evidence.decision] !== state) {
    errors.push(`証拠の decision (${evidence.decision}) と mutual_review.state (${state}) が対応しません`)
  }
  // 6. チェックリスト
  validateChecks(evidence.checks, evidence.decision, errors)
  if (evidence.decision === 'escalate') {
    if (!EXCEPTION_CATEGORIES.includes(evidence.exception_category)) errors.push('decision: escalate ですが証拠の exception_category がありません')
  } else if (evidence.exception_category !== null && evidence.exception_category !== undefined) {
    errors.push('decision が escalate 以外ですが証拠に exception_category があります')
  }

  // 7. policy_version
  let current
  try {
    current = policyVersion ?? readCurrentPolicyVersion(agentsPath)
  } catch (e) {
    errors.push(e.message)
  }
  if (current !== undefined && evidence.policy_version !== current) {
    errors.push(`証拠の policy_version (${evidence.policy_version}) が現行 (${current}) と一致しません`)
  }

  // 9. 投稿済みの監査
  if (data.status === 'posted') {
    const audit = loadLog(evidenceDir, POSTING_AUDIT_FILE, POSTING_AUDIT_RECORD_TYPE)
    errors.push(...audit.errors)
    const posted = audit.records.some((r) => r?.draft_file === file && r.action === 'post'
      && r.result === 'success' && r.content_hash === review.content_hash)
    if (!posted) errors.push('status: posted ですが投稿監査ログに対応する post / success レコードがありません')
  }

  return { file, errors, publishable: errors.length === 0 && state === 'passed', skipped: false }
}

// ---- 証拠記録 (record-sns-review CLI の本体) ----

/**
 * レビュー結果を証拠ログへ追記し、その後ドラフトの frontmatter を更新する。
 * 順序は「証拠追記 → frontmatter 更新」。途中で失敗した場合は検証で不整合として検出される。
 */
export function recordSnsReview({
  draftPath,
  decision,
  reviewedBy,
  checks,
  exceptionCategory = null,
  notes = null,
  evidenceDir = SNS_REVIEW_DIR,
  rootDir = ROOT,
  policyVersion,
  agentsPath,
  now = Date.now(),
}) {
  if (!REVIEW_DECISIONS.includes(decision)) throw new Error(`decision が無効です: "${decision}" (許可値: ${REVIEW_DECISIONS.join(' / ')})`)
  const raw = readFileSync(draftPath, 'utf8')
  const parsed = matter(raw)
  const data = normalizeDraftData(parsed.data)
  const file = basename(draftPath)

  if (data.publish_mode !== 'ai_mutual_review') throw new Error('publish_mode: ai_mutual_review のドラフトのみ記録できます')
  const state = data.mutual_review?.state
  if (state !== 'pending' && state !== 'changes_requested') {
    throw new Error(`mutual_review.state が ${state} のドラフトには記録できません (対象: pending / changes_requested)`)
  }
  const layer1 = validateSnsDraftData(file, data, parsed.content)
  if (layer1.errors.length > 0) throw new Error(`ドラフトが構造検証を通りません: ${layer1.errors.join(' / ')}`)

  const creator = parseIdentity(data.created_by)
  const reviewer = parseIdentity(reviewedBy)
  if (!reviewer) throw new Error('reviewed_by は <system>:<run-id> 形式で指定してください')
  const pairErrors = validateReviewPair(creator.system, reviewer.system)
  if (pairErrors.length > 0) throw new Error(pairErrors.join(' / '))

  const checkErrors = []
  validateChecks(checks, decision, checkErrors)
  if (checkErrors.length > 0) throw new Error(checkErrors.join(' / '))
  if (decision === 'escalate' && !EXCEPTION_CATEGORIES.includes(exceptionCategory)) {
    throw new Error(`decision: escalate では exception_category が必須です (許可値: ${EXCEPTION_CATEGORIES.join(' / ')})`)
  }
  if (decision !== 'escalate' && exceptionCategory) throw new Error('exception_category は decision: escalate のときのみ指定できます')

  const { contentHash, mediaHashes } = computeSnsContentHash({ data, content: parsed.content, rootDir })
  const version = policyVersion ?? readCurrentPolicyVersion(agentsPath)

  const record = appendEvidenceRecord({
    draft_file: file,
    content_hash: contentHash,
    hash_algorithm: HASH_ALGORITHM,
    media_hashes: mediaHashes,
    created_by: data.created_by,
    creator_system: creator.system,
    reviewed_by: reviewedBy,
    reviewer_system: reviewer.system,
    decision,
    checks: canonicalChecks(checks),
    exception_category: decision === 'escalate' ? exceptionCategory : null,
    policy_version: version,
    notes: notes ?? null,
  }, { evidenceDir, now })

  const nextState = DECISION_TO_STATE[decision]
  const updated = {
    ...data,
    status: decision === 'pass' ? 'approved' : data.status,
    reviewed: true,
    reviewed_by: reviewedBy,
    reviewed_at: record.recorded_at,
    mutual_review: {
      state: nextState,
      content_hash: contentHash,
      evidence_id: record.record_id,
      reviewed_by: reviewedBy,
      reviewed_at: record.recorded_at,
      exception_category: decision === 'escalate' ? exceptionCategory : null,
    },
  }
  writeFileSync(draftPath, matter.stringify(parsed.content, updated))
  return { record, data: updated }
}
