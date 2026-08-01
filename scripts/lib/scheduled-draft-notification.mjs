function incident(reason, exitCode = 1) {
  return {
    kind: 'incident',
    reviewReady: false,
    exitCode,
    reason,
  }
}

export function classifyScheduledDraftOutcome({
  childStatus,
  scheduledResult,
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
  if (draftSyncResult === undefined) {
    return {
      kind: 'generated-awaiting-sync',
      reviewReady: false,
      exitCode: 0,
      reason: '生成下書きのGit同期準備待ちです',
    }
  }
  if (draftSyncResult?.ok === true
    && draftSyncResult.committed === true
    && draftSyncResult.skipped !== true) {
    return {
      kind: 'review-ready',
      reviewReady: true,
      exitCode: 0,
      reason: '生成下書きのGit同期準備が完了しました',
    }
  }
  return {
    kind: 'sync-failure',
    reviewReady: false,
    exitCode: 1,
    reason: draftSyncResult?.reason ?? '生成下書きのGit同期準備に失敗しました',
  }
}

export function scheduledDraftNotificationBoundary(outcome) {
  if (outcome?.kind === 'review-ready' && outcome.reviewReady === true) {
    return { kind: 'review-request', shouldSend: true, job: 'ops-mwf-review-request' }
  }
  if (outcome?.kind === 'incident' || outcome?.kind === 'sync-failure') {
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
