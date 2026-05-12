#!/usr/bin/env node
// approve-post.mjs
// Human が実行する承認 CLI。AIが自動実行してはならない。
// 対象記事の reviewed:true / draft:false / reviewed_at を設定する。
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

function getTodayIso() {
  return new Date().toISOString().slice(0, 10)
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key] = next && !next.startsWith('--') ? argv[++i] : true
    } else {
      args._.push(argv[i])
    }
  }
  return args
}

// Date オブジェクトを YYYY-MM-DD 文字列に戻す（gray-matter が ISO 日付文字列を Date に変換するケースへの対処）
function normalizeDates(data) {
  const out = { ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
  }
  return out
}

// YYYY-MM-DD- プレフィックスを除いたスラグ部分と完全一致するファイルを返す。
// 0件 → null、複数件 → throw（呼び出し元でエラー処理する）。
const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

function resolveFilePath(input) {
  const name = input.endsWith('.md') ? input : `${input}.md`
  const direct = join(POSTS_DIR, name)
  if (existsSync(direct)) return direct

  const slug  = input.replace(/\.md$/, '')
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
  const hits  = files.filter((f) => f.replace(DATE_PREFIX_RE, '').replace(/\.md$/, '') === slug)

  if (hits.length === 0) return null
  if (hits.length > 1) {
    throw new Error(
      `スラグ "${slug}" に複数のファイルが一致します:\n${hits.map((f) => `  ${f}`).join('\n')}\nフルファイル名で指定してください`
    )
  }
  return join(POSTS_DIR, hits[0])
}

function main() {
  const args  = parseArgs(process.argv.slice(2))
  const input = String(args.slug ?? args._[0] ?? '').trim()
  const by    = String(args.reviewed_by ?? args.by ?? '').trim()

  if (!input) {
    console.error('使い方: npm run approve:post -- <slug または ファイル名> --reviewed-by "氏名"')
    console.error('   例:  npm run approve:post -- 2026-05-22-topic-20260511-007 --reviewed-by "山田太郎"')
    process.exit(1)
  }

  if (!by) {
    console.error('エラー: --reviewed-by オプションは必須です')
    console.error('   例:  npm run approve:post -- <slug> --reviewed-by "承認者名"')
    process.exit(1)
  }

  let filePath
  try {
    filePath = resolveFilePath(input)
  } catch (e) {
    console.error(`エラー: ${e.message}`)
    process.exit(1)
  }
  if (!filePath) {
    console.error(`エラー: 記事ファイルが見つかりません: "${input}"`)
    console.error('  content/posts/ 内のファイル名またはスラグを確認してください')
    process.exit(1)
  }

  const raw    = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const data   = normalizeDates(parsed.data)

  if (data.reviewed === true) {
    console.warn(`⚠️  この記事はすでに承認済みです。承認情報を更新します: ${filePath}`)
  }

  const today       = getTodayIso()
  data.reviewed     = true
  data.draft        = false
  data.reviewed_at  = today
  data.reviewed_by  = by

  writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')

  console.log('━'.repeat(52))
  console.log('承認完了')
  console.log('━'.repeat(52))
  console.log(`  ファイル    : ${filePath.replace(ROOT + '/', '')}`)
  console.log(`  reviewed    : true`)
  console.log(`  reviewed_at : ${today}`)
  console.log(`  reviewed_by : ${by}`)
  console.log('━'.repeat(52))
  console.log()
  console.log('次のステップ:')
  console.log('  1. npm run validate:publish-ready で公開対象を確認')
  console.log('  2. npm run build でビルドを確認')
}

main()
