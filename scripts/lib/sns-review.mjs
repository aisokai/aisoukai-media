// SNS ドラフト承認/差し戻しの純粋ロジック。
// ファイルIO・queue更新は呼び出し側 CLI (approve-sns-draft.mjs / reject-sns-draft.mjs) が行う。
// この関数の自動実行は禁止 (Human Gate)。CLI は Human が明示実行する。

// 承認/差し戻しを受け付けられる status
export const REVIEWABLE_STATUSES = Object.freeze(['draft', 'pending_review'])

export function applySnsReviewDecision({ data, decision, reviewedBy, reason, timestamp }) {
  if (!REVIEWABLE_STATUSES.includes(data.status)) {
    throw new Error(`status "${data.status}" のドラフトは操作できません (対象: ${REVIEWABLE_STATUSES.join(', ')})`)
  }
  if (decision === 'approve') {
    if (!reviewedBy) throw new Error('--reviewed-by を指定してください')
    return {
      ...data,
      status: 'approved',
      reviewed: true,
      approved_for_manual_post: true,
      reviewed_by: reviewedBy,
      reviewed_at: timestamp,
    }
  }
  if (decision === 'reject') {
    if (!reviewedBy) throw new Error('--reviewed-by を指定してください')
    if (!reason) throw new Error('--reason を指定してください')
    return {
      ...data,
      status: 'rejected',
      reviewed: false,
      approved_for_manual_post: false,
      reviewed_by: reviewedBy,
      rejected_reason: reason,
      rejected_at: timestamp,
    }
  }
  throw new Error(`decision が無効です: "${decision}"`)
}
