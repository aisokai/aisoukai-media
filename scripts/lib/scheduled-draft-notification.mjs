import { createHash } from 'node:crypto'
import { getContentVersion } from '../../src/lib/dmpArticleState.mjs'
import { finalizeSyncedDraftLedger, syncOwnedGeneratedDraft } from './scheduled-draft-commit.mjs'

function incident(reason, exitCode = 1) {
  return { kind: 'incident', exitCode, reason }
}

// A missing flag is intentionally OFF so an incomplete operator config can
// never create a Telegram send path.
export function isTelegramNotificationEnabled(config) {
  return config?.flags?.telegram_notify === true
}

// A durable local stock record is not evidence that the production admin can
// review it. This notice deliberately has no approval CTA or production URL.
// Human approval remains the only publication gate once the article is visible
// in the authenticated production review queue.
export function buildScheduledStockNotification() {
  return '新しい記事をローカルのストックに1件保存しました。本番の管理画面にはまだ反映されていません。'
}

// This CTA is intentionally reachable only after the exact origin/main SHA
// verification performed by scheduled-draft-commit. It never approves or
// publishes an article; the linked queue still requires a Human action.
export function buildScheduledReviewNotification({ resolvedEntries } = {}) {
  const count = Array.isArray(resolvedEntries) ? resolvedEntries.length : 1
  return `新しい未承認記事${count}件を本番のレビュー待ちへ同期しました。内容を確認してHuman承認してください: https://aisoukai-media.vercel.app/admin/pending-review`
}

// The version is a digest of the complete synced set, not a single article:
// the same set dedupes, while a changed set remains eligible for one digest.
export function contentVersionForResolvedEntries(resolvedEntries) {
  if (!Array.isArray(resolvedEntries) || resolvedEntries.length === 0) return null
  const versions = resolvedEntries.map((entry) => entry?.contentSha256)
  if (!versions.every((version) => typeof version === 'string' && /^[a-f0-9]{64}$/.test(version))) return null
  return createHash('sha256').update([...versions].sort().join('\n')).digest('hex')
}

export function buildScheduledFailureNotification() {
  return '記事ストックまたはTelegram通知に失敗しました。未送信として記録しました。必要に応じて運用確認してください。'
}

export function classifyScheduledDraftOutcome({ childStatus, scheduledResult, stockResult, draftSyncResult, draftData = {}, draftContent = '' } = {}) {
  if (!Number.isInteger(childStatus) || childStatus < 0) return incident('scheduled child の終了状態を確認できませんでした')
  if (childStatus !== 0) return incident(`scheduled child が exit ${childStatus} で停止しました`, childStatus)
  if (!scheduledResult || typeof scheduledResult !== 'object' || typeof scheduledResult.ok !== 'boolean' || typeof scheduledResult.generated !== 'boolean') {
    return incident('scheduled child の結果JSONが不正です')
  }
  if (!scheduledResult.ok) return incident('scheduled child が失敗結果を返しました')
  if (!scheduledResult.generated) return { kind: 'no-draft', exitCode: 0, reason: '未使用ネタはありません' }
  if (stockResult === undefined) return { kind: 'generated-awaiting-stock', exitCode: 0, reason: '生成下書きの永続ストック待ちです' }
  if (stockResult?.ok !== true || stockResult?.stocked !== true) return incident(stockResult?.reason ?? '生成下書きをストックできませんでした')

  const contentVersion = typeof stockResult?.entry?.contentSha256 === 'string'
    ? stockResult.entry.contentSha256
    : typeof stockResult.contentVersion === 'string'
      ? stockResult.contentVersion
      : getContentVersion(draftData, draftContent)
  if (draftSyncResult?.ok === true && draftSyncResult?.synced === true) {
    return {
      kind: 'synced',
      exitCode: 0,
      generated: true,
      stocked: true,
      synced: true,
      contentVersion,
      articlePath: scheduledResult.path,
      reason: '未承認draftをorigin/mainへ同期し、Human review通知処理へ進みます',
    }
  }

  return {
    kind: 'stocked',
    exitCode: 0,
    generated: true,
    stocked: true,
    contentVersion,
    articlePath: scheduledResult.path,
    medicalRisk: String(draftData.medical_risk ?? ''),
    reason: '生成下書きをストックし、Telegram通知処理へ進みます',
  }
}

export function scheduledDraftNotificationBoundary(outcome) {
  if (outcome?.kind === 'synced' && outcome.exitCode === 0 && outcome.synced === true) {
    return { kind: 'review-request', shouldSend: true, job: 'ops-mwf-review-request', contentVersion: outcome.contentVersion }
  }
  if (outcome?.kind === 'stocked' && outcome.exitCode === 0 && outcome.generated === true && outcome.stocked === true) {
    return { kind: 'stock-notice', shouldSend: true, job: 'ops-mwf-stock-notice', contentVersion: outcome.contentVersion }
  }
  if (outcome?.kind === 'incident') return { kind: 'incident', shouldSend: true, job: 'ops-mwf-incident' }
  return { kind: 'none', shouldSend: false, job: null }
}

export function shouldSendDraftReviewNotification(outcome) {
  return scheduledDraftNotificationBoundary(outcome).kind === 'review-request'
}

export function shouldSendStockNoticeNotification(outcome) {
  return scheduledDraftNotificationBoundary(outcome).kind === 'stock-notice'
}

export function shouldSendScheduledIncidentNotification(outcome) {
  return scheduledDraftNotificationBoundary(outcome).kind === 'incident'
}

export function shouldSendStockUpdateNotification() {
  return false
}

function outcomeForRecoveredSync(draftSyncResult) {
  const entry = draftSyncResult?.resolvedEntries?.[0]
  if (!entry) return null
  return classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true, path: entry.path },
    stockResult: { ok: true, stocked: true, entry },
    draftSyncResult,
  })
}

export async function notifySyncedDraftLedger({ root, draftSyncResult, sendNotification, finalizeLedger = finalizeSyncedDraftLedger }) {
  const outcome = outcomeForRecoveredSync(draftSyncResult)
  if (!outcome) return { ok: true, notified: false, finalized: false }
  try {
    const resolvedEntries = draftSyncResult.resolvedEntries
    const contentVersion = contentVersionForResolvedEntries(resolvedEntries)
    if (!contentVersion) return { ok: false, notified: false, finalized: false, reason: '同期済みledgerのcontentVersionを安全に導出できません' }
    const notificationResult = await sendNotification(
      buildScheduledReviewNotification({ resolvedEntries }),
      { ...scheduledDraftNotificationBoundary(outcome), contentVersion },
    )
    if (notificationResult.suppressed === true) return { ok: true, notified: false, finalized: false, suppressed: true }
    if (!notificationResult.sent && !notificationResult.duplicate) return { ok: false, notified: false, finalized: false, reason: 'review通知の結果を安全に確認できません' }
    const finalized = finalizeLedger({ root, resolvedEntries })
    return finalized.ok
      ? { ok: true, notified: true, finalized: true, duplicate: notificationResult.duplicate === true }
      : { ok: false, notified: true, finalized: false, reason: finalized.reason }
  } catch (error) {
    return { ok: false, notified: false, finalized: false, reason: String(error?.message ?? 'review通知に失敗しました') }
  }
}

export async function reconcileBeforeGeneration({ root, runCommand, sync = syncOwnedGeneratedDraft, notify = notifySyncedDraftLedger }) {
  const draftSyncResult = sync({ root, runCommand, assertGitReady: () => ({ ok: true }) })
  const notification = await notify({ root, draftSyncResult })
  return { draftSyncResult, notification }
}
