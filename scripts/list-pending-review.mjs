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

  const pending = []
  for (const file of files) {
    const raw  = readFileSync(join(POSTS_DIR, file), 'utf8')
    const data = normalizeDates(matter(raw).data)
    if (data.reviewed !== true) {
      pending.push({
        file,
        title:        String(data.title ?? '(タイトル未設定)').slice(0, 36),
        category:     String(data.category ?? ''),
        ai_generated: data.ai_generated === true ? '✓' : '-',
        generated_at: String(data.generated_at ?? data.date ?? ''),
        rejection:    data.rejection_reason ? `差し戻し: ${String(data.rejection_reason).slice(0, 24)}` : '',
      })
    }
  }

  const BAR = '━'.repeat(100)
  console.log(BAR)
  console.log(`Human review 待ち記事一覧  (${pending.length} 件)`)
  console.log(BAR)

  if (pending.length === 0) {
    console.log('✅ レビュー待ちの記事はありません。')
    process.exit(0)
  }

  console.log(
    `${pad('ファイル', 42)}  ${pad('カテゴリ', 10)}  ${pad('AI生成', 6)}  ${pad('生成日', 10)}  タイトル`
  )
  console.log('─'.repeat(100))

  for (const p of pending) {
    console.log(
      `${pad(p.file, 42)}  ${pad(p.category, 10)}  ${pad(p.ai_generated, 6)}  ${pad(p.generated_at, 10)}  ${p.title}`
    )
    if (p.rejection) {
      console.log(`${''.padStart(42)}  ⚠️  ${p.rejection}`)
    }
  }

  console.log(BAR)
  console.log()
  console.log('承認: npm run approve:post -- <slug> [--reviewed-by "氏名"]')
  console.log('却下: npm run reject:post  -- <slug> [--reason "理由"]')
}

main()
