#!/usr/bin/env node
// status-content.mjs
// コンテンツ全体の現在状態を集計して表示するヘルスチェック CLI。
// 読み取り専用。ファイルは変更しない。Human / AI 双方が実行可能。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReviewSummary, loadContentStatus } from './lib/content-status.mjs'
import { resolveNotificationSiteUrl } from './lib/site-url.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POSTS_DIR = join(__dirname, '..', 'content', 'posts')

function main() {
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
    .toISOString().slice(0, 16).replace('T', ' ') + ' JST'

  const status = loadContentStatus(POSTS_DIR)
  if (
    status.live.length === 0 &&
    status.scheduled.length === 0 &&
    status.pending.length === 0 &&
    status.pendingFuture.length === 0 &&
    status.rejected.length === 0
  ) {
    console.log('⚠️  記事が存在しません')
    return
  }

  const BAR   = '━'.repeat(56)

  console.log(BAR)
  console.log(`コンテンツ状態ダッシュボード  (${nowJst})`)
  console.log(BAR)
  console.log()
  console.log(buildReviewSummary(status, {
    dashboardUrl: `${resolveNotificationSiteUrl()}/admin/pending-review`,
    heading: 'コンテンツ状態ダッシュボード',
    maxItems: 5,
    noPendingText: '承認待ちはありません',
    showNextAction: true,
  }))
  console.log(BAR)
}

main()
