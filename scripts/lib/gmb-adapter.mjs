// gmb-adapter.mjs
// GMB APIアクセスのadapter層。v1では mock のみ。
// 実APIへの差し替えは将来 Batch (先生承認後) で fetchReviews の 'api' 分岐を実装する。
// 投稿・返信送信の関数は意図的に blocked (throw) として置く。AIが誤って呼べないようにする。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './media-queue.mjs'

export const GMB_REVIEWS_DIR = join(ROOT, 'content', 'gmb-reviews')
export const MOCK_REVIEWS_PATH = join(GMB_REVIEWS_DIR, 'sample', 'mock-reviews.json')

export async function fetchReviews({ source = 'mock', mockPath = MOCK_REVIEWS_PATH } = {}) {
  if (source === 'mock') {
    if (!existsSync(mockPath)) return []
    return JSON.parse(readFileSync(mockPath, 'utf8'))
  }
  if (source === 'api') {
    // 読み取り専用。認証情報・location設定が無ければ明示エラーで停止する。
    const { listReviews } = await import('./gmb-api.mjs')
    return listReviews()
  }
  throw new Error(`blocked: 不明なsourceです: "${source}"`)
}

// ── 直接送信の経路は封鎖したまま残す ─────────────────────────────────────
// 外部送信は scripts/lib/media-apply.mjs (approved job + --apply 必須) 経由のみ。
// このadapterから直接送信する経路は存在しない。

export async function postToGmb() {
  throw new Error('blocked: GMB投稿は gmb-apply (approved job + --apply) 経由のみです')
}

export async function replyToReview() {
  throw new Error('blocked: GMB口コミ返信は gmb-apply (approved job + --apply) 経由のみです')
}
