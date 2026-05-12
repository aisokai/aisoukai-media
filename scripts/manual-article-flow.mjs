#!/usr/bin/env node
// manual-article-flow.mjs
// テーマを手動指定して topic 登録 → AI 下書き生成 → Telegram 通知を一括実行する。
// Human がトリガーするフロー自動化スクリプト。approve/publish/push は一切行わない。
// AI が自動実行してはならない。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv-parser.mjs'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const ROOT        = join(__dirname, '..')
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key  = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key] = next && !next.startsWith('--') ? argv[++i] : true
    } else {
      args._.push(argv[i])
    }
  }
  return args
}

function readTopicIds() {
  if (!existsSync(TOPICS_PATH)) return new Set()
  try {
    return new Set(
      parseCsv(readFileSync(TOPICS_PATH, 'utf8'))
        .map((r) => r.id ?? '')
        .filter(Boolean)
    )
  } catch {
    return new Set()
  }
}

// subprocess を実行し、失敗時はそのまま exit する
function run(scriptPath, args = []) {
  try {
    execFileSync(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      env:   process.env,
    })
  } catch {
    // execFileSync は非ゼロ終了で例外を投げるが、stderr は inherit 済み
    process.exit(1)
  }
}

async function main() {
  const args     = parseArgs(process.argv.slice(2))
  const title    = String(args.title    ?? '').trim()
  const category = String(args.category ?? '').trim()
  const date     = String(args.date     ?? '').trim()

  const errs = []
  if (!title)    errs.push('--title が必要です')
  if (!category) errs.push('--category が必要です')
  if (!date)     errs.push('--date が必要です（形式: YYYY-MM-DD）')

  if (errs.length > 0) {
    console.error('エラー:')
    for (const e of errs) console.error(`  ${e}`)
    console.error()
    console.error('使い方:')
    console.error('  npm run article:manual -- --title "タイトル" --category "カテゴリ" --date YYYY-MM-DD')
    console.error()
    console.error('オプション:')
    console.error('  --keyword    検索キーワード（省略可）')
    console.error('  --intent     患者の検索意図（省略可）')
    console.error('  --priority   high / medium / low（デフォルト: medium）')
    console.error('  --risk       医療リスク: high / medium / low（デフォルト: medium）')
    console.error('  --notes      備考（省略可）')
    process.exit(1)
  }

  console.log('━'.repeat(56))
  console.log('手動依頼フロー開始')
  console.log('━'.repeat(56))
  console.log(`  タイトル  : ${title}`)
  console.log(`  カテゴリ  : ${category}`)
  console.log(`  公開予定日: ${date}`)
  console.log()

  // ── STEP 1: topic 登録 ──
  // 登録前後の ID セットを比較して新規 topic ID を特定する
  const idsBefore = readTopicIds()

  console.log('[ STEP 1/3 ]  topic 登録 ...')
  console.log()

  const reqArgs = ['--title', title, '--category', category, '--date', date]
  // 省略可能オプションをそのまま転送する
  for (const key of ['keyword', 'intent', 'priority', 'risk', 'notes']) {
    if (args[key]) reqArgs.push(`--${key}`, String(args[key]))
  }
  run(join(__dirname, 'request-article.mjs'), reqArgs)

  const idsAfter = readTopicIds()
  const newIds   = [...idsAfter].filter((id) => !idsBefore.has(id))
  if (newIds.length === 0) {
    console.error('エラー: topic 登録後に新規 ID が見つかりませんでした')
    process.exit(1)
  }
  const topicId = newIds[0]

  // ── STEP 2: AI 下書き生成 ──
  console.log()
  console.log(`[ STEP 2/3 ]  AI 下書き生成 (${topicId}) ...`)
  console.log()

  run(join(__dirname, 'generate-draft.mjs'), [topicId])

  // ── STEP 3: pending-review 通知 ──
  console.log()
  console.log('[ STEP 3/3 ]  pending-review Telegram 通知 ...')
  console.log()

  run(join(__dirname, 'notify-pending-review.mjs'))

  console.log()
  console.log('━'.repeat(56))
  console.log('✅ 手動依頼フロー完了')
  console.log('━'.repeat(56))
  console.log()
  console.log('次のステップ（Human が実行）:')
  console.log('  1. content/posts/ の下書きを目視確認')
  console.log('  2. npm run dev → http://localhost:3000/admin/pending-review で確認')
  console.log(`  3. npm run approve:post -- <slug> --reviewed-by "氏名"`)
  console.log('  4. npm run build → git push → deploy')
}

main().catch((e) => {
  console.error('エラー:', e.message)
  process.exit(1)
})
