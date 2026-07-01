#!/usr/bin/env node
// scheduled-article-flow.mjs
// 定期提案フロー: 公開日到来済みの承認済み topic を 1 件選択
// → AI 下書き生成 → Telegram 通知。
// Human approval の reviewed:true / publish / push は実行しない。
// 未来日の一括下書き準備は generate-scheduled-drafts.mjs を使う。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { parseCsv } from './csv-parser.mjs'
import { evaluatePostFile, getTodayJst } from './lib/post-publication-status.mjs'
import { pickArticleImage } from './lib/auto-post-image.mjs'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const ROOT        = join(__dirname, '..')
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')
const POSTS_DIR   = join(ROOT, 'content', 'posts')
const RESEARCH_DIR = join(ROOT, 'data', 'research')
const REVIEW_HISTORY_PATH = join(ROOT, 'logs', 'review-history.md')
const ADMIN_POST_HISTORY_PATH = join(ROOT, 'logs', 'admin-post-history.md')

const TODAY = getTodayJst()

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

function topicIdFromSlug(slug) {
  const m = String(slug ?? '').match(/^\d{4}-\d{2}-\d{2}-topic-(\d{8})-(\d{3})(?:\.md)?$/i)
  if (!m) return ''
  return `TOPIC-${m[1]}-${m[2]}`
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

function runAllowFailure(scriptPath, args = []) {
  try {
    execFileSync(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      env:   process.env,
    })
    return 0
  } catch (err) {
    return typeof err.status === 'number' ? err.status : 1
  }
}

function writeResult(resultPath, result) {
  if (!resultPath) return
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
}

function splitLogEntries(raw) {
  return String(raw ?? '')
    .split(/\n(?=##\s+\d{4}-\d{2}-\d{2}T)/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function getLogField(entry, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = entry.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : ''
}

// 削除済み・却下済み・重複整理済みの topic は、CSV が approved のままでも再利用しない。
function loadBlockedScheduledTopics() {
  const topicIds = new Set()
  const slugs = new Set()

  const blockSlug = (slug) => {
    const cleanSlug = String(slug ?? '').replace(/\.md$/, '').trim()
    if (!cleanSlug) return
    slugs.add(cleanSlug)
    const topicId = topicIdFromSlug(cleanSlug)
    if (topicId) topicIds.add(topicId)
  }

  if (existsSync(REVIEW_HISTORY_PATH)) {
    for (const entry of splitLogEntries(readFileSync(REVIEW_HISTORY_PATH, 'utf8'))) {
      const action = getLogField(entry, 'action')
      if (!['reject', 'archive_duplicate'].includes(action)) continue
      blockSlug(getLogField(entry, 'slug'))
    }
  }

  if (existsSync(ADMIN_POST_HISTORY_PATH)) {
    for (const entry of splitLogEntries(readFileSync(ADMIN_POST_HISTORY_PATH, 'utf8'))) {
      const action = getLogField(entry, 'action')
      if (action !== 'delete-rejected') continue
      blockSlug(getLogField(entry, 'slug'))
    }
  }

  if (existsSync(POSTS_DIR)) {
    for (const file of readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))) {
      try {
        const { data } = matter(readFileSync(join(POSTS_DIR, file), 'utf8'))
        if (!data.rejection_reason) continue
        const topicId = String(data.source_topic_id ?? '').trim()
        if (topicId) topicIds.add(topicId)
        blockSlug(file.replace(/\.md$/, ''))
      } catch {}
    }
  }

  return { topicIds, slugs }
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

function hasGeneratedPostForTopic(row, blocked = loadBlockedScheduledTopics()) {
  const id = (row.id ?? '').trim()
  const publishDate = (row.publish_date ?? '').trim()
  if (!id || !publishDate) return true

  const filename = `${publishDate}-${slugify(id)}.md`
  const slug = filename.replace(/\.md$/, '')
  if (blocked.topicIds.has(id) || blocked.slugs.has(slug)) return true
  if (existsSync(join(POSTS_DIR, filename))) return true

  if (!existsSync(POSTS_DIR)) return false
  for (const file of readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))) {
    try {
      const { data } = matter(readFileSync(join(POSTS_DIR, file), 'utf8'))
      if (String(data.source_topic_id ?? '').trim() === id) return true
    } catch {}
  }

  return false
}

// status='approved' で、公開日到来済み、かつ対応する下書きファイルがまだ存在しない topic 行を探す
function findMissingApprovedTopics(rows, { allowFuture = false, today = TODAY } = {}) {
  const blocked = loadBlockedScheduledTopics()
  return rows
    .filter((r) => (r.status ?? '').trim() === 'approved')
    .filter((r) => {
      const id          = (r.id ?? '').trim()
      const publishDate = (r.publish_date ?? '').trim()
      if (!id || !publishDate) return false
      if (!allowFuture && publishDate > today) return false
      return !hasGeneratedPostForTopic(r, blocked)
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

function normalizeMatterDates(data) {
  const out = { ...data }
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) out[key] = value.toISOString().slice(0, 10)
  }
  return out
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  return String(value ?? '')
    .split(/[\s,、・]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function ensureGeneratedPostImage(filePath, topicId) {
  const raw = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const data = normalizeMatterDates(parsed.data)
  const image = String(data.image ?? '').trim()
  const imageAlt = String(data.image_alt ?? '').trim()

  if (image && imageAlt) {
    return { ok: true, assigned: false, image, imageAlt, imageId: '' }
  }

  const picked = pickArticleImage({
    title: String(data.title ?? ''),
    category: String(data.category ?? ''),
    excerpt: String(data.excerpt ?? data.description ?? ''),
    tags: normalizeTags(data.tags),
    sourceTopicId: String(data.source_topic_id ?? topicId),
    bodyContent: parsed.content,
  })

  data.image = picked.image
  data.image_alt = picked.image_alt
  writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')

  return {
    ok: true,
    assigned: true,
    image: picked.image,
    imageAlt: picked.image_alt,
    imageId: picked.image_id,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const autoPublish = args.auto_publish === true
  const publishToday = args.publish_today === true
  const allowFuture = args.allow_future === true || publishToday
  const fillFromResearch = args.fill_from_research === true
  const noNotify = args.no_notify === true
  const selectOnly = args.select_only === true
  const resultPath = args.result_json ? String(args.result_json) : ''
  const result = {
    ok: false,
    generated: false,
    published: false,
    autoPublish,
    allowFuture,
    publishToday,
    selectOnly,
    today: TODAY,
    topicId: '',
    slug: '',
    path: '',
    title: '',
    publishAt: '',
    image: { ok: false, assigned: false, image: '', imageAlt: '', imageId: '' },
    reasons: [],
  }

  loadEnv()

  if (autoPublish) {
    console.error('エラー: scheduled-article-flow では --auto-publish を受け付けません。本文確認後に管理画面で承認してください。')
    result.reasons = ['--auto-publish は無効です。本文確認後に管理画面で承認してください。']
    writeResult(resultPath, result)
    process.exit(1)
  }

  console.log('━'.repeat(56))
  console.log('定期提案フロー開始')
  console.log('━'.repeat(56))
  console.log()

  // ── STEP 1: 候補 topic を決定する ──
  console.log('[ STEP 1/3 ]  候補 topic 選択 ...')
  console.log()

  let topicId = null
  let pickedTopic = null
  let rows    = readCsvRows()

  // 1-a: approved で公開日到来済み、かつ下書き未生成の topic を探す
  const pending = findMissingApprovedTopics(rows, { allowFuture })
  if (pending.length > 0) {
    const picked = pending[0]
    pickedTopic = picked
    topicId = (picked.id ?? '').trim()
    console.log(`  既存の承認済み topic を使用します`)
    console.log(`  topic_id  : ${topicId}`)
    console.log(`  タイトル  : ${picked.title_candidate}`)
    console.log(`  優先度    : ${picked.priority}`)
    console.log(`  公開予定日: ${picked.publish_date}`)
  } else {
    const futurePending = findMissingApprovedTopics(rows, { allowFuture: true })
      .filter((row) => String(row.publish_date ?? '').trim() > TODAY)
    if (!fillFromResearch) {
      const reason = futurePending.length > 0
        ? `公開日が今日以前の未生成 approved topic はありません（次回候補: ${futurePending[0].publish_date} / ${futurePending[0].id}）`
        : '公開日が今日以前の未生成 approved topic はありません'
      console.log(`  ⏭ ${reason}`)
      result.reasons = [reason]
      writeResult(resultPath, result)
      process.exit(2)
    }

    // 1-b: 明示指定時のみ research:trends から候補を補充する
    console.log(`  承認済みの未処理 topic がありません。research:trends で補充します ...`)
    console.log()

    const research = runResearchTrends()
    if (!research || !research.candidates?.length) {
      console.error('エラー: research:trends の候補を取得できませんでした')
      result.reasons = ['research:trends の候補を取得できませんでした']
      writeResult(resultPath, result)
      process.exit(1)
    }

    rows    = readCsvRows() // research:trends 後に再読み込み
    topicId = importResearchCandidate(research.candidates, rows)

    if (!topicId) {
      console.error('エラー: 未登録の research 候補が見つかりませんでした')
      console.error('  data/article-topics.sample.csv に全候補が既に登録されています')
      console.error('  npm run request:article で新しいテーマを追加してください')
      result.reasons = ['未登録の research 候補が見つかりませんでした']
      writeResult(resultPath, result)
      process.exit(1)
    }

    rows = readCsvRows()
    pickedTopic = rows.find((row) => String(row.id ?? '').trim() === topicId) ?? null
  }

  if (!pickedTopic) {
    console.error(`エラー: 選択 topic を再取得できませんでした: ${topicId}`)
    result.reasons = [`選択 topic を再取得できませんでした: ${topicId}`]
    writeResult(resultPath, result)
    process.exit(1)
  }

  // ── STEP 2: AI 下書き生成 ──
  console.log()
  console.log(`[ STEP 2/3 ]  AI 下書き生成 (${topicId}) ...`)
  console.log()

  const effectivePublishDate = publishToday ? TODAY : String(pickedTopic.publish_date ?? '').trim()
  const generatedFilename = `${effectivePublishDate}-${slugify(topicId)}.md`
  const generatedFilePath = join(POSTS_DIR, generatedFilename)
  result.topicId = topicId
  result.slug = generatedFilename.replace(/\.md$/, '')
  result.path = `content/posts/${generatedFilename}`
  result.title = String(pickedTopic.title_candidate ?? '')
  result.publishAt = effectivePublishDate

  if (selectOnly) {
    result.ok = true
    result.reasons = ['--select-only 指定のため、選定確認のみ実行しました']
    console.log()
    console.log('  --select-only 指定のため、AI下書き生成・保存・Telegram通知は実行しません')
    writeResult(resultPath, result)
    process.exit(0)
  }

  const generateArgs = publishToday
    ? [topicId, '--publish-date', TODAY]
    : [topicId]
  const generateStatus = runAllowFailure(join(__dirname, 'generate-draft.mjs'), generateArgs)
  if (generateStatus !== 0) {
    result.reasons = generateStatus === 2
      ? ['品質NG: 生成本文に brief 等の生成崩れが検出されたため保存しませんでした']
      : [`generate-draft.mjs が exit ${generateStatus} で停止しました`]
    writeResult(resultPath, result)
    process.exit(generateStatus)
  }

  if (!existsSync(generatedFilePath)) {
    result.reasons = [`生成後の記事ファイルが見つかりません: content/posts/${generatedFilename}`]
    writeResult(resultPath, result)
    process.exit(1)
  }

  result.generated = true

  try {
    result.image = ensureGeneratedPostImage(generatedFilePath, topicId)
    console.log()
    console.log(`  image: ok${result.image.assigned ? ` (${result.image.imageId} を補完)` : ''}`)
  } catch (error) {
    result.reasons = [`画像を設定できませんでした: ${error.message}`]
    writeResult(resultPath, result)
    process.exit(1)
  }

  const publication = evaluatePostFile(generatedFilePath)
  result.ok = true
  result.published = publication.publishable
  result.title = publication.title
  result.publishAt = publication.publishAt
  result.reasons = publication.publishable ? [] : publication.reasons
  writeResult(resultPath, result)

  // ── STEP 4: pending-review 通知 ──
  console.log()
  console.log('[ STEP 3/3 ]  pending-review Telegram 通知 ...')
  console.log()

  if (noNotify) {
    console.log('  --no-notify 指定のため、このステップでは Telegram 通知しません')
  } else {
    run(join(__dirname, 'notify-pending-review.mjs'))
  }

  console.log()
  console.log('━'.repeat(56))
  console.log('✅ 定期提案フロー完了')
  console.log('━'.repeat(56))
  console.log()
  console.log('次のステップ（Human が実行）:')
  console.log('  1. 管理画面で本文確認')
  console.log('  2. 問題なければ本文承認')
  console.log('  3. 承認後に公開対象になります')
}

main().catch((e) => {
  console.error('エラー:', e.message)
  process.exit(1)
})
