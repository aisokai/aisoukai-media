function incident(reason, exitCode = 1) {
  return {
    kind: 'incident',
    reviewReady: false,
    exitCode,
    reason,
  }
}

export function buildScheduledStockNotification({ outcome, dashboardUrl }) {
  if (outcome?.kind === 'review-ready') {
    return `新しい記事を1件ストックしました。管理画面で確認できます。\n${dashboardUrl}`
  }
  if (outcome?.kind === 'stocked-pending-sync') {
    return '新しい記事を1件ストックしました。管理画面への反映待ちです。'
  }
  return '記事ストックを更新できませんでした。次回再試行します。'
}

export function buildScheduledFailureNotification() {
  return '記事ストックを更新できませんでした。次回再試行します。'
}

export function classifyScheduledDraftOutcome({
  childStatus,
  scheduledResult,
  stockResult,
  draftSyncResult,
} = {}) {
  if (!Number.isInteger(childStatus) || childStatus < 0) {
    return incident('scheduled child の終了状態を確認できませんでした')
  }
  if (childStatus !== 0) {
    return incident(`scheduled child が exit ${childStatus} で停止しました`, childStatus)
  }
  if (!scheduledResult || typeof scheduledResult !== 'object'
    || typeof scheduledResult.ok !== 'boolean'
    || typeof scheduledResult.generated !== 'boolean') {
    return incident('scheduled child の結果JSONが不正です')
  }
  if (scheduledResult.ok !== true) {
    return incident('scheduled child が失敗結果を返しました')
  }
  if (!scheduledResult.generated) {
    return {
      kind: 'no-draft',
      reviewReady: false,
      exitCode: 0,
      reason: '生成対象の下書きはありません',
    }
  }
  if (stockResult === undefined) {
    return {
      kind: 'generated-awaiting-stock',
      reviewReady: false,
      exitCode: 0,
      reason: '生成下書きの永続記録待ちです',
    }
  }
  if (stockResult?.ok !== true || stockResult?.stocked !== true) {
    return incident(stockResult?.reason ?? '生成下書きを安全にストックできませんでした')
  }
  if (draftSyncResult?.ok === true
    && draftSyncResult.committed === true
    && (draftSyncResult.skipped === undefined || draftSyncResult.skipped === false)) {
    return {
      kind: 'review-ready',
      reviewReady: true,
      exitCode: 0,
      generated: true,
      syncSucceeded: true,
      syncCommitted: true,
      reason: '生成下書きのGit同期準備が完了しました',
    }
  }
  return {
    kind: 'stocked-pending-sync',
    reviewReady: false,
    exitCode: 0,
    generated: true,
    stocked: true,
    syncSucceeded: false,
    reason: draftSyncResult?.reason ?? '生成下書きは安全にストックされ、管理画面への反映待ちです',
  }
}

export function scheduledDraftNotificationBoundary(outcome) {
  if (outcome?.kind === 'review-ready'
    && outcome.reviewReady === true
    && outcome.exitCode === 0
    && outcome.generated === true
    && outcome.syncSucceeded === true
    && outcome.syncCommitted === true) {
    return { kind: 'review-request', shouldSend: true, job: 'ops-mwf-review-request' }
  }
  if (outcome?.kind === 'stocked-pending-sync'
    && outcome.exitCode === 0
    && outcome.generated === true
    && outcome.stocked === true) {
    return { kind: 'stock-update', shouldSend: true, job: 'ops-mwf-stock-update' }
  }
  if (outcome?.kind === 'incident') {
    return { kind: 'incident', shouldSend: true, job: 'ops-mwf-incident' }
  }
  return { kind: 'suppressed', shouldSend: false, job: null }
}

export function shouldSendDraftReviewNotification(outcome) {
  return scheduledDraftNotificationBoundary(outcome).kind === 'review-request'
}

export function shouldSendScheduledIncidentNotification(outcome) {
  return scheduledDraftNotificationBoundary(outcome).kind === 'incident'
}

export function shouldSendStockUpdateNotification(outcome) {
  return scheduledDraftNotificationBoundary(outcome).kind === 'stock-update'
}
