#!/usr/bin/env node
// scheduled-article-flow.mjs
// 定期提案フロー: 未処理の承認済み topic を 1 件選択（なければ research 候補から補充）
// → AI 下書き生成 → Telegram 通知。
// cron 化の前段として手動実行できるスクリプト。approve/publish/push は一切行わない。
// AI が自動実行してはならない。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv-parser.mjs'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const ROOT        = join(__dirname, '..')
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')
const POSTS_DIR   = join(ROOT, 'content', 'posts')
const RESEARCH_DIR = join(ROOT, 'data', 'research')

const TODAY = new Date().toLocaleDateString('sv-SE')

const CSV_COLUMNS = [
  'id', 'discovered_at', 'source_type', 'source_url', 'topic',
  'title_candidate', 'category', 'target_keyword', 'patient_intent',
  'priority', 'medical_risk', 'status', 'publish_date', 'notes',
]

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

// .env.local を読んで process.env に反映（既存の環境変数は上書きしない）
function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function slugify(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function csvEscape(value) {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// subprocess を実行し、失敗時はそのまま exit する
function run(scriptPath, args = []) {
  try {
    execFileSync(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      env:   process.env,
    })
  } catch {
    process.exit(1)
  }
}

// CSV から全行を読む（存在しない場合は空配列）
function readCsvRows() {
  if (!existsSync(TOPICS_PATH)) return []
  try {
    return parseCsv(readFileSync(TOPICS_PATH, 'utf8'))
  } catch (err) {
    console.error(`エラー: CSV の読み込みに失敗しました: ${err.message}`)
    process.exit(1)
  }
}

// status='approved' でかつ対応する下書きファイルがまだ存在しない topic 行を探す
function findPendingApprovedTopic(rows) {
  return rows
    .filter((r) => (r.status ?? '').trim() === 'approved')
    .filter((r) => {
      const id          = (r.id ?? '').trim()
      const publishDate = (r.publish_date ?? '').trim()
      if (!id || !publishDate) return false
      const filename = `${publishDate}-${slugify(id)}.md`
      return !existsSync(join(POSTS_DIR, filename))
    })
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99
      const pb = PRIORITY_ORDER[b.priority] ?? 99
      return pa !== pb ? pa - pb : (a.publish_date ?? '') < (b.publish_date ?? '') ? -1 : 1
    })
}

// research:trends を実行して最新の候補 JSON を返す
function runResearchTrends() {
  console.log('  research:trends を実行して候補を生成します ...')
  mkdirSync(RESEARCH_DIR, { recursive: true })
  run(join(__dirname, 'research-trends.mjs'))

  const files = readdirSync(RESEARCH_DIR)
    .filter((f) => f.endsWith('-trends.json'))
    .sort()
  if (files.length === 0) return null

  try {
    return JSON.parse(readFileSync(join(RESEARCH_DIR, files[files.length - 1]), 'utf8'))
  } catch {
    return null
  }
}

// research 候補から未登録の 1 件を CSV に approved で追記し、topic_id を返す
function importResearchCandidate(candidates, existingRows) {
  const existingTitles = new Set(existingRows.map((r) => (r.title_candidate ?? '').trim()))

  const candidate = candidates.find(
    (c) => !existingTitles.has((c.title_candidate ?? '').trim())
  )
  if (!candidate) return null

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

  // 公開予定日は常に今日から 14 日後で再計算する（JSON の publish_date が古い場合を考慮）
  const publishDate = addDays(TODAY, 14)

  const newRow = {
    id:              topicId,
    discovered_at:   TODAY,
    source_type:     candidate.source_type ?? 'trend',
    source_url:      candidate.source_url  ?? '',
    topic:           candidate.topic       ?? candidate.title_candidate ?? '',
    title_candidate: candidate.title_candidate ?? '',
    category:        candidate.category    ?? '',
    target_keyword:  candidate.target_keyword ?? '',
    patient_intent:  candidate.patient_intent ?? '',
    priority:        candidate.priority    ?? 'medium',
    medical_risk:    candidate.medical_risk ?? 'low',
    // scheduled フローでは approved で直接登録する（human が cron 起動を承認したことと同義）
    status:          'approved',
    publish_date:    publishDate,
    notes:           'scheduled-flow 自動登録',
  }

  const line       = CSV_COLUMNS.map((k) => csvEscape(newRow[k])).join(',')
  let csvContent   = existsSync(TOPICS_PATH) ? readFileSync(TOPICS_PATH, 'utf8') : ''
  if (csvContent && !csvContent.endsWith('\n')) csvContent += '\n'
  writeFileSync(TOPICS_PATH, csvContent + line + '\n', 'utf8')

  console.log(`  research 候補をインポートしました: ${topicId}`)
  console.log(`  タイトル  : ${newRow.title_candidate}`)
  console.log(`  カテゴリ  : ${newRow.category}`)
  console.log(`  公開予定日: ${publishDate}`)

  return topicId
}

async function main() {
  loadEnv()

  console.log('━'.repeat(56))
  console.log('定期提案フロー開始')
  console.log('━'.repeat(56))
  console.log()

  // ── STEP 1: 候補 topic を決定する ──
  console.log('[ STEP 1/3 ]  候補 topic 選択 ...')
  console.log()

  let topicId = null
  let rows    = readCsvRows()

  // 1-a: approved で下書き未生成の topic を探す（優先度 high → medium → low）
  const pending = findPendingApprovedTopic(rows)
  if (pending.length > 0) {
    const picked = pending[0]
    topicId = (picked.id ?? '').trim()
    console.log(`  既存の承認済み topic を使用します`)
    console.log(`  topic_id  : ${topicId}`)
    console.log(`  タイトル  : ${picked.title_candidate}`)
    console.log(`  優先度    : ${picked.priority}`)
    console.log(`  公開予定日: ${picked.publish_date}`)
  } else {
    // 1-b: 承認済み pending がない場合は research:trends から候補を補充する
    console.log(`  承認済みの未処理 topic がありません。research:trends で補充します ...`)
    console.log()

    const research = runResearchTrends()
    if (!research || !research.candidates?.length) {
      console.error('エラー: research:trends の候補を取得できませんでした')
      process.exit(1)
    }

    rows    = readCsvRows() // research:trends 後に再読み込み
    topicId = importResearchCandidate(research.candidates, rows)

    if (!topicId) {
      console.error('エラー: 未登録の research 候補が見つかりませんでした')
      console.error('  data/article-topics.sample.csv に全候補が既に登録されています')
      console.error('  npm run request:article で新しいテーマを追加してください')
      process.exit(1)
    }
  }

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
  console.log('✅ 定期提案フロー完了')
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
