#!/usr/bin/env node
// list-article-requests.mjs
// data/article-requests.json の記事リクエスト一覧を表示する。
// 読み取り専用。ファイルは変更しない。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname     = dirname(fileURLToPath(import.meta.url))
const ROOT          = join(__dirname, '..')
const REQUESTS_PATH = join(ROOT, 'data', 'article-requests.json')

const STATUS_LABEL = {
  requested: '📥 requested',
  drafted:   '📝 drafted  ',
  ignored:   '🚫 ignored  ',
}

function formatDate(isoStr) {
  if (!isoStr) return '----'
  return isoStr.slice(0, 16).replace('T', ' ')
}

function main() {
  const BAR = '━'.repeat(56)

  if (!existsSync(REQUESTS_PATH)) {
    console.log(BAR)
    console.log('記事リクエスト一覧')
    console.log(BAR)
    console.log()
    console.log('  data/article-requests.json が存在しません。')
    console.log('  npm run telegram:requests -- --apply で取得してください。')
    console.log()
    return
  }

  let store
  try {
    store = JSON.parse(readFileSync(REQUESTS_PATH, 'utf8'))
  } catch (e) {
    console.error(`パースエラー: ${e.message}`)
    process.exit(1)
  }

  const all      = store.requests ?? []
  const byStatus = {}
  for (const r of all) {
    const s = r.status ?? 'requested'
    ;(byStatus[s] ??= []).push(r)
  }

  console.log(BAR)
  console.log(`記事リクエスト一覧  (合計 ${all.length} 件 / last_update_id: ${store.last_update_id ?? 0})`)
  console.log(BAR)
  console.log()

  const ORDER = ['requested', 'drafted', 'ignored']
  for (const status of ORDER) {
    const items = byStatus[status] ?? []
    if (items.length === 0) continue

    const label = STATUS_LABEL[status] ?? status
    console.log(`${label}  (${items.length} 件)`)
    console.log('─'.repeat(48))
    for (const r of items) {
      const preview = r.text.length > 50 ? r.text.slice(0, 50) + '…' : r.text
      console.log(`  [${r.update_id}] ${formatDate(r.received_at)}  @${r.from}`)
      console.log(`        "${preview}"`)
    }
    console.log()
  }

  const other = Object.keys(byStatus).filter((s) => !ORDER.includes(s))
  for (const status of other) {
    const items = byStatus[status]
    console.log(`${status}  (${items.length} 件)`)
    for (const r of items) {
      console.log(`  [${r.update_id}] "${r.text.slice(0, 50)}"`)
    }
    console.log()
  }

  if (all.length === 0) {
    console.log('  リクエストはまだありません。')
    console.log('  Telegram から記事テーマをメッセージすると受信できます。')
    console.log()
  }

  console.log('次のアクション:')
  const requested = byStatus.requested ?? []
  if (requested.length > 0) {
    console.log(`  · npm run request:article -- --title "..." --category "..." --date YYYY-MM-DD`)
    console.log('     で記事ネタ CSV に追加 → generate:draft で下書き生成')
  } else {
    console.log('  · npm run telegram:requests -- --apply で最新リクエストを取得')
  }
  console.log(BAR)
}

main()
