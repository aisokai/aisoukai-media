import { getContentVersion } from '../../src/lib/dmpArticleState.mjs'

function incident(reason, exitCode = 1) {
  return { kind: 'incident', exitCode, reason }
}

// A durable local stock record is not evidence that the production admin can
// review it. This notice deliberately has no approval CTA or production URL.
// Human approval remains the only publication gate once the article is visible
// in the authenticated production review queue.
export function buildScheduledStockNotification() {
  return '新しい記事をローカルのストックに1件保存しました。本番の管理画面にはまだ反映されていません。'
}

export function buildScheduledFailureNotification() {
  return '記事ストックまたはTelegram通知に失敗しました。未送信として記録しました。必要に応じて運用確認してください。'
}

export function classifyScheduledDraftOutcome({ childStatus, scheduledResult, stockResult, draftData = {}, draftContent = '' } = {}) {
  if (!Number.isInteger(childStatus) || childStatus < 0) return incident('scheduled child の終了状態を確認できませんでした')
  if (childStatus !== 0) return incident(`scheduled child が exit ${childStatus} で停止しました`, childStatus)
  if (!scheduledResult || typeof scheduledResult !== 'object' || typeof scheduledResult.ok !== 'boolean' || typeof scheduledResult.generated !== 'boolean') {
    return incident('scheduled child の結果JSONが不正です')
  }
  if (!scheduledResult.ok) return incident('scheduled child が失敗結果を返しました')
  if (!scheduledResult.generated) return { kind: 'no-draft', exitCode: 0, reason: '未使用ネタはありません' }
  if (stockResult === undefined) return { kind: 'generated-awaiting-stock', exitCode: 0, reason: '生成下書きの永続ストック待ちです' }
  if (stockResult?.ok !== true || stockResult?.stocked !== true) return incident(stockResult?.reason ?? '生成下書きをストックできませんでした')

  return {
    kind: 'stocked',
    exitCode: 0,
    generated: true,
    stocked: true,
    contentVersion: typeof stockResult.contentVersion === 'string'
      ? stockResult.contentVersion
      : getContentVersion(draftData, draftContent),
    articlePath: scheduledResult.path,
    medicalRisk: String(draftData.medical_risk ?? ''),
    reason: '生成下書きをストックし、Telegram通知処理へ進みます',
  }
}

export function scheduledDraftNotificationBoundary(outcome) {
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
