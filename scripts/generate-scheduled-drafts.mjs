#!/usr/bin/env node
// generate-scheduled-drafts.mjs
// 指定月の approved topic から未生成の記事下書きをまとめて生成する。
// Human が明示実行するための補助 CLI。approve / publish / push は行わない。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv-parser.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')
const POSTS_DIR = join(ROOT, 'content', 'posts')

function getCurrentMonthJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7)
}

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
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

function slugify(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function isGenerated(row) {
  const id = String(row.id ?? '').trim()
  const publishDate = String(row.publish_date ?? '').trim()
  if (!id || !publishDate) return true
  return existsSync(join(POSTS_DIR, `${publishDate}-${slugify(id)}.md`))
}

function priorityRank(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 9
}

function runGenerateDraft(topicId) {
  const result = spawnSync(
    process.execPath,
    [join(__dirname, 'generate-draft.mjs'), topicId],
    { cwd: ROOT, stdio: 'inherit', env: process.env },
  )
  return result.status ?? (result.error ? 1 : 0)
}

function printUsage() {
  console.log('使い方:')
  console.log('  npm run article:batch-scheduled')
  console.log('  npm run article:batch-scheduled -- --month 2026-06')
  console.log('  npm run article:batch-scheduled -- --month 2026-06 --limit 3')
  console.log('  npm run article:batch-scheduled -- --month 2026-06 --dry-run')
}

function main() {
  loadEnv()

  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const month = String(args.month ?? args._[0] ?? getCurrentMonthJst()).trim()
  const dryRun = args.dry_run === true
  const limit = args.limit ? Number(args.limit) : Infinity

  if (!/^\d{4}-\d{2}$/.test(month)) {
    console.error(`エラー: --month は YYYY-MM 形式で指定してください: ${month}`)
    process.exit(1)
  }
  if (!Number.isFinite(limit) && limit !== Infinity || limit <= 0) {
    console.error(`エラー: --limit は 1 以上の数値で指定してください: ${args.limit}`)
    process.exit(1)
  }
  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error('エラー: ANTHROPIC_API_KEY が未設定です')
    process.exit(1)
  }

  const rows = parseCsv(readFileSync(TOPICS_PATH, 'utf8'))
  const targets = rows
    .filter((row) => String(row.status ?? '').trim() === 'approved')
    .filter((row) => String(row.publish_date ?? '').startsWith(`${month}-`))
    .filter((row) => !isGenerated(row))
    .sort((a, b) => {
      const dateCompare = String(a.publish_date ?? '').localeCompare(String(b.publish_date ?? ''))
      if (dateCompare !== 0) return dateCompare
      const priorityCompare = priorityRank(a.priority) - priorityRank(b.priority)
      if (priorityCompare !== 0) return priorityCompare
      return String(a.id ?? '').localeCompare(String(b.id ?? ''))
    })
    .slice(0, limit)

  console.log('━'.repeat(64))
  console.log(`月次一括下書き生成: ${month}`)
  console.log('━'.repeat(64))
  console.log(`対象: ${targets.length} 件${dryRun ? '（dry-run）' : ''}`)
  console.log()

  if (targets.length === 0) {
    console.log('生成対象の approved topic はありません。')
    return
  }

  for (const [index, row] of targets.entries()) {
    const id = String(row.id ?? '').trim()
    console.log(`${index + 1}. ${id}`)
    console.log(`   ${row.publish_date} / ${row.category} / ${row.title_candidate}`)
    if (dryRun) continue

    const status = runGenerateDraft(id)
    if (status !== 0) {
      console.error()
      console.error(`エラー: ${id} の下書き生成に失敗しました。以降の生成を停止します。`)
      process.exit(status)
    }
    console.log()
  }

  if (!dryRun) {
    console.log('次のステップ:')
    console.log('  1. npm run validate:posts')
    console.log('  2. npm run list:pending-review')
    console.log('  3. /admin/pending-review で Human review')
  }
}

main()

