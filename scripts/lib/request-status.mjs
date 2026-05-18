// scripts/lib/request-status.mjs
// 記事リクエストの集計・通知文言を共通化する。
import { existsSync, readFileSync } from 'node:fs'

export function loadRequestStore(requestsPath) {
  if (!existsSync(requestsPath)) return { last_update_id: 0, requests: [] }
  try {
    const parsed = JSON.parse(readFileSync(requestsPath, 'utf8'))
    if (!parsed || !Array.isArray(parsed.requests)) {
      return { last_update_id: 0, requests: [] }
    }
    return parsed
  } catch {
    return { last_update_id: 0, requests: [] }
  }
}

function stripLines(text, maxLen = 35) {
  const oneLine = String(text ?? '').replace(/\s+/g, ' ').trim()
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine
}

export function summarizeRequestStore(store, { maxItems = 3 } = {}) {
  const byStatus = { requested: [], drafted: [], ignored: [], archived: [] }
  for (const request of store.requests ?? []) {
    const bucket = byStatus[request.status]
    if (bucket) bucket.push(request)
  }

  const pending = [...byStatus.requested].sort((a, b) => b.update_id - a.update_id)
  const lines = [
    '📨 記事リクエスト状態サマリー',
    '',
    `🔔 未処理(requested):  ${byStatus.requested.length}件`,
    `📝 下書き生成済み:     ${byStatus.drafted.length}件`,
    `🚫 見送り(ignored):    ${byStatus.ignored.length}件`,
    `📦 アーカイブ済み:     ${byStatus.archived.length}件`,
  ]

  if (pending.length > 0) {
    lines.push('')
    lines.push('未処理リクエスト:')
    for (const [i, request] of pending.slice(0, maxItems).entries()) {
      lines.push(`${i + 1}. [${request.update_id}] "${stripLines(request.text)}"`)
    }
    if (pending.length > maxItems) {
      lines.push(`...他 ${pending.length - maxItems} 件`)
    }
    lines.push('')
    lines.push('次: 下書き生成')
  } else {
    lines.push('')
    lines.push('未処理リクエストはありません。')
  }

  return { byStatus, pending, lines }
}
