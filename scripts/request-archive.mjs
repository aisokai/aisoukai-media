#!/usr/bin/env node
// request-archive.mjs
// 処理済みリクエストを archived 状態にする CLI。
// Human がトリガーする。元メッセージは削除しない（append-only history）。
// status: archived はすべての一覧から省略表示される最終状態。
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
  // --all-done: drafted/ignored 全件を一括アーカイブ
  const allDone  = args.all_done === true

  if (!allDone && (!updateId || Number.isNaN(updateId))) {
    console.error('使い方: npm run request:archive -- <update_id>')
    console.error('         npm run request:archive -- --all-done  （drafted/ignored を一括アーカイブ）')
    process.exit(1)
  }

  if (!existsSync(REQUESTS_PATH)) {
    console.error('エラー: data/article-requests.json が見つかりません')
    process.exit(1)
  }

  const store = JSON.parse(readFileSync(REQUESTS_PATH, 'utf8'))
  const now   = getJstTimestamp()
  const archived = []

  const targets = allDone
    ? store.requests.filter((r) => r.status === 'drafted' || r.status === 'ignored')
    : store.requests.filter((r) => r.update_id === updateId)

  if (targets.length === 0) {
    const msg = allDone
      ? 'アーカイブ対象（drafted/ignored）のリクエストがありません'
      : `update_id ${updateId} のリクエストが見つかりません`
    console.error(`エラー: ${msg}`)
    process.exit(1)
  }

  for (const req of targets) {
    if (req.status === 'archived') continue
    const prevStatus = req.status
    req.status = 'archived'
    req.status_updated_at = now
    req.history = [
      ...(req.history ?? [{ action: 'received', at: req.received_at }]),
      { action: 'archived', at: now },
    ]
    archived.push({ update_id: req.update_id, prev: prevStatus, text: req.text })
  }

  if (archived.length === 0) {
    console.log('アーカイブ対象がありませんでした（すでに archived 済みです）')
    return
  }

  writeFileSync(REQUESTS_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8')

  const BAR = '━'.repeat(52)
  console.log(BAR)
  console.log(`リクエストを archived にしました（${archived.length} 件）`)
  console.log(BAR)
  for (const a of archived) {
    console.log(`  [${a.update_id}] "${a.text.slice(0, 45)}" (${a.prev} → archived)`)
  }
  console.log(BAR)
  console.log()
  console.log('データは data/article-requests.json に保持されています。')
  console.log('request:list では archived は件数のみ表示されます。')
}

main()
