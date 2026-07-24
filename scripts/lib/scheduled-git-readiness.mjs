export function parseGitDivergence(output) {
  const fields = String(output ?? '').trim().split(/\s+/)
  if (fields.length !== 2) return null
  const [aheadRaw, behindRaw] = fields
  const ahead = Number(aheadRaw)
  const behind = Number(behindRaw)
  if (!Number.isInteger(ahead) || ahead < 0 || !Number.isInteger(behind) || behind < 0) {
    return null
  }
  return { ahead, behind }
}

export function assessScheduledGitReadiness({
  statusOk,
  dirtyCount = 0,
  fetchOk,
  divergenceOk,
  divergenceOutput,
  indexLockPresent = false,
  branch = '不明',
  head = '不明',
}) {
  const details = { branch, head, ahead: 0, behind: 0, aheadSummary: null }
  if (indexLockPresent) return { ok: false, reason: 'Git index lock が存在するため記事生成を停止します。', details }
  if (!statusOk) return { ok: false, reason: 'git status を確認できません', details }
  if (dirtyCount > 0) return { ok: false, reason: `未commit変更があります（${dirtyCount}件）。先に整理してください。`, details }
  if (!fetchOk) return { ok: false, reason: 'origin/main の取得に失敗しました。安全のため記事生成を停止します。', details }
  if (!divergenceOk) return { ok: false, reason: 'GitHubとの差分確認に失敗しました。安全のため記事生成を停止します。', details }

  const divergence = parseGitDivergence(divergenceOutput)
  if (!divergence) return { ok: false, reason: 'GitHubとの差分確認結果を読めません。安全のため記事生成を停止します。', details }
  details.ahead = divergence.ahead
  details.behind = divergence.behind
  if (divergence.behind > 0 && divergence.ahead > 0) {
    return { ok: false, reason: `GitHub側とローカルの履歴が分岐しています（ahead ${divergence.ahead}, behind ${divergence.behind}）。先に整理してください。`, details }
  }
  if (divergence.behind > 0) {
    return { ok: false, reason: `GitHub側に未取得commitがあります（behind ${divergence.behind}）。先に同期状態を整理してください。`, details }
  }
  if (divergence.ahead > 0) {
    details.aheadSummary = `先行commit: ${head} を含む ${divergence.ahead}件`
    return { ok: true, reason: `Git状態はcleanでorigin/mainと整合しています（ahead ${divergence.ahead}、Human push待ち）`, details }
  }
  return { ok: true, reason: 'Git状態はcleanでorigin/mainと同期済みです', details }
}
