export function shouldSendDraftReviewNotification(draftSyncResult) {
  return draftSyncResult?.ok !== false
}
