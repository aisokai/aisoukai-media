#!/usr/bin/env node
// reject-post.mjs
// Human が実行する差し戻し CLI。AIが自動実行してはならない。
// reviewed:false を維持し、rejection_reason を記録する。
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

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

function getJstTimestamp() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().replace('Z', '+09:00')
}

const LOGS_DIR = join(ROOT, 'logs')
const LOG_PATH = join(LOGS_DIR, 'review-history.md')

function appendReviewLog(entry) {
  const lines = [`## ${entry.timestamp}`]
  lines.push(`action: ${entry.action}`)
  lines.push(`slug: ${entry.slug}`)
  if (entry.reason)     lines.push(`reason: ${entry.reason}`)
  if (entry.date)       lines.push(`date: ${entry.date}`)
  if (entry.publish_at) lines.push(`publish_at: ${entry.publish_at}`)
  lines.push('')

  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true })
  appendFileSync(LOG_PATH, lines.join('\n') + '\n', 'utf8')
}

function normalizeDates(data) {
  const out = { ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
  }
  return out
}

const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

function resolveFilePath(input) {
  const name   = input.endsWith('.md') ? input : `${input}.md`
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
  const args   = parseArgs(process.argv.slice(2))
  const input  = String(args.slug ?? args._[0] ?? '').trim()
  const reason = String(args.reason ?? args.rejection_reason ?? '').trim()

  if (!input) {
    console.error('使い方: npm run reject:post -- <slug または ファイル名>')
    console.error('   例:  npm run reject:post -- 2026-05-22-topic-20260511-007 --reason "医療情報の根拠が不明確"')
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
    process.exit(1)
  }

  const raw    = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const data   = normalizeDates(parsed.data)

  const slug = filePath.split('/').pop().replace(/\.md$/, '')
  data.reviewed = false
  if (reason) data.rejection_reason = reason

  writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')

  appendReviewLog({
    timestamp: getJstTimestamp(),
    action:    'reject',
    slug,
    reason:    reason || undefined,
    date:      data.date,
    publish_at: data.publish_at,
  })

  console.log('━'.repeat(52))
  console.log('差し戻し完了')
  console.log('━'.repeat(52))
  console.log(`  ファイル         : ${filePath.replace(ROOT + '/', '')}`)
  console.log(`  reviewed         : false`)
  if (reason) console.log(`  rejection_reason : ${reason}`)
  console.log('━'.repeat(52))
  console.log()
  console.log('次のステップ:')
  console.log('  1. 記事本文を修正する')
  console.log('  2. 修正後に npm run approve:post で再承認する')
}

main()
