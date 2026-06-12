// telegram-media-commands.mjs
// Telegram スラッシュコマンド → Media Queue 操作の共有モジュール。
// telegram-ops.mjs (実運用) と telegram-instruction-dry-run.mjs (mock) の両方から使う。
//
// 安全設計:
//   - 受付コマンドは固定 allowlist。post / publish / deploy / apply / send は blocked。
//   - /approve・/reject は二重ゲート:
//       ① 呼び出し側が authorized (TELEGRAM_ALLOWED_CHAT_IDS) を渡す
//       ② config/media-gate.json の flags.telegram_media_approve が true
//     どちらか欠けると状態遷移しない (AGENTS.md v2 適用まではフラグOFF運用)。
//   - 承認は queue item の状態遷移のみ。外部送信はこのモジュールに存在しない。

import { existsSync, readFileSync } from 'node:fs'
import {
  appendMediaLog, getJstTimestamp, jobPath, listJobs, loadGateConfig,
  saveJob, transitionJob,
} from './media-queue.mjs'
import { classifyNoticeType, generateEmergencyNotice } from '../generate-emergency-notice.mjs'
import { generateGmbDraft } from '../generate-gmb-draft.mjs'
import { buildStatusSummary } from '../media-status.mjs'
import { POST_TYPE_LABELS, createManualPostRequest } from './manual-post.mjs'

// 受付可能コマンドの固定allowlist。これ以外は変換しない。
export const COMMAND_ALLOWLIST = Object.freeze(['notice', 'gmb', 'review', 'sns', 'status', 'approve', 'reject', 'draft'])
// 実行系は実装しない (gmb apply 等は別スクリプト・別Gate)
export const BLOCKED_COMMANDS = Object.freeze(['post', 'publish', 'deploy', 'apply', 'send', 'push'])

export function parseInstruction(input) {
  const text = String(input ?? '').trim()
  const match = text.match(/^\/([a-z]+)\s*(.*)$/s)
  const received_at = getJstTimestamp()
  if (!match) {
    return { command: 'unknown', allowed: false, payload: text, mapped_job_type: null, job_id: null, blocked_reason: 'コマンド形式ではありません (/notice 等で始めてください)', received_at }
  }
  const [, command, payload] = match
  if (BLOCKED_COMMANDS.includes(command)) {
    return { command, allowed: false, payload, mapped_job_type: null, job_id: null, blocked_reason: `blocked: /${command} は実行系コマンドのため受け付けません (Human Gate)`, received_at }
  }
  if (!COMMAND_ALLOWLIST.includes(command)) {
    return { command: 'unknown', allowed: false, payload, mapped_job_type: null, job_id: null, blocked_reason: `不明なコマンドです: /${command}`, received_at }
  }
  const mapped = {
    notice: payload ? classifyNoticeType(payload) : null,
    gmb: 'gmb_update',
    sns: 'sns_repurpose',
    review: null,  // 照会系: jobを作らない
    status: null,  // 照会系: jobを作らない
    approve: null, // 操作系: 既存jobの遷移のみ
    reject: null,  // 操作系: 既存jobの遷移のみ
    draft: null,   // 受付系: manual-post リクエスト保存のみ (Media Queue job は作らない)
  }[command]
  return { command, allowed: true, payload, mapped_job_type: mapped, job_id: null, blocked_reason: null, received_at }
}

// ── 承認 / 差し戻し (状態遷移のみ。外部実行はしない) ─────────────────────

export function loadJob(id, { dir } = {}) {
  const path = jobPath(id, dir)
  if (!existsSync(path)) throw new Error(`job が見つかりません: ${id}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

const APPROVABLE_STATUSES = Object.freeze(['review_pending', 'human_required'])

export function approveMediaJob({ id, by, dir, logPath }) {
  const job = loadJob(id, { dir })
  if (!APPROVABLE_STATUSES.includes(job.status)) {
    throw new Error(`status が承認可能ではありません: ${job.status} (対象: ${APPROVABLE_STATUSES.join(' / ')})`)
  }
  const updated = transitionJob(job, 'approved', {
    approved_by: `human:${by}`,
    approved_at: getJstTimestamp(),
  })
  saveJob(updated, { dir, logPath })
  appendMediaLog({ event: 'job_approved', job_id: id, by: `human:${by}` }, logPath)
  return updated
}

export function rejectMediaJob({ id, reason = '', by, dir, logPath }) {
  const job = loadJob(id, { dir })
  if (!APPROVABLE_STATUSES.includes(job.status)) {
    throw new Error(`status が差し戻し可能ではありません: ${job.status}`)
  }
  const updated = transitionJob(job, 'rejected')
  saveJob(updated, { dir, logPath })
  appendMediaLog({ event: 'job_rejected', job_id: id, by: `human:${by}`, reason }, logPath)
  return updated
}

// ── コマンドハンドラ ─────────────────────────────────────────────────────
// 戻り値: { ok, summary, reply, job } — reply は Telegram にそのまま返せる文面。
// dryRun=true ではファイル書き込み・状態遷移をしない。

export async function handleMediaCommand(input, {
  authorized = false, fromUser = '(unknown)', dryRun = true, config = loadGateConfig(),
} = {}) {
  const instruction = parseInstruction(input)

  if (!instruction.allowed) {
    return { ok: false, summary: instruction.blocked_reason, reply: `⛔ ${instruction.blocked_reason}` }
  }

  const { command, payload } = instruction

  if (command === 'status') {
    const s = buildStatusSummary()
    const reply = [
      '📊 Media Queue 状態',
      `queue合計: ${s.queue_total} 件`,
      `review待ち: ${s.review_pending} 件 / 要対応: ${s.human_required} 件 / 失敗: ${s.failed} 件`,
      `下書き — SNS:${s.sns_drafts} GMB:${s.gmb_drafts} 返信案:${s.gmb_reply_drafts} 緊急:${s.emergency_drafts}`,
    ].join('\n')
    return { ok: true, summary: `status (queue ${s.queue_total}件)`, reply }
  }

  if (command === 'review') {
    const pending = listJobs({ type: 'review_reply' })
      .filter((j) => ['review_pending', 'human_required'].includes(j.status))
    const lines = pending.slice(0, 10).map((j) =>
      `- ${j.id} [${j.status}] ${String(j.source_text).slice(0, 50)}`)
    const reply = pending.length === 0
      ? '未返信口コミの対応待ちはありません。'
      : `📝 口コミ対応待ち ${pending.length} 件:\n${lines.join('\n')}\n\n承認: /approve <id>`
    return { ok: true, summary: `review (${pending.length}件)`, reply }
  }

  if (command === 'approve' || command === 'reject') {
    if (!authorized) {
      return { ok: false, summary: '権限なし', reply: '⛔ 権限エラー: このチャット・ユーザーは承認操作できません。' }
    }
    if (config?.flags?.telegram_media_approve !== true) {
      return {
        ok: false,
        summary: 'telegram_media_approve フラグOFF',
        reply: '⛔ Telegram承認は未解禁です。AGENTS.md v2 適用後、先生が config/media-gate.json の telegram_media_approve を ON にすると有効になります。',
      }
    }
    const idMatch = payload.match(/^(mj-\S+)\s*(.*)$/s)
    if (!idMatch) {
      return { ok: false, summary: 'id指定なし', reply: `書式: /${command} <mj-...> ${command === 'reject' ? '<理由>' : ''}` }
    }
    const [, id, rest] = idMatch
    if (dryRun) {
      return { ok: true, summary: `[dry-run] ${command} ${id}`, reply: null }
    }
    try {
      const job = command === 'approve'
        ? approveMediaJob({ id, by: fromUser })
        : rejectMediaJob({ id, reason: rest, by: fromUser })
      const note = command === 'approve'
        ? '\n(状態遷移のみ。外部実行は apply コマンド実装後・別Gateで行われます)'
        : ''
      return {
        ok: true,
        summary: `${command} ${id} → ${job.status}`,
        reply: `✅ ${id} を ${job.status} にしました (by ${fromUser})${note}`,
        job,
      }
    } catch (err) {
      return { ok: false, summary: `${command}失敗: ${err.message}`, reply: `❌ ${err.message}` }
    }
  }

  if (command === 'draft') {
    // ブログ/お知らせの下書き作成リクエスト受付のみ。
    // 下書き生成・Human承認・commit は MitaniOS DMP 管理画面 / CLI 側で行う。
    if (!payload) {
      return { ok: false, summary: 'payloadなし', reply: '書式: /draft 6月20日午後は院内研修のため休診。お知らせを作って' }
    }
    try {
      const request = createManualPostRequest({
        source: 'telegram', rawInstruction: payload, requestedBy: fromUser, dryRun,
      })
      const reply = [
        `📝 下書き作成リクエストを受け付けました${dryRun ? ' (dry-run・保存なし)' : ''}`,
        `id: ${request.id}`,
        `種別(推定): ${POST_TYPE_LABELS[request.post_type]}`,
        '',
        'MitaniOS DMP 画面の「手動投稿作成」に未処理リクエストとして表示されます。',
        '下書き生成・Human承認・commit は管理画面から行います。Telegram からの公開・commit・push は行いません。',
      ].join('\n')
      return { ok: true, summary: `manual-post request ${request.id} (${request.post_type})`, reply, request }
    } catch (err) {
      return { ok: false, summary: `draft受付失敗: ${err.message}`, reply: `❌ ${err.message}` }
    }
  }

  if (command === 'notice') {
    if (!payload) return { ok: false, summary: 'payloadなし', reply: '書式: /notice 本日午後休診' }
    const { job, notice } = generateEmergencyNotice({ inputText: payload, dryRun })
    const reply = [
      `📢 緊急お知らせ案を生成しました (${notice.notice_type})`,
      `job: ${job.id} [${job.status}] gate=${job.gate_policy}`,
      ...notice.warnings.map((w) => `⚠ ${w}`),
      `媒体: ${Object.keys(notice.drafts).join(' / ')}`,
      `承認: /approve ${job.id}`,
    ].join('\n')
    return { ok: true, summary: `notice生成 ${job.id}`, reply, job }
  }

  if (command === 'gmb') {
    if (!payload) return { ok: false, summary: 'payloadなし', reply: '書式: /gmb お知らせ本文' }
    const { job, draft } = generateGmbDraft({ postType: 'update', inputText: payload, dryRun })
    const reply = [
      `🏥 GMB投稿下書きを生成しました`,
      `job: ${job.id} [${job.status}] gate=${job.gate_policy}`,
      ...draft.warnings.map((w) => `⚠ ${w}`),
      `承認: /approve ${job.id}`,
    ].join('\n')
    return { ok: true, summary: `gmb下書き ${job.id}`, reply, job }
  }

  if (command === 'sns') {
    if (!payload) return { ok: false, summary: 'payloadなし', reply: '書式: /sns <記事slug>' }
    // 記事slugからのSNS横展開。重い生成は同期で行わず、まずjob受付のみでも良いが、
    // v1ではテンプレ生成のため同期実行する。
    const { generateSnsFromPost } = await import('../generate-sns-from-post.mjs')
    try {
      const { job, drafts } = generateSnsFromPost({ postArg: payload.trim(), dryRun })
      const reply = [
        `📱 SNS下書きを生成しました (${drafts.length} 件)`,
        `job: ${job.id} [${job.status}] gate=${job.gate_policy}`,
        ...drafts.map((d) => `- ${d.filename}`),
        `投稿は手動 (publish_mode: manual_only)`,
      ].join('\n')
      return { ok: true, summary: `sns下書き ${job.id}`, reply, job }
    } catch (err) {
      return { ok: false, summary: `sns失敗: ${err.message}`, reply: `❌ ${err.message}` }
    }
  }

  return { ok: false, summary: '未対応コマンド', reply: `⛔ 未対応コマンドです: /${command}` }
}
