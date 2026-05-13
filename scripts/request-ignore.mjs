#!/usr/bin/env node
// request-ignore.mjs
// Telegram 記事リクエストを ignored 状態にする CLI。
// Human がトリガーする。元メッセージは削除しない（append-only history）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname     = dirname(fileURLToPath(import.meta.url))
const ROOT          = join(__dirname, '..')
const REQUESTS_PATH = join(ROOT, 'data', 'article-requests.json')

function getJstTimestamp() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().replace('Z', '+09:00')
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key  = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key]  = next && !next.startsWith('--') ? argv[++i] : true
    } else {
      args._.push(argv[i])
    }
  }
  return args
}

function main() {
  const args     = parseArgs(process.argv.slice(2))
  const updateId = parseInt(String(args.update_id ?? args._[0] ?? ''), 10)
  const reason   = String(args.reason ?? '').trim()

  if (!updateId || Number.isNaN(updateId)) {
    console.error('使い方: npm run request:ignore -- <update_id> --reason "理由"')
    console.error('   例:  npm run request:ignore -- 145026171 --reason "重複テーマのため見送り"')
    process.exit(1)
  }

  if (!existsSync(REQUESTS_PATH)) {
    console.error('エラー: data/article-requests.json が見つかりません')
    process.exit(1)
  }

  const store   = JSON.parse(readFileSync(REQUESTS_PATH, 'utf8'))
  const request = store.requests.find((r) => r.update_id === updateId)

  if (!request) {
    console.error(`エラー: update_id ${updateId} のリクエストが見つかりません`)
    process.exit(1)
  }

  if (request.status === 'archived') {
    console.error('エラー: archived 済みのリクエストは変更できません')
    process.exit(1)
  }

  const now = getJstTimestamp()
  const prevStatus       = request.status
  request.status         = 'ignored'
  request.status_updated_at = now
  if (reason) request.ignore_reason = reason
  request.history = [
    ...(request.history ?? [{ action: 'received', at: request.received_at }]),
    { action: 'ignored', at: now, ...(reason ? { reason } : {}) },
  ]

  writeFileSync(REQUESTS_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8')

  const BAR = '━'.repeat(52)
  console.log(BAR)
  console.log('リクエストを ignored にしました')
  console.log(BAR)
  console.log(`  update_id   : ${updateId}`)
  console.log(`  text        : "${request.text.slice(0, 50)}"`)
  console.log(`  status      : ${prevStatus} → ignored`)
  if (reason) console.log(`  reason      : ${reason}`)
  console.log(BAR)
  console.log()
  console.log('元のメッセージは data/article-requests.json に保持されています。')
}

main()
