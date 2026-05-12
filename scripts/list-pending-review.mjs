#!/usr/bin/env node
// list-pending-review.mjs
// reviewed:false の記事一覧を表示する。Human review の作業リストとして使用する。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

function normalizeDates(data) {
  const out = { ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
  }
  return out
}

function pad(str, len) {
  const s = String(str ?? '')
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length)
}

function main() {
  let files
  try {
    files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort()
  } catch {
    console.error('エラー: content/posts/ が見つかりません')
    process.exit(1)
  }

  const pending  = []
  const rejected = []

  for (const file of files) {
    const raw  = readFileSync(join(POSTS_DIR, file), 'utf8')
    const data = normalizeDates(matter(raw).data)
    if (data.reviewed !== true) {
      const entry = {
        file,
        title:        String(data.title ?? '(タイトル未設定)').slice(0, 36),
        category:     String(data.category ?? ''),
        ai_generated: data.ai_generated === true ? '✓' : '-',
        date:         String(data.publish_at ?? data.date ?? ''),
        rejection:    data.rejection_reason ? String(data.rejection_reason) : '',
      }
      if (entry.rejection) {
        rejected.push(entry)
      } else {
        pending.push(entry)
      }
    }
  }

  const BAR = '━'.repeat(100)

  // ── 通常 pending ──
  console.log(BAR)
  console.log(`Human review 待ち記事一覧  (${pending.length} 件)`)
  console.log(BAR)

  if (pending.length === 0) {
    console.log('✅ レビュー待ちの記事はありません。')
  } else {
    console.log(
      `${pad('ファイル', 42)}  ${pad('カテゴリ', 10)}  ${pad('AI生成', 6)}  ${pad('公開予定日', 10)}  タイトル`
    )
    console.log('─'.repeat(100))
    for (const p of pending) {
      console.log(
        `${pad(p.file, 42)}  ${pad(p.category, 10)}  ${pad(p.ai_generated, 6)}  ${pad(p.date, 10)}  ${p.title}`
      )
    }
    console.log(BAR)
    console.log()
    console.log('承認: npm run approve:post -- <slug> --reviewed-by "氏名"')
    console.log('却下: npm run reject:post  -- <slug> --reason "理由"')
  }

  // ── 差し戻し済み ──
  if (rejected.length > 0) {
    console.log()
    console.log('─'.repeat(100))
    console.log(`差し戻し済み  (${rejected.length} 件)  ※ 修正後に再度 generate:draft または approve を実行`)
    console.log('─'.repeat(100))
    for (const r of rejected) {
      console.log(`  ${pad(r.file, 46)}  理由: ${r.rejection.slice(0, 40)}`)
    }
    console.log('─'.repeat(100))
  }
}

main()
