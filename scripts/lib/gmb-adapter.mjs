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
    throw new Error('blocked: GMB API読み取りはv1では未実装です (Batch 5以降・先生承認後)')
  }
  throw new Error(`blocked: 不明なsourceです: "${source}"`)
}

// ── 以下は将来用プレースホルダ。実装してはならない (Human Gate対象の外部送信) ──

export async function postToGmb() {
  throw new Error('blocked: GMB投稿はHuman Gate対象です。v1では実装されていません')
}

export async function replyToReview() {
  throw new Error('blocked: GMB口コミ返信送信はHuman Gate対象です。v1では実装されていません')
}
