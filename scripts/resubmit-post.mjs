#!/usr/bin/env node
// resubmit-post.mjs
// Human が実行する再提出 CLI。差し戻し済み記事を pending-review に戻す。
// AIが自動実行してはならない。自動approve/publish しない。
// - rejection_reason を削除してペンディングに戻す
// - 元の reject 履歴はログに残したまま
// - review history に resubmit エントリを追記（append-only）
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')
const LOGS_DIR  = join(ROOT, 'logs')
const LOG_PATH  = join(LOGS_DIR, 'review-history.md')

function getJstTimestamp() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().replace('Z', '+09:00')
}

function appendReviewLog(entry) {
  const lines = [`## ${entry.datetime}`]
  lines.push(`datetime: ${entry.datetime}`)
  lines.push(`action: ${entry.action}`)
  lines.push(`slug: ${entry.slug}`)
  if (entry.reviewed_by) lines.push(`reviewed_by: ${entry.reviewed_by}`)
  if (entry.reason)      lines.push(`reason: ${entry.reason}`)
  if (entry.date)        lines.push(`date: ${entry.date}`)
  if (entry.publish_at)  lines.push(`publish_at: ${entry.publish_at}`)
  lines.push('')

  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true })
  appendFileSync(LOG_PATH, lines.join('\n') + '\n', 'utf8')
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
  const by     = String(args.reviewed_by ?? args.by ?? '').trim()
  const reason = String(args.reason ?? '').trim()

  if (!input) {
    console.error('使い方: npm run resubmit:post -- <slug または ファイル名> --reviewed-by "氏名" --reason "修正内容"')
    console.error('   例:  npm run resubmit:post -- 2026-01-20-cavity-treatment --reviewed-by "三谷" --reason "本文を修正して再提出"')
    process.exit(1)
  }

  if (!by) {
    console.error('エラー: --reviewed-by オプションは必須です')
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

  if (!data.rejection_reason) {
    console.error('エラー: この記事は差し戻し済みではありません（rejection_reason がありません）')
    console.error('  差し戻し済み記事: npm run list:pending-review で確認してください')
    process.exit(1)
  }

  const prevReason = data.rejection_reason
  const slug       = filePath.split('/').pop().replace(/\.md$/, '')

  // 差し戻し状態を解除（rejection_reason を削除）。reviewed:false は維持。
  // 承認メタデータ（reviewed_at / reviewed_by）も stale にならないよう削除。
  delete data.rejection_reason
  data.reviewed    = false
  delete data.reviewed_at
  delete data.reviewed_by
  data.stock_status = 'ready'

  writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')

  appendReviewLog({
    datetime:    getJstTimestamp(),
    action:      'resubmit',
    slug,
    reviewed_by: by,
    reason:      reason || `再提出（元の差し戻し理由: ${prevReason}）`,
    date:        data.date,
    publish_at:  data.publish_at,
  })

  console.log('━'.repeat(52))
  console.log('再提出完了（pending-review に戻しました）')
  console.log('━'.repeat(52))
  console.log(`  ファイル         : ${filePath.replace(ROOT + '/', '')}`)
  console.log(`  reviewed         : false（公開対象外）`)
  console.log(`  rejection_reason : 削除（pending-review に復帰）`)
  if (reason) console.log(`  再提出理由       : ${reason}`)
  console.log(`  resubmit by      : ${by}`)
  console.log('━'.repeat(52))
  console.log()
  console.log('元の差し戻し理由はログに保持されています: logs/review-history.md')
  console.log()
  console.log('次のステップ:')
  console.log('  1. 本文を修正する（必要な場合）')
  console.log('  2. http://localhost:3000/admin/pending-review で内容を確認する')
  console.log(`  3. 問題なければ npm run approve:post -- ${slug} --reviewed-by "氏名" で承認する`)
}

main()
