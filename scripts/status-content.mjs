#!/usr/bin/env node
// status-content.mjs
// コンテンツ全体の現在状態を集計して表示するヘルスチェック CLI。
// 読み取り専用。ファイルは変更しない。Human / AI 双方が実行可能。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POSTS_DIR = join(__dirname, '..', 'content', 'posts')

function toDateStr(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

function main() {
  const today = new Date().toISOString().slice(0, 10)
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
    .toISOString().slice(0, 16).replace('T', ' ') + ' JST'

  if (!existsSync(POSTS_DIR)) {
    console.log('⚠️  content/posts/ が存在しません')
    return
  }

  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
  if (files.length === 0) {
    console.log('⚠️  記事が存在しません')
    return
  }

  // 集計バケット
  const live          = []   // reviewed:true && !draft && !future → 現在公開中
  const scheduled     = []   // reviewed:true && future            → 公開予定（date/publish_at が未来）
  const pendingNow    = []   // reviewed:false && !reject && !future → 今すぐ approve 可能
  const pendingFuture = []   // reviewed:false && !reject && future  → 将来 approve 予定
  const rejected      = []   // reviewed:false && rejection_reason あり

  for (const f of files) {
    const raw  = readFileSync(join(POSTS_DIR, f), 'utf8')
    const { data } = matter(raw)

    const reviewed    = data.reviewed === true
    const draft       = data.draft    === true
    const hasReject   = !!data.rejection_reason
    const publishAt   = data.publish_at ? toDateStr(data.publish_at) : ''
    const dateStr     = toDateStr(data.date)
    const effectiveDate = publishAt || dateStr
    const isFuture    = effectiveDate > today
    const slug        = f.replace(/\.md$/, '')
    const title       = String(data.title ?? '（タイトル未設定）')
    const entry       = { slug, title, date: effectiveDate }

    if (reviewed) {
      if (!draft && !isFuture) live.push(entry)
      else if (isFuture)       scheduled.push(entry)
    } else {
      if (hasReject)           rejected.push(entry)
      else if (isFuture)       pendingFuture.push(entry)
      else                     pendingNow.push(entry)
    }
  }

  const total = files.length
  const BAR   = '━'.repeat(56)

  console.log(BAR)
  console.log(`コンテンツ状態ダッシュボード  (${nowJst})`)
  console.log(BAR)
  console.log()
  console.log(`  合計                 : ${String(total).padStart(3)} 件`)
  console.log()
  console.log(`  ✅ 公開中            : ${String(live.length).padStart(3)} 件`)
  console.log(`  📅 公開予定(reviewed): ${String(scheduled.length).padStart(3)} 件  ← 日付到達で自動公開`)
  console.log(`  📝 review待ち        : ${String(pendingNow.length).padStart(3)} 件  ← approve で公開可能`)
  console.log(`  📅 review待ち(future): ${String(pendingFuture.length).padStart(3)} 件  ← approve 後に日付待ち`)
  console.log(`  🚫 差し戻し済み      : ${String(rejected.length).padStart(3)} 件`)
  console.log()

  if (live.length > 0) {
    console.log('公開中の記事:')
    for (const a of live) {
      const t = a.title.length > 42 ? a.title.slice(0, 42) + '…' : a.title
      console.log(`  ✅ [${a.date}] ${t}`)
    }
    console.log()
  }

  if (scheduled.length > 0) {
    console.log('公開予定の記事 (reviewed:true / future):')
    for (const a of scheduled) {
      const t = a.title.length > 42 ? a.title.slice(0, 42) + '…' : a.title
      console.log(`  📅 [${a.date}] ${t}`)
    }
    console.log()
  }

  if (pendingNow.length > 0) {
    console.log('review待ちの記事 (今すぐ approve 可能):')
    for (const a of pendingNow) {
      const t = a.title.length > 42 ? a.title.slice(0, 42) + '…' : a.title
      console.log(`  📝 [${a.date}] ${t}`)
    }
    console.log()
  }

  // ヒント
  console.log('次のアクション:')
  if (pendingNow.length > 0) {
    console.log(`  · npm run list:pending-review  — review待ち ${pendingNow.length} 件の詳細`)
    console.log('  · npm run approve:post -- <slug> --reviewed-by "氏名"  — 承認')
  }
  if (live.length > 0 || scheduled.length > 0) {
    console.log('  · npm run build  — ビルド（→ push / deploy は Human が手動実行）')
  }
  if (pendingNow.length === 0 && live.length === 0) {
    console.log('  · 記事を追加または approve して公開してください')
  }
  console.log(BAR)
}

main()
