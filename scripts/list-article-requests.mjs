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

function formatDate(isoStr) {
  if (!isoStr) return '----'
  return isoStr.slice(0, 16).replace('T', ' ')
}

function truncate(text, len) {
  return text.length > len ? text.slice(0, len) + '…' : text
}

function main() {
  const BAR  = '━'.repeat(60)
  const DIV  = '─'.repeat(60)

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
    ;(byStatus[r.status ?? 'requested'] ??= []).push(r)
  }

  const requested = byStatus.requested ?? []
  const drafted   = byStatus.drafted   ?? []
  const ignored   = byStatus.ignored   ?? []
  const archived  = byStatus.archived  ?? []

  console.log(BAR)
  console.log(`記事リクエスト一覧  (合計 ${all.length} 件 / last_update_id: ${store.last_update_id ?? 0})`)
  console.log(BAR)

  // ── requested（未処理） ───────────────────────
  if (requested.length > 0) {
    console.log()
    console.log(`📥 requested  (${requested.length} 件) — 未処理・要トリアージ`)
    console.log(DIV)
    for (const r of requested) {
      console.log(`  [${r.update_id}]  ${formatDate(r.received_at)}  @${r.from}`)
      console.log(`    "${truncate(r.text, 55)}"`)
      console.log(`    ▶ 採用: npm run request:draft -- ${r.update_id} --category "カテゴリ" --date YYYY-MM-DD --yes`)
      console.log(`    ▶ 見送: npm run request:ignore -- ${r.update_id} --reason "理由"`)
    }
  }

  // ── drafted（下書き生成済み） ──────────────────
  if (drafted.length > 0) {
    console.log()
    console.log(`📝 drafted  (${drafted.length} 件) — 下書き生成済み・approve 待ち`)
    console.log(DIV)
    for (const r of drafted) {
      console.log(`  [${r.update_id}]  ${formatDate(r.status_updated_at)}  @${r.from}`)
      console.log(`    "${truncate(r.text, 55)}"`)
      if (r.draft_slug) {
        console.log(`    ファイル: content/posts/${r.draft_slug}.md`)
        console.log(`    ▶ 承認: npm run approve:post -- ${r.draft_slug} --reviewed-by "氏名"`)
      }
    }
  }

  // ── ignored（見送り済み） ──────────────────────
  if (ignored.length > 0) {
    console.log()
    console.log(`🚫 ignored  (${ignored.length} 件) — 見送り済み`)
    console.log(DIV)
    for (const r of ignored) {
      console.log(`  [${r.update_id}]  "${truncate(r.text, 55)}"`)
      if (r.ignore_reason) console.log(`    理由: ${r.ignore_reason}`)
    }
    console.log()
    console.log('  drafted/ignored を archived にするには:')
    console.log('    npm run request:archive -- --all-done')
  }

  // ── archived（件数のみ） ───────────────────────
  if (archived.length > 0) {
    console.log()
    console.log(`📦 archived  (${archived.length} 件) — アーカイブ済み（詳細省略）`)
  }

  // ── 空の場合 ──────────────────────────────────
  if (all.length === 0) {
    console.log()
    console.log('  リクエストはまだありません。')
    console.log('  Telegram から記事テーマをメッセージすると受信できます。')
  }

  // ── 次のアクション ────────────────────────────
  console.log()
  console.log(BAR)
  if (requested.length === 0 && drafted.length === 0) {
    console.log('  新しいリクエストを取得: npm run telegram:requests -- --apply')
  } else if (requested.length > 0) {
    console.log(`  未処理 ${requested.length} 件あり。上記の ▶ コマンドでトリアージしてください。`)
  } else {
    console.log(`  下書き ${drafted.length} 件 → approve:post で承認してください。`)
  }
  console.log(BAR)
}

main()
