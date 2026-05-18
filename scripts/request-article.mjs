#!/usr/bin/env node
// request-article.mjs
// Human が手動でテーマを指定し、記事ネタ CSV に 1 件追加する CLI。
// 追加後は generate:draft で AI 下書きを生成できる。
// AI が自動実行してはならない。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv-parser.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT       = join(__dirname, '..')
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')

const VALID_CATEGORIES = new Set([
  '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
  '親知らず', 'インプラント', 'その他', 'お知らせ',
])

const VALID_PRIORITIES   = new Set(['high', 'medium', 'low'])
const VALID_MEDICAL_RISK = new Set(['high', 'medium', 'low'])

const CSV_COLUMNS = [
  'id', 'discovered_at', 'source_type', 'source_url', 'topic',
  'title_candidate', 'category', 'target_keyword', 'patient_intent',
  'priority', 'medical_risk', 'status', 'publish_date', 'notes',
]

const TODAY = new Date().toLocaleDateString('sv-SE')

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

function csvEscape(value) {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

function isValidDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  const title    = String(args.title    ?? '').trim()
  const category = String(args.category ?? '').trim()
  const date     = String(args.date     ?? '').trim()
  // 省略可能なオプション（generate:draft 必須フィールドのデフォルト値を自動補完）
  const keyword  = String(args.keyword  ?? title).trim()
  const intent   = String(args.intent   ?? `${title}について詳しく知りたい`).trim()
  const priority = String(args.priority ?? 'medium').trim()
  const risk     = String(args.risk ?? args.medical_risk ?? 'medium').trim()
  const notes    = String(args.notes    ?? '手動依頼').trim()

  // 必須フィールドと値の検証
  const errors = []
  if (!title)    errors.push('--title が必要です')
  if (!category) errors.push('--category が必要です')
  if (!date)     errors.push('--date が必要です（形式: YYYY-MM-DD）')

  if (category && !VALID_CATEGORIES.has(category)) {
    errors.push(`--category が無効です: "${category}"`)
    errors.push(`  有効値: ${[...VALID_CATEGORIES].join(', ')}`)
  }
  if (date && !isValidDate(date)) {
    errors.push(`--date の形式が不正です: "${date}"（YYYY-MM-DD が必要）`)
  }
  if (!VALID_PRIORITIES.has(priority)) {
    errors.push(`--priority が無効です: "${priority}"（high / medium / low）`)
  }
  if (!VALID_MEDICAL_RISK.has(risk)) {
    errors.push(`--risk が無効です: "${risk}"（high / medium / low）`)
  }

  if (errors.length > 0) {
    console.error('エラー:')
    for (const e of errors) console.error(`  ${e}`)
    console.error()
    console.error('使い方:')
    console.error('  npm run request:article -- --title "タイトル" --category "カテゴリ" --date YYYY-MM-DD')
    console.error()
    console.error('オプション:')
    console.error('  --keyword    検索キーワード（省略時は title から導出）')
    console.error('  --intent     患者の検索意図（省略時は自動生成）')
    console.error('  --priority   high / medium / low（デフォルト: medium）')
    console.error('  --risk       医療リスク: high / medium / low（デフォルト: medium）')
    console.error('  --notes      備考（デフォルト: 手動依頼）')
    process.exit(1)
  }

  // 既存 CSV を読んで title_candidate 重複チェック
  let existingRows = []
  if (existsSync(TOPICS_PATH)) {
    try {
      existingRows = parseCsv(readFileSync(TOPICS_PATH, 'utf8'))
    } catch (err) {
      console.error(`エラー: CSV の読み込みに失敗しました: ${err.message}`)
      process.exit(1)
    }
  }

  const dup = existingRows.find((r) => (r.title_candidate ?? '').trim() === title)
  if (dup) {
    console.error('エラー: 同じ title_candidate が既に CSV に存在します')
    console.error(`  既存 ID : ${dup.id}`)
    console.error(`  タイトル: ${title}`)
    process.exit(1)
  }

  // topic ID 自動採番: TOPIC-YYYYMMDD-NNN
  const datePart = TODAY.replace(/-/g, '')
  const prefix   = `TOPIC-${datePart}-`
  const usedNums = existingRows
    .map((r) => r.id ?? '')
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
  const nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : 1
  const topicId = `${prefix}${String(nextNum).padStart(3, '0')}`

  const newRow = {
    id:              topicId,
    discovered_at:   TODAY,
    source_type:     'clinic',
    source_url:      '',
    topic:           title,
    title_candidate: title,
    category,
    target_keyword:  keyword,
    patient_intent:  intent,
    priority,
    medical_risk:    risk,
    status:          'approved',
    publish_date:    date,
    notes,
  }

  const line = CSV_COLUMNS.map((k) => csvEscape(newRow[k])).join(',')

  // CSV 末尾に追記（末尾改行がなければ補完）
  let csvContent = existsSync(TOPICS_PATH) ? readFileSync(TOPICS_PATH, 'utf8') : ''
  if (csvContent && !csvContent.endsWith('\n')) csvContent += '\n'
  writeFileSync(TOPICS_PATH, csvContent + line + '\n', 'utf8')

  console.log('━'.repeat(52))
  console.log('記事リクエスト追加完了')
  console.log('━'.repeat(52))
  console.log(`  topic_id   : ${topicId}`)
  console.log(`  タイトル   : ${title}`)
  console.log(`  カテゴリ   : ${category}`)
  console.log(`  公開予定日 : ${date}`)
  console.log(`  status     : approved`)
  console.log(`  追記先     : data/article-topics.sample.csv`)
  console.log('━'.repeat(52))
  console.log()
  console.log('次:')
  console.log('  validate:topics')
  console.log(`  generate:draft -- ${topicId}`)
}

main()
