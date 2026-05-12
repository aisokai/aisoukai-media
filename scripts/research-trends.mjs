#!/usr/bin/env node
// research-trends.mjs
// 外部APIを呼ばずに歯科記事候補をローカルで生成し、JSON と CSV に書き出す dry-run CLI。
// なぜ dry-run か: AI hallucination を防ぐため、生成物は必ず人間がレビューしてから
// data/article-topics.sample.csv に手動で追記する運用を前提としているため。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MEDICAL_SAFETY_RULES,
  CSV_HEADERS,
} from './prompts/research-trend-prompt.mjs'
import { parseCsv } from './csv-parser.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RESEARCH_DIR = join(ROOT, 'data', 'research')

// 今日の日付を YYYY-MM-DD 形式で取得
// なぜ: 出力ファイル名と各候補の researched_at に使用するため
const TODAY = new Date().toLocaleDateString('sv-SE') // sv-SE ロケールは YYYY-MM-DD を返す

// 想定公開日: 今日から14日後（候補レビュー期間を考慮した目安）
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const PUBLISH_DATE = addDays(TODAY, 14)

// 静的サンプル候補（5件）
// なぜ静的か: dry-run のため外部API呼び出しは一切しない。
//             候補はすべて医療安全ルールに準拠した表現で記述する。
const CANDIDATES = [
  {
    researched_at:   TODAY,
    source_type:     'seasonal',
    source_url:      '',
    topic:           '定期検診の受診間隔に関する患者の疑問',
    title_candidate: '歯科定期検診は何ヶ月ごとが目安？受診間隔の考え方',
    category:        '予防歯科',
    target_keyword:  '歯科定期検診 頻度',
    patient_intent:  '定期検診の適切な受診ペースを知りたい',
    priority:        'high',
    medical_risk:    'low',
    confidence:      'high',
    status:          'idea',
    publish_date:    PUBLISH_DATE,
    reason:          '患者からの問い合わせ頻度が高い季節性テーマ',
    notes:           'dry-run candidate',
  },
  {
    researched_at:   TODAY,
    source_type:     'patient_question',
    source_url:      '',
    topic:           '初期虫歯（C1）の自覚症状と受診タイミング',
    title_candidate: '痛みがない虫歯はある？初期虫歯の特徴と受診の目安',
    category:        '虫歯治療',
    target_keyword:  '虫歯 初期 痛みなし',
    patient_intent:  '痛くない虫歯の見分け方を知りたい',
    priority:        'high',
    medical_risk:    'medium',
    confidence:      'high',
    status:          'idea',
    publish_date:    PUBLISH_DATE,
    reason:          '検索需要が高い常緑テーマ',
    notes:           'dry-run candidate',
  },
  {
    researched_at:   TODAY,
    source_type:     'trend',
    source_url:      '',
    topic:           '歯周病と全身疾患の関連性',
    title_candidate: '歯周病が体に影響するって本当？全身への関わりを整理する',
    category:        '歯周病治療',
    target_keyword:  '歯周病 全身疾患 関係',
    patient_intent:  '歯周病が体全体に影響するかどうか知りたい',
    priority:        'medium',
    medical_risk:    'medium',
    confidence:      'medium',
    status:          'idea',
    publish_date:    PUBLISH_DATE,
    reason:          '患者教育ニーズが高いテーマ',
    notes:           'dry-run candidate',
  },
  {
    researched_at:   TODAY,
    source_type:     'seasonal',
    source_url:      '',
    topic:           '子どもの仕上げ磨きをやめる時期の目安',
    title_candidate: '子どもの歯磨きはいつまで仕上げ磨きが必要？年齢別の目安',
    category:        '小児歯科',
    target_keyword:  '子供 仕上げ磨き いつまで',
    patient_intent:  '仕上げ磨きを卒業する時期を知りたい',
    priority:        'medium',
    medical_risk:    'low',
    confidence:      'high',
    status:          'idea',
    publish_date:    PUBLISH_DATE,
    reason:          '保護者からの問い合わせが多い季節性テーマ',
    notes:           'dry-run candidate',
  },
  {
    researched_at:   TODAY,
    source_type:     'patient_question',
    source_url:      '',
    topic:           '親知らずの抜歯判断基準',
    title_candidate: '親知らずは必ず抜く必要がある？歯科医師に相談すべきケース',
    category:        '親知らず',
    target_keyword:  '親知らず 抜歯 必要',
    patient_intent:  '親知らずを抜く必要があるか知りたい',
    priority:        'high',
    medical_risk:    'medium',
    confidence:      'high',
    status:          'idea',
    publish_date:    PUBLISH_DATE,
    reason:          '継続的な検索需要がある常緑テーマ',
    notes:           'dry-run candidate',
  },
]

// CSV 用に値を安全にエスケープする
// なぜ: フィールド内にダブルクォートが含まれると CSV の構文が壊れるため "" に変換する
function csvEscape(value) {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

// 候補配列を CSV 文字列に変換する
function toCsv(candidates) {
  const header = CSV_HEADERS.map(csvEscape).join(',')
  const rows = candidates.map((c) =>
    CSV_HEADERS.map((key) => csvEscape(c[key] ?? '')).join(',')
  )
  return [header, ...rows].join('\n')
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

// CSV の 1 フィールドを RFC 4180 準拠でエスケープする（research-trends 用の再定義）
// ※ toCsv() の csvEscape と同実装だが importCandidate が独立して使えるよう定義している
function csvEscapeField(value) {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')
const CSV_COLUMNS = [
  'id', 'discovered_at', 'source_type', 'source_url', 'topic',
  'title_candidate', 'category', 'target_keyword', 'patient_intent',
  'priority', 'medical_risk', 'status', 'publish_date', 'notes',
]

// --import <index>: 最新 research JSON の candidates[index] を article-topics.sample.csv に追記する。
// Human が JSON を確認したうえで明示的に index 指定した場合のみ実行する。
function importCandidate(rawIndex) {
  const index = parseInt(rawIndex, 10)
  if (Number.isNaN(index) || index < 0) {
    console.error('エラー: --import には 0 以上の整数インデックスを指定してください')
    console.error('  例: npm run research:trends -- --import 0')
    process.exit(1)
  }

  if (!existsSync(RESEARCH_DIR)) {
    console.error('エラー: data/research/ が存在しません。先に npm run research:trends を実行してください')
    process.exit(1)
  }

  // data/research/ から最新の *-trends.json を取得（ファイル名は YYYY-MM-DD-trends.json なので辞書順で最新が末尾）
  const jsonFiles = readdirSync(RESEARCH_DIR)
    .filter((f) => f.endsWith('-trends.json'))
    .sort()
  if (jsonFiles.length === 0) {
    console.error('エラー: data/research/ に trends JSON が見つかりません。先に npm run research:trends を実行してください')
    process.exit(1)
  }
  const latestFile = jsonFiles[jsonFiles.length - 1]
  const jsonPath = join(RESEARCH_DIR, latestFile)

  let research
  try {
    research = JSON.parse(readFileSync(jsonPath, 'utf8'))
  } catch (err) {
    console.error(`エラー: JSON の読み込みに失敗しました: ${jsonPath}`)
    console.error(err.message)
    process.exit(1)
  }

  const candidates = research.candidates ?? []
  if (index >= candidates.length) {
    console.error(`エラー: インデックス ${index} が範囲外です（候補数: ${candidates.length}）`)
    console.error(`  有効なインデックス: 0 〜 ${candidates.length - 1}`)
    process.exit(1)
  }
  const c = candidates[index]

  // 既存 CSV を読み込んで title_candidate 重複チェック
  let existingRows = []
  if (existsSync(TOPICS_PATH)) {
    try {
      existingRows = parseCsv(readFileSync(TOPICS_PATH, 'utf8'))
    } catch (err) {
      console.error(`エラー: CSV の読み込みに失敗しました: ${TOPICS_PATH}`)
      console.error(err.message)
      process.exit(1)
    }
  }
  const dup = existingRows.find((r) => (r.title_candidate ?? '').trim() === (c.title_candidate ?? '').trim())
  if (dup) {
    console.error('エラー: 同じ title_candidate が既に CSV に存在します（重複インポート禁止）')
    console.error(`  既存 ID : ${dup.id}`)
    console.error(`  タイトル: ${c.title_candidate}`)
    process.exit(1)
  }

  // topic ID 自動採番: TOPIC-YYYYMMDD-NNN（今日の日付ベース）
  const datePart = TODAY.replace(/-/g, '')
  const prefix = `TOPIC-${datePart}-`
  const usedNums = existingRows
    .map((r) => r.id ?? '')
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
  const nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : 1
  const topicId = `${prefix}${String(nextNum).padStart(3, '0')}`

  const newRow = {
    id:              topicId,
    discovered_at:   c.researched_at ?? TODAY,
    source_type:     c.source_type ?? '',
    source_url:      c.source_url ?? '',
    topic:           c.topic ?? '',
    title_candidate: c.title_candidate ?? '',
    category:        c.category ?? '',
    target_keyword:  c.target_keyword ?? '',
    patient_intent:  c.patient_intent ?? '',
    priority:        c.priority ?? '',
    medical_risk:    c.medical_risk ?? '',
    status:          'idea',
    publish_date:    c.publish_date ?? '',
    notes:           c.notes ?? '',
  }
  const line = CSV_COLUMNS.map((k) => csvEscapeField(newRow[k])).join(',')

  // CSV 末尾に追記（末尾改行がなければ補完）
  let csvContent = existsSync(TOPICS_PATH) ? readFileSync(TOPICS_PATH, 'utf8') : ''
  if (csvContent && !csvContent.endsWith('\n')) csvContent += '\n'
  writeFileSync(TOPICS_PATH, csvContent + line + '\n', 'utf8')

  console.log('━'.repeat(52))
  console.log('CSV 追記完了')
  console.log('━'.repeat(52))
  console.log(`  topic_id   : ${topicId}`)
  console.log(`  タイトル   : ${c.title_candidate}`)
  console.log(`  カテゴリ   : ${c.category}`)
  console.log(`  status     : idea`)
  console.log(`  取得元     : data/research/${latestFile}`)
  console.log(`  追記先     : data/article-topics.sample.csv`)
  console.log('━'.repeat(52))
  console.log()
  console.log('次のステップ:')
  console.log('  1. npm run validate:topics で追記内容を確認')
  console.log(`  2. npm run generate:draft -- ${topicId} で AI 下書きを生成`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.import !== undefined) {
    if (args.import === true) {
      console.error('エラー: --import にはインデックスを指定してください')
      console.error('  例: npm run research:trends -- --import 0')
      process.exit(1)
    }
    importCandidate(args.import)
    return
  }

  // 出力先ディレクトリを確保する（存在しない場合のみ作成）
  try {
    mkdirSync(RESEARCH_DIR, { recursive: true })
  } catch (err) {
    console.error(`エラー: 出力ディレクトリを作成できませんでした: ${RESEARCH_DIR}`)
    console.error(err.message)
    process.exit(1)
  }

  const jsonPath = join(RESEARCH_DIR, `${TODAY}-trends.json`)
  const csvPath  = join(RESEARCH_DIR, `${TODAY}-trends.csv`)

  // JSON 構造
  const output = {
    generated_at:         TODAY,
    dry_run:              true,
    review_required:      true,
    medical_safety_rules: MEDICAL_SAFETY_RULES,
    candidates:           CANDIDATES,
  }

  // JSON 書き込み
  try {
    writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf8')
  } catch (err) {
    console.error(`エラー: JSON ファイルを書き込めませんでした: ${jsonPath}`)
    console.error(err.message)
    process.exit(1)
  }

  // CSV 書き込み
  try {
    writeFileSync(csvPath, toCsv(CANDIDATES), 'utf8')
  } catch (err) {
    console.error(`エラー: CSV ファイルを書き込めませんでした: ${csvPath}`)
    console.error(err.message)
    process.exit(1)
  }

  // 完了メッセージ
  console.log('━'.repeat(49))
  console.log('AIトレンド調査 dry-run')
  console.log('━'.repeat(49))
  console.log(`  候補件数  : ${CANDIDATES.length}件`)
  console.log(`  調査日    : ${TODAY}`)
  console.log(`  出力先    : data/research/`)
  console.log('━'.repeat(49))
  console.log(`✅ data/research/${TODAY}-trends.json`)
  console.log(`✅ data/research/${TODAY}-trends.csv`)
  console.log()
  console.log('次のステップ:')
  console.log('  1. data/research/*.json を開いて候補を確認する')
  console.log('  2. 採用候補だけを手動で data/article-topics.sample.csv に追記する')
  console.log('  3. AI hallucination に注意: 出力をそのまま使わず必ず人間が確認する')
}

main()
