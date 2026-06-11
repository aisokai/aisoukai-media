// media-apply.mjs
// 外部送信の唯一の共通経路 (Phase 3)。
// gmb-apply.mjs (先生の明示CLI) と media-executor.mjs (フラグON時の自動実行) から使う。
//
// 安全条件 (すべて満たさない限り送信しない):
//   1. job が content/media-queue/ に存在し validator を通ること
//   2. status が approved であること (承認はHuman または auto:flag 経由で記録済み)
//   3. type が GMB系 (review_reply / gmb_update / gmb_emergency_notice / gmb_campaign /
//      temporary_closure_notice / schedule_change_notice の gmb channel分) であること
//   4. apply=true が明示されていること (デフォルトは dry-run)
// 送信後は external_result に ID を保存し executed へ遷移、JSONLに記録する。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ROOT, appendMediaLog, createJob, getJstTimestamp, redactSecrets, saveJob, transitionJob, validateJob,
} from './media-queue.mjs'
import { loadJob } from './telegram-media-commands.mjs'

export const GMB_APPLYABLE_TYPES = Object.freeze([
  'review_reply', 'gmb_update', 'gmb_emergency_notice', 'gmb_campaign',
  'temporary_closure_notice', 'schedule_change_notice',
  'delete_review_reply', 'delete_gmb_post',
])

// 破壊的操作 (削除)。常に human_gate。実行時に --by の明示も必須。
export const DELETE_TYPES = Object.freeze(['delete_review_reply', 'delete_gmb_post'])

export function defaultGmbClient() {
  // 遅延import: テストや dry-run では実clientを生成しない
  return {
    async replyReview({ reviewId, comment }) {
      const { putReviewReply } = await import('./gmb-api.mjs')
      return putReviewReply({ reviewId, comment })
    },
    async createPost({ draftText, ctaUrl }) {
      const { createLocalPost } = await import('./gmb-api.mjs')
      return createLocalPost({ draftText, ctaUrl })
    },
    async deleteReply({ reviewId }) {
      const { deleteReviewReply } = await import('./gmb-api.mjs')
      return deleteReviewReply({ reviewId })
    },
    async deletePost({ postName }) {
      const { deleteLocalPost } = await import('./gmb-api.mjs')
      return deleteLocalPost({ postName })
    },
  }
}

// 削除リクエストを queue item として作成する (Human Gate必須の入口)。
// 直接削除は存在しない。承認 → applyJob (--by 必須) でのみ実行される。
export function createDeleteRequest({ kind, target, by, dir, logPath, config }) {
  if (!DELETE_TYPES.includes(kind)) {
    throw new Error(`削除typeが固定enum外です: "${kind}" (delete_review_reply / delete_gmb_post)`)
  }
  if (!target) throw new Error('削除対象 (review_id / post_name) が必要です')
  if (!by) throw new Error('--by <氏名> が必要です (破壊的操作はHuman Gate)')
  let job = createJob({
    type: kind,
    source: 'manual',
    sourceText: `${kind}: ${target} (requested by ${by})`,
    targetChannels: ['gmb'],
    riskLevel: 'high', // 破壊的操作は常にhigh → gate表でも human_gate
    config,
  })
  job = { ...job, delete_target: target }
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'human_required')
  saveJob(job, { dir, logPath })
  appendMediaLog({ event: 'delete_requested', job_id: job.id, kind, target, by: `human:${by}` }, logPath)
  return job
}

// job の output_paths から送信payloadを組み立てる (純関数に近い形でテスト可能)
export function buildApplyPayload(job) {
  if (DELETE_TYPES.includes(job.type)) {
    const target = job.delete_target ?? job.source_text?.match(/^delete_\w+:\s*(\S+)/)?.[1]
    if (!target) throw new Error(`削除対象が job に記録されていません: ${job.id}`)
    return job.type === 'delete_review_reply'
      ? { kind: 'delete_reply', reviewId: target }
      : { kind: 'delete_post', postName: target }
  }
  if (job.type === 'review_reply') {
    const replyPath = (job.output_paths ?? []).find((p) => p.includes('gmb-reviews/replies/') && p.endsWith('.json'))
    if (!replyPath) throw new Error(`返信案ファイルが output_paths にありません: ${job.id}`)
    const abs = join(ROOT, replyPath)
    if (!existsSync(abs)) throw new Error(`返信案ファイルが見つかりません: ${replyPath}`)
    const draft = JSON.parse(readFileSync(abs, 'utf8'))
    if (!draft.draft_text) throw new Error(`draft_text が空です: ${replyPath}`)
    return { kind: 'reply', reviewId: draft.review_id, comment: draft.draft_text, sourcePath: replyPath }
  }

  // GMB投稿系: gmb-drafts または emergency-drafts の gmb 文面
  const gmbDraftPath = (job.output_paths ?? []).find((p) => p.startsWith('content/gmb-drafts/') && p.endsWith('.json'))
  if (gmbDraftPath) {
    const abs = join(ROOT, gmbDraftPath)
    if (!existsSync(abs)) throw new Error(`下書きが見つかりません: ${gmbDraftPath}`)
    const draft = JSON.parse(readFileSync(abs, 'utf8'))
    return { kind: 'post', draftText: draft.draft_text, ctaUrl: draft.cta_url ?? null, sourcePath: gmbDraftPath }
  }
  const emergencyGmbPath = (job.output_paths ?? []).find((p) => p.includes('emergency-drafts/') && p.endsWith('/gmb.md'))
  if (emergencyGmbPath) {
    const abs = join(ROOT, emergencyGmbPath)
    if (!existsSync(abs)) throw new Error(`下書きが見つかりません: ${emergencyGmbPath}`)
    return { kind: 'post', draftText: readFileSync(abs, 'utf8').trim(), ctaUrl: null, sourcePath: emergencyGmbPath }
  }
  throw new Error(`GMB送信対象の下書きが output_paths にありません: ${job.id}`)
}

export async function applyJob({ id, apply = false, client = null, dir, logPath, config, executedBy = null }) {
  const job = loadJob(id, { dir })

  const { errors } = validateJob(job, { config })
  if (errors.length > 0) throw new Error(`job が invalid です: ${errors.join(' / ')}`)
  if (job.status !== 'approved') {
    throw new Error(`status が approved ではありません: ${job.status} (承認後にのみ実行できます)`)
  }
  if (!job.approved_by) {
    throw new Error(`approved_by が記録されていません: ${job.id} (承認経路を通っていないjobは実行できません)`)
  }
  if (!job.approved_at) {
    throw new Error(`approved_at が記録されていません: ${job.id}`)
  }
  if (!GMB_APPLYABLE_TYPES.includes(job.type)) {
    throw new Error(`apply対象外の type です: ${job.type}`)
  }
  if (!job.target_channels?.includes('gmb')) {
    throw new Error(`target_channels に gmb が含まれていません: ${job.id} (他媒体の実行は未実装)`)
  }
  // 破壊的操作 (削除) の追加条件: 実行者の --by 明示が必須 (Human Gate固定)
  if (DELETE_TYPES.includes(job.type) && !executedBy) {
    throw new Error('削除の実行には --by <氏名> が必要です (破壊的操作はHuman Gate。自動実行されません)')
  }

  const payload = buildApplyPayload(job)

  if (!apply) {
    return { dryRun: true, job, payload }
  }

  const gmb = client ?? defaultGmbClient()
  let externalResult
  try {
    if (payload.kind === 'reply') {
      externalResult = await gmb.replyReview({ reviewId: payload.reviewId, comment: payload.comment })
    } else if (payload.kind === 'post') {
      externalResult = await gmb.createPost({ draftText: payload.draftText, ctaUrl: payload.ctaUrl })
    } else if (payload.kind === 'delete_reply') {
      externalResult = await gmb.deleteReply({ reviewId: payload.reviewId })
    } else if (payload.kind === 'delete_post') {
      externalResult = await gmb.deletePost({ postName: payload.postName })
    } else {
      throw new Error(`不明なpayload kindです: ${payload.kind}`)
    }
  } catch (err) {
    // 失敗は該当jobのみ failed。秘密値が混ざらないようredact。
    const failed = transitionJob(job, 'failed', {
      error: { message: redactSecrets(String(err.message)) },
      retry_count: (job.retry_count ?? 0) + 1,
    })
    saveJob(failed, { dir, logPath })
    appendMediaLog({ event: 'apply_failed', job_id: job.id, error: redactSecrets(String(err.message)) }, logPath)
    throw err
  }

  const executed = transitionJob(job, 'executed', {
    executed_at: getJstTimestamp(),
    external_result: externalResult,
  })
  saveJob(executed, { dir, logPath })
  appendMediaLog({
    event: 'apply_executed', job_id: job.id, type: job.type, kind: payload.kind,
    external_result: externalResult,
    ...(executedBy ? { executed_by: `human:${executedBy}` } : {}),
  }, logPath)

  return { dryRun: false, job: executed, payload, externalResult }
}
