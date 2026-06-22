// scripts/lib/dmp-core-state.mjs
//
// DMP Core 状態契約（Phase1 / 最小）。
//
// 目的:
//   MitaniOS DMP / aisoukai-media `/admin` / Telegram が、同じ語彙・同じ抽出条件で
//   記事のレビュー状態・公開状態・画像状態・Git/origin 反映状態を表示できるようにする。
//
// 方針:
//   - 既存の content-status / post-publication-status の分類ロジックを「正本」として再利用し、
//     その上に DMP Core 語彙への正規化アダプタだけを薄く重ねる（本文・画像はコピーしない）。
//   - 純粋関数中心。fs / git は読み取りのみ。push / 外部送信 / 破壊的操作は行わない。
//
// 設計根拠（mitanios-gui）:
//   docs/dmp-core-unified-state-design.md（記事レビュー状態モデル / 画像差し替え状態モデル）
//   docs/dmp-unified-roadmap.md（Phase1 最小スコープ）
//
// 注意:
//   MitaniOS DMP 側（TypeScript / vite.config.ts）は同じルールを mirror した
//   src/dmp/coreState.ts を持つ。両者は本ファイルと coreState.ts のテストで挙動を固定する。
//   将来 Phase2 の Action Store で実行時統一する（本 Phase では条件統一に留める）。

import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { getPostPublicationStatus, getTodayJst } from './post-publication-status.mjs'

// ── 語彙（YAML phase1_state_contract と一致）─────────────────────────────────

export const WORKFLOW_STATUS = Object.freeze({
  DRAFT: 'draft',
  REVIEW_WAITING: 'review_waiting',
  PUBLISH_WAITING: 'publish_waiting',
  PUBLISHED: 'published',
  BLOCKED: 'blocked',
  UNKNOWN: 'unknown',
})

export const REVIEW_STATUS = Object.freeze({
  REVIEW_WAITING: 'review_waiting',
  RETURNED: 'returned',
  APPROVED: 'approved',
  UNKNOWN: 'unknown',
})

export const IMAGE_STATUS = Object.freeze({
  OK: 'ok',
  MISSING_IMAGE: 'missing_image',
  MISSING_ALT: 'missing_alt',
  MISSING_FILE: 'missing_file',
  NOT_REQUIRED: 'not_required',
  UNKNOWN: 'unknown',
})

export const GIT_STATUS = Object.freeze({
  CLEAN: 'clean',
  MODIFIED: 'modified',
  UNTRACKED: 'untracked',
  LOCAL_ONLY: 'local_only',
  NEEDS_PUSH: 'needs_push',
  BEHIND_ORIGIN: 'behind_origin',
  DIVERGED: 'diverged',
  UNKNOWN: 'unknown',
})

const IMAGE_MISSING_STATUSES = new Set([
  IMAGE_STATUS.MISSING_IMAGE,
  IMAGE_STATUS.MISSING_ALT,
  IMAGE_STATUS.MISSING_FILE,
])

function isPlainData(data) {
  return data != null && typeof data === 'object'
}

// ── 記事レビュー状態 ─────────────────────────────────────────────────────────

/**
 * frontmatter から DMP Core の workflow_status を求める。
 * archived / 差し戻し(rejection_reason) は blocked、draft は draft、未承認は review_waiting、
 * 承認済みで公開可能なら published、承認済みだが未到来/未来なら publish_waiting。
 */
export function classifyWorkflowStatus(data, { today = getTodayJst() } = {}) {
  if (!isPlainData(data)) return WORKFLOW_STATUS.UNKNOWN
  if (data.archived === true) return WORKFLOW_STATUS.BLOCKED
  if (data.rejection_reason) return WORKFLOW_STATUS.BLOCKED // 差し戻し
  if (data.draft === true) return WORKFLOW_STATUS.DRAFT
  const pub = getPostPublicationStatus(data, { today })
  if (!pub.approved) return WORKFLOW_STATUS.REVIEW_WAITING
  if (pub.publishable) return WORKFLOW_STATUS.PUBLISHED
  return WORKFLOW_STATUS.PUBLISH_WAITING
}

/** Human レビュー観点の状態。差し戻し / 承認済み / 待ち を分離する。 */
export function classifyReviewStatus(data) {
  if (!isPlainData(data)) return REVIEW_STATUS.UNKNOWN
  if (data.rejection_reason) return REVIEW_STATUS.RETURNED
  if (data.reviewed === true) return REVIEW_STATUS.APPROVED
  return REVIEW_STATUS.REVIEW_WAITING
}

/**
 * 「本番 /admin の pending-review に出るか」を DMP Core 基準で判定する。
 * /admin（getPendingReviewPostsForAdmin / buildPendingReviewPost）と同じ条件:
 *   archived:true は除外、reviewed:true は除外、それ以外（差し戻し含む）は pending。
 */
export function isReviewQueueItem(data) {
  if (!isPlainData(data)) return false
  if (data.archived === true) return false
  if (data.reviewed === true) return false
  return true
}

// ── 画像状態 ─────────────────────────────────────────────────────────────────

/**
 * 画像未設定 / alt 不足 / ファイル欠落 / ok を区別する。
 * repoRoot を渡すと image が指すファイルの実在も確認する（public 配下を想定）。
 */
export function classifyImageStatus(data, { repoRoot = null, fileExists = existsSync } = {}) {
  if (!isPlainData(data)) return IMAGE_STATUS.UNKNOWN
  const image = String(data.image ?? '').trim()
  const imageAlt = String(data.image_alt ?? '').trim()
  if (!image) return IMAGE_STATUS.MISSING_IMAGE
  if (!imageAlt) return IMAGE_STATUS.MISSING_ALT
  if (repoRoot) {
    const rel = image.replace(/^\/+/, '')
    const underPublic = resolve(repoRoot, 'public', rel)
    const underRoot = resolve(repoRoot, rel)
    if (!fileExists(underPublic) && !fileExists(underRoot)) return IMAGE_STATUS.MISSING_FILE
  }
  return IMAGE_STATUS.OK
}

export function isImageMissing(imageStatus) {
  return IMAGE_MISSING_STATUSES.has(imageStatus)
}

// ── Git / origin 反映状態 ────────────────────────────────────────────────────

function runGit(root, args, timeout = 8000) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout,
      // 認証ダイアログ / 対話プロンプトでハングしないようにする
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    }).trim()
  } catch {
    return ''
  }
}

/**
 * git の読み取り結果（ahead/behind/dirty/untracked 等）を git_status へ正規化する純粋関数。
 * I/O を持たないため単体テスト可能。MitaniOS DMP 側 buildGitSync と同一の分岐にする。
 *
 * 注: GIT_STATUS.LOCAL_ONLY は DMP Core 契約語彙（記事の local-only 判定に対応）として
 *     予約済み。repo レベルの本関数では未push を NEEDS_PUSH で表すため返さない。
 */
export function normalizeGitStatus({
  localHead,
  refAvailable,
  ahead,
  behind,
  dirtyCount,
  untrackedCount,
}) {
  if (localHead == null) return GIT_STATUS.UNKNOWN
  if (!refAvailable || ahead == null || behind == null) {
    if (dirtyCount > 0) return GIT_STATUS.MODIFIED
    if (untrackedCount > 0) return GIT_STATUS.UNTRACKED
    return GIT_STATUS.UNKNOWN
  }
  if (ahead > 0 && behind > 0) return GIT_STATUS.DIVERGED
  if (ahead > 0) return GIT_STATUS.NEEDS_PUSH
  if (behind > 0) return GIT_STATUS.BEHIND_ORIGIN
  if (dirtyCount > 0) return GIT_STATUS.MODIFIED
  if (untrackedCount > 0) return GIT_STATUS.UNTRACKED
  return GIT_STATUS.CLEAN
}

/**
 * local HEAD と origin/main の差分（ahead / behind / dirty / untracked）を読み取り、
 * DMP Core の git_status へ正規化する。push / fetch は行わない（読み取りのみ）。
 */
export function gitSyncStatus(root, { ref = 'origin/main' } = {}) {
  const branch = runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']) || null
  const localHead = runGit(root, ['rev-parse', '--short', 'HEAD']) || null
  const refAvailable = runGit(root, ['rev-parse', '--verify', `${ref}^{commit}`]) !== ''

  let ahead = null
  let behind = null
  let originHead = null
  if (refAvailable) {
    originHead = runGit(root, ['rev-parse', '--short', ref]) || null
    // --left-right --count A...HEAD → "<behind>\t<ahead>"（A=ref から見た差分）
    const counts = runGit(root, ['rev-list', '--left-right', '--count', `${ref}...HEAD`])
    if (counts) {
      const [b, a] = counts.split(/\s+/).map((n) => parseInt(n, 10))
      behind = Number.isFinite(b) ? b : null
      ahead = Number.isFinite(a) ? a : null
    }
  }

  const porcelain = runGit(root, ['status', '--porcelain'])
  const lines = porcelain ? porcelain.split('\n').filter(Boolean) : []
  const untrackedCount = lines.filter((l) => l.startsWith('??')).length
  const dirtyCount = lines.length - untrackedCount

  const git_status = normalizeGitStatus({ localHead, refAvailable, ahead, behind, dirtyCount, untrackedCount })

  return {
    branch,
    ref,
    refAvailable,
    localHead,
    originHead,
    ahead,
    behind,
    dirtyCount,
    untrackedCount,
    needsPush: ahead != null && ahead > 0,
    git_status,
  }
}

// ── 集計 ─────────────────────────────────────────────────────────────────────

/**
 * frontmatter data の配列から DMP Core の必須カウントを求める。
 * 入力要素は { data } でも data そのものでも可。
 */
export function summarizeWorkflowCounts(posts, { today = getTodayJst(), repoRoot = null } = {}) {
  const counts = {
    draft_count: 0,
    review_waiting_count: 0,
    publish_waiting_count: 0,
    published_count: 0,
    blocked_count: 0,
    image_missing_count: 0,
    workflow_unknown_count: 0,
  }
  for (const post of posts ?? []) {
    const data = post && post.data !== undefined ? post.data : post
    const ws = classifyWorkflowStatus(data, { today })
    switch (ws) {
      case WORKFLOW_STATUS.DRAFT:
        counts.draft_count++
        break
      case WORKFLOW_STATUS.REVIEW_WAITING:
        counts.review_waiting_count++
        break
      case WORKFLOW_STATUS.PUBLISH_WAITING:
        counts.publish_waiting_count++
        break
      case WORKFLOW_STATUS.PUBLISHED:
        counts.published_count++
        break
      case WORKFLOW_STATUS.BLOCKED:
        counts.blocked_count++
        break
      default:
        counts.workflow_unknown_count++
    }
    if (isImageMissing(classifyImageStatus(data, { repoRoot }))) {
      counts.image_missing_count++
    }
  }
  return counts
}
