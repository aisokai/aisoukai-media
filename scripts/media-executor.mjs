#!/usr/bin/env node
// Media Executor (Phase 4)。auto_when_enabled フラグON時のみ動く自動実行器。
// launchd から --apply 付きで定期実行される想定。
//
// 動作:
//   1. review_pending の GMB系 job を走査
//   2. effectiveGatePolicy が auto_after_notify (= 該当フラグON) のものだけを
//      auto承認 (approved_by: auto:<flags>) → applyJob で送信 → Telegram事後通知
//   3. フラグが全てOFFなら何もしない (安全側デフォルト)
//
// review_reply は返信案の template_id から variant を判定し、
// テンプレ返信のみ解禁 (gmb_reply_auto_template) と通常返信解禁 (gmb_reply_auto) を区別する。
// risk_level=high の job は resolveGatePolicy 段階で human_gate のため対象外。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ROOT, appendMediaLog, effectiveGatePolicy, getJstTimestamp, listJobs, loadGateConfig,
  saveJob, transitionJob,
} from './lib/media-queue.mjs'
import { GMB_APPLYABLE_TYPES, applyJob } from './lib/media-apply.mjs'
import { notifyTelegramIfConfigured } from './lib/telegram-notify.mjs'

// 返信テンプレ → flag binding variant の固定対応表
const TEMPLATE_VARIANT = Object.freeze({
  thanks_no_text: 'template_only',
  thanks_short: 'short_positive',
  thanks_normal: 'normal',
  apology_low_rating: 'normal',
  calm_hostile: 'normal',
})

export function resolveReplyVariant(job) {
  const replyPath = (job.output_paths ?? []).find((p) => p.includes('gmb-reviews/replies/') && p.endsWith('.json'))
  if (!replyPath) return 'normal'
  const abs = join(ROOT, replyPath)
  if (!existsSync(abs)) return 'normal'
  try {
    const draft = JSON.parse(readFileSync(abs, 'utf8'))
    return TEMPLATE_VARIANT[draft.template_id] ?? 'normal'
  } catch {
    return 'normal'
  }
}

// 自動実行対象の選定 (純関数: テスト可能)
export function selectAutoExecutable(jobs, config, { variantResolver = resolveReplyVariant } = {}) {
  return jobs.filter((job) => {
    if (job.status !== 'review_pending') return false
    if (!GMB_APPLYABLE_TYPES.includes(job.type)) return false
    if (!job.target_channels?.includes('gmb')) return false
    if (job.risk_level === 'high') return false
    const policy = job.gate_by_channel?.gmb ?? job.gate_policy
    if (policy !== 'auto_when_enabled') return false
    const variant = job.type === 'review_reply' ? variantResolver(job) : null
    const effective = effectiveGatePolicy({ type: job.type, channel: 'gmb', policy, variant, config })
    return effective === 'auto_after_notify'
  })
}

export async function runExecutor({ apply = false, config = loadGateConfig(), client = null, dir, logPath } = {}) {
  if (!config) {
    return { executed: [], skipped: 'gate config なし (全てhuman_gate扱い)' }
  }
  const candidates = selectAutoExecutable(listJobs({ dir }), config)
  const executed = []

  for (const job of candidates) {
    if (!apply) {
      executed.push({ id: job.id, type: job.type, dryRun: true })
      continue
    }
    try {
      // auto承認を記録してからapply (Human承認と区別される)
      const approved = transitionJob(job, 'approved', {
        approved_by: 'auto:media-executor',
        approved_at: getJstTimestamp(),
      })
      saveJob(approved, { dir, logPath })
      const result = await applyJob({ id: job.id, apply: true, client, dir, logPath, config })
      executed.push({ id: job.id, type: job.type, dryRun: false, externalResult: result.externalResult })
      await notifyTelegramIfConfigured(
        `🤖 自動実行 (事後通知): ${job.id} ${job.type}\nID: ${JSON.stringify(result.externalResult)}\n問題があれば gmb-apply --delete-... で取り消せます`,
      )
    } catch (err) {
      // applyJob内でfailed遷移済み。executor全体は止めない。
      executed.push({ id: job.id, type: job.type, error: err.message })
      appendMediaLog({ event: 'executor_job_failed', job_id: job.id, error: String(err.message) }, logPath)
    }
  }

  return { executed, candidates: candidates.length }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const { executed, candidates, skipped } = await runExecutor({ apply })
  if (skipped) {
    console.log(`⏭ ${skipped}`)
    return
  }
  console.log(`🤖 media executor: 対象 ${candidates ?? 0} 件 (${apply ? '実行' : 'dry-run'})`)
  for (const e of executed) {
    if (e.error) console.error(`   ❌ ${e.id}: ${e.error}`)
    else console.log(`   ${e.dryRun ? '[dry-run] ' : '✅ '}${e.id} ${e.type}`)
  }
  if (executed.length === 0) console.log('   対象なし (フラグOFF または 該当jobなし)')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  })
}
