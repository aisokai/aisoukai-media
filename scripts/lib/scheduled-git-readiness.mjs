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
  if (indexLockPresent) return { ok: false, reason: 'index lock が存在するためローカル反映を保留します。', details }
  if (!statusOk) return { ok: false, reason: 'ローカル状態を確認できないため反映を保留します。', details }
  if (dirtyCount > 0) return { ok: false, reason: `管理対象外の変更があります（${dirtyCount}件）。ローカル反映を保留します。`, details }
  if (!fetchOk) return { ok: false, reason: 'origin/main の取得に失敗したためローカル反映を保留します。', details }
  if (!divergenceOk) return { ok: false, reason: 'origin/main との差分確認に失敗したためローカル反映を保留します。', details }

  const divergence = parseGitDivergence(divergenceOutput)
  if (!divergence) return { ok: false, reason: 'origin/main との差分確認結果を読めないためローカル反映を保留します。', details }
  details.ahead = divergence.ahead
  details.behind = divergence.behind
  if (divergence.behind > 0 && divergence.ahead > 0) {
    return { ok: false, reason: `origin/main と履歴が分岐しています（ahead ${divergence.ahead}, behind ${divergence.behind}）。ローカル反映を保留します。`, details }
  }
  if (divergence.behind > 0) {
    return { ok: false, reason: `origin/main に未取得commitがあります（behind ${divergence.behind}）。ローカル反映を保留します。`, details }
  }
  if (divergence.ahead > 0) {
    details.aheadSummary = `先行commit: ${head} を含む ${divergence.ahead}件`
    return { ok: false, reason: `未反映のlocal commitがあります（ahead ${divergence.ahead}）。新しいdraftのローカル反映を保留します。`, details }
  }
  return { ok: true, reason: 'ローカル反映可能です', details }
}
