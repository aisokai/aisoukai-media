#!/usr/bin/env node
// selected の月次ネタ候補を data/article-topics.sample.csv に追加する。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv-parser.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CANDIDATE_DIR = join(ROOT, 'data', 'monthly-topic-candidates')
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')
const CSV_COLUMNS = [
  'id',
  'discovered_at',
  'source_type',
  'source_url',
  'topic',
  'title_candidate',
  'category',
  'target_keyword',
  'patient_intent',
  'priority',
  'medical_risk',
  'status',
  'publish_date',
  'notes',
]

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key] = next && !next.startsWith('--') ? argv[++i] : true
    }
  }
  return args
}

function nextMonth(today = new Date()) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 7)
}

function csvEscape(value) {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

function todayJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const month = String(args.month ?? nextMonth()).trim()
  const yes = args.yes === true
  const candidatePath = join(CANDIDATE_DIR, `${month}.json`)

  if (!existsSync(candidatePath)) {
    console.error(`エラー: data/monthly-topic-candidates/${month}.json が見つかりません`)
    process.exit(1)
  }

  const file = JSON.parse(readFileSync(candidatePath, 'utf8'))
  const selected = file.topics.filter((topic) => topic.status === 'selected')
  if (selected.length === 0) {
    console.error('エラー: 今月採用のネタ候補がありません')
    process.exit(1)
  }
  if (selected.length > file.targetPostCount) {
    console.error(`エラー: 今月採用が多すぎます: ${selected.length}/${file.targetPostCount}`)
    process.exit(1)
  }

  const existingRows = existsSync(TOPICS_PATH) ? parseCsv(readFileSync(TOPICS_PATH, 'utf8')) : []
  const existingIds = new Set(existingRows.map((row) => String(row.id ?? '').trim()))
  const discoveredAt = todayJst()
  const lines = []

  for (const topic of selected) {
    const id = `MONTHLY-${topic.id.replace(/-/g, '').toUpperCase()}`
    if (existingIds.has(id)) continue
    lines.push(CSV_COLUMNS.map((key) => csvEscape({
      id,
      discovered_at: discoveredAt,
      source_type: topic.sourceType,
      source_url: '',
      topic: topic.title,
      title_candidate: topic.title,
      category: topic.category,
      target_keyword: topic.targetKeyword,
      patient_intent: topic.searchIntent,
      priority: topic.priority,
      medical_risk: topic.medicalRisk,
      status: 'approved',
      publish_date: topic.recommendedPublishDate,
      notes: `月次ネタ候補 ${file.month} / MWF 月曜・水曜・金曜の週3投稿枠`,
    }[key])).join(','))
  }

  console.log(`月次ネタ候補 ${month}: selected ${selected.length}/${file.targetPostCount}`)
  console.log(`CSV追加予定: ${lines.length}件`)
  if (!yes) {
    console.log('DRY-RUNです。CSVへ追加するには --yes を付けてください。')
    return
  }

  if (lines.length === 0) {
    console.log('追加対象はありません。既にCSVへ追加済みです。')
    return
  }

  let csv = existsSync(TOPICS_PATH) ? readFileSync(TOPICS_PATH, 'utf8') : `${CSV_COLUMNS.join(',')}\n`
  if (!csv.endsWith('\n')) csv += '\n'
  writeFileSync(TOPICS_PATH, `${csv}${lines.join('\n')}\n`, 'utf8')
  console.log('✅ selected 候補を article-topics CSV に追加しました')
}

main()
