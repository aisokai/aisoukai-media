#!/usr/bin/env node
// auto-review-post.mjs
// Auto Publish Policy に基づき、low risk 記事だけを自動承認する。
// Human approval の reviewed:true は書き換えない。
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { findCandidates, loadFeedback } from './lib/image-scoring.mjs'
import { getTodayJst } from './lib/post-publication-status.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')
const IMAGE_LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')
const AUTO_REVIEW_DIR = join(ROOT, 'data', 'auto-publish-reviews')
const LOGS_DIR = join(ROOT, 'logs')
const LOG_PATH = join(LOGS_DIR, 'auto-publish-history.md')

const AUTO_REVIEWER = 'dmp-auto-publish-v1'
const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const VALID_CATEGORIES = new Set([
  '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
  '親知らず', 'インプラント', 'その他', 'お知らせ',
])

const MEDICAL_AD_PATTERNS = [
  { re: /必ず/, label: '断定表現「必ず」' },
  { re: /絶対/, label: '断定表現「絶対」' },
  { re: /完全に治る/, label: '断定表現「完全に治る」' },
  { re: /100[%％]/, label: '断定数値「100%」' },
  { re: /No\.?1|NO\.?1|ナンバーワン/, label: '比較優位「No.1 / ナンバーワン」' },
  { re: /日本一/, label: '比較優位「日本一」' },
  { re: /最安/, label: '比較優位「最安」' },
  { re: /他院より/, label: '比較優位「他院より」' },
  { re: /痛くない/, label: '誇大表現「痛くない」' },
  { re: /副作用なし/, label: '誇大表現「副作用なし」' },
  { re: /体験談|患者様の声|口コミ/, label: '体験談・口コミ風表現' },
  { re: /before|after|ビフォー|アフター/i, label: 'Before / After 訴求' },
]

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

function getTodayIso() {
  return getTodayJst()
}

function getJstTimestamp() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().replace('Z', '+09:00')
}

function toDateStr(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

function normalizeDates(data) {
  const out = { ...data }
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) out[key] = value.toISOString().slice(0, 10)
  }
  return out
}

function resolveFilePath(input) {
  const name = input.endsWith('.md') ? input : `${input}.md`
  const direct = join(POSTS_DIR, name)
  if (existsSync(direct)) return direct

  const slug = input.replace(/\.md$/, '').toLowerCase()
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
  const hits = files.filter((f) => f.replace(DATE_PREFIX_RE, '').replace(/\.md$/, '') === slug)

  if (hits.length === 0) return null
  if (hits.length > 1) {
    throw new Error(
      `スラグ "${slug}" に複数のファイルが一致します:\n${hits.map((f) => `  ${f}`).join('\n')}\nフルファイル名で指定してください`
    )
  }
  return join(POSTS_DIR, hits[0])
}

function loadImageLibrary() {
  if (!existsSync(IMAGE_LIBRARY_PATH)) return []
  try {
    const data = JSON.parse(readFileSync(IMAGE_LIBRARY_PATH, 'utf8'))
    return Array.isArray(data.images) ? data.images : []
  } catch {
    return []
  }
}

function isLicenseVerified(image) {
  const note = String(image.license_note ?? '')
  if (!note.trim()) return false
  if (/TODO|確認して更新|要確認|未確認/i.test(note)) return false
  return true
}

function imageExists(imagePath) {
  if (!imagePath || !String(imagePath).startsWith('/')) return false
  return existsSync(join(ROOT, 'public', imagePath))
}

function collectUsedImages(currentFile) {
  const used = new Set()
  const images = loadImageLibrary()
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
  for (const file of files) {
    if (file === currentFile) continue
    try {
      const { data } = matter(readFileSync(join(POSTS_DIR, file), 'utf8'))
      const image = images.find((img) => img.path === data.image)
      if (image) used.add(image.id)
    } catch {}
  }
  return used
}

function findImageByPath(images, imagePath) {
  return images.find((img) => img.path === imagePath) ?? null
}

function assignBestImage({ data, content, filename, blockers, notes }) {
  const images = loadImageLibrary()
  if (images.length === 0) {
    blockers.push('画像ライブラリがありません')
    return { status: 'failed' }
  }

  if (data.image) {
    const image = findImageByPath(images, data.image)
    if (!image) {
      blockers.push(`image が image-library.json に登録されていません: ${data.image}`)
      return { status: 'failed' }
    }
    if (!imageExists(image.path)) {
      blockers.push(`image ファイルが public/ に存在しません: ${image.path}`)
      return { status: 'failed' }
    }
    if (!data.image_alt && image.alt) {
      data.image_alt = image.alt
      notes.push(`image_alt を image-library から補完: ${image.id}`)
    }
    if (!data.image_alt) {
      blockers.push('image_alt がありません')
      return { status: 'failed' }
    }
    if (!isLicenseVerified(image)) {
      blockers.push(`画像ライセンスが未確認です: ${image.id}`)
      return { status: 'failed' }
    }
    notes.push(`既存画像を確認: ${image.id}`)
    return { status: 'passed', image }
  }

  const verifiedImages = images.filter((img) => imageExists(img.path) && isLicenseVerified(img))
  const candidates = findCandidates({
    images: verifiedImages,
    title: String(data.title ?? ''),
    category: String(data.category ?? ''),
    excerpt: String(data.excerpt ?? data.description ?? ''),
    bodyContent: content,
    usedImages: collectUsedImages(filename),
    limit: 1,
    feedback: loadFeedback(),
  })

  if (candidates.length === 0) {
    blockers.push('自動割当できる確認済み画像がありません')
    return { status: 'failed' }
  }

  const picked = candidates[0].img
  data.image = picked.path
  data.image_alt = picked.alt
  notes.push(`画像を自動割当: ${picked.id}`)
  return { status: 'passed', image: picked }
}

function checkRequiredFields(data, content, blockers, warnings) {
  if (!data.title || String(data.title).trim() === '') blockers.push('title が空です')

  const excerpt = String(data.excerpt ?? data.description ?? '').trim()
  if (!excerpt) blockers.push('excerpt が空です')

  if (!data.author || String(data.author).trim() === '') blockers.push('author が空です')
  if (!data.category) blockers.push('category がありません')
  else if (!VALID_CATEGORIES.has(data.category)) blockers.push(`category が無効です: "${data.category}"`)

  const dateStr = toDateStr(data.date)
  if (!DATE_RE.test(dateStr)) blockers.push(`date の形式が不正です: "${dateStr}"`)

  if (!Array.isArray(data.tags) || data.tags.length === 0) warnings.push('tags が空です')
  if (!content || content.trim() === '') blockers.push('本文が空です')
}

function checkDuplicates(filePath, data, blockers) {
  const currentFile = basename(filePath)
  const title = String(data.title ?? '').trim()
  const sourceTopicId = String(data.source_topic_id ?? '').trim()

  for (const file of readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))) {
    if (file === currentFile) continue
    try {
      const { data: other } = matter(readFileSync(join(POSTS_DIR, file), 'utf8'))
      if (title && String(other.title ?? '').trim() === title) {
        blockers.push(`既存記事と title が重複しています: ${file}`)
      }
      if (sourceTopicId && String(other.source_topic_id ?? '').trim() === sourceTopicId) {
        blockers.push(`既存記事と source_topic_id が重複しています: ${file}`)
      }
    } catch {}
  }
}

function checkMedicalLegal(data, content, blockers, warnings) {
  const medicalRisk = String(data.medical_risk ?? 'medium').trim()
  if (medicalRisk !== 'low') {
    blockers.push(`medical_risk が low ではありません: "${medicalRisk || '未設定'}"`)
  }

  const text = `${data.title ?? ''}\n${data.excerpt ?? data.description ?? ''}\n${content}`
  for (const { re, label } of MEDICAL_AD_PATTERNS) {
    if (re.test(text)) blockers.push(`医療広告 blocker: ${label}`)
  }

  if (String(data.category ?? '') === 'インプラント') {
    warnings.push('インプラント記事は内容確認を強く推奨します')
  }
}

function writeAudit(slug, audit) {
  mkdirSync(AUTO_REVIEW_DIR, { recursive: true })
  writeFileSync(join(AUTO_REVIEW_DIR, `${slug}.json`), JSON.stringify(audit, null, 2) + '\n', 'utf8')
}

function appendHistory({ timestamp, slug, result, blockers, warnings }) {
  mkdirSync(LOGS_DIR, { recursive: true })
  const lines = [`## ${timestamp}`]
  lines.push(`datetime: ${timestamp}`)
  lines.push(`action: auto_review`)
  lines.push(`slug: ${slug}`)
  lines.push(`result: ${result}`)
  if (blockers.length > 0) lines.push(`blockers: ${blockers.join(' / ')}`)
  if (warnings.length > 0) lines.push(`warnings: ${warnings.join(' / ')}`)
  lines.push('')
  appendFileSync(LOG_PATH, lines.join('\n') + '\n', 'utf8')
}

function reviewFile(filePath, { dryRun = false } = {}) {
  const filename = basename(filePath)
  const slug = filename.replace(/\.md$/, '')
  const raw = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const data = normalizeDates(parsed.data)
  const blockers = []
  const warnings = []
  const notes = []

  checkRequiredFields(data, parsed.content, blockers, warnings)
  checkDuplicates(filePath, data, blockers)
  checkMedicalLegal(data, parsed.content, blockers, warnings)
  const imageResult = assignBestImage({
    data,
    content: parsed.content,
    filename,
    blockers,
    notes,
  })

  const passed = blockers.length === 0 && imageResult.status === 'passed'
  const timestamp = getJstTimestamp()
  const today = getTodayIso()

  data.reviewed = data.reviewed === true
  data.auto_approved = passed
  data.review_mode = 'auto'
  data.legal_check_status = blockers.some((b) => b.startsWith('医療広告') || b.startsWith('medical_risk'))
    ? 'failed'
    : 'passed'
  data.image_check_status = imageResult.status
  data.publication_status = passed ? 'auto_approved' : 'pending_review'

  if (passed) {
    data.draft = false
    data.auto_approved_at = today
    data.auto_approved_by = AUTO_REVIEWER
  } else {
    delete data.auto_approved_at
    delete data.auto_approved_by
  }

  if (!dryRun) {
    writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')
  }

  const audit = {
    slug,
    reviewed_at: timestamp,
    reviewer: AUTO_REVIEWER,
    result: passed ? 'approved' : 'blocked',
    blockers,
    warnings,
    notes,
    agents: {
      topic_dedup: blockers.some((b) => b.includes('重複')) ? 'failed' : 'passed',
      writer_metadata: blockers.some((b) => /title|excerpt|category|author|date|本文/.test(b)) ? 'failed' : 'passed',
      medical_legal: data.legal_check_status,
      image: data.image_check_status,
      final_gate: passed ? 'passed' : 'failed',
    },
  }

  if (!dryRun) {
    writeAudit(slug, audit)
    appendHistory({
      timestamp,
      slug,
      result: audit.result,
      blockers,
      warnings,
    })
  }

  return audit
}

function listPendingFiles() {
  return readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((file) => join(POSTS_DIR, file))
    .filter((filePath) => {
      try {
        const { data } = matter(readFileSync(filePath, 'utf8'))
        return data.reviewed !== true && data.auto_approved !== true
      } catch {
        return false
      }
    })
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const all = args.all === true
  const dryRun = args.dry_run === true
  const input = String(args.slug ?? args._[0] ?? '').trim()

  if (!all && !input) {
    console.error('使い方: npm run article:auto-review -- <slug または ファイル名>')
    console.error('   または: npm run article:auto-review -- --all')
    console.error('   確認のみ: npm run article:auto-review -- <slug> --dry-run')
    process.exit(1)
  }

  let files
  if (all) {
    files = listPendingFiles()
  } else {
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
    files = [filePath]
  }

  if (files.length === 0) {
    console.log('Auto review 対象の記事はありません。')
    return
  }

  const results = files.map((file) => reviewFile(file, { dryRun }))
  const approved = results.filter((r) => r.result === 'approved')
  const blocked = results.filter((r) => r.result === 'blocked')

  const BAR = '━'.repeat(56)
  console.log(BAR)
  console.log('Auto Publish Policy review')
  if (dryRun) console.log('(dry-run: ファイルと監査ログは更新しません)')
  console.log(BAR)
  for (const result of results) {
    const mark = result.result === 'approved' ? '✅' : '❌'
    console.log(`${mark} ${result.slug}: ${result.result}`)
    for (const blocker of result.blockers) console.log(`   ⛔ ${blocker}`)
    for (const warning of result.warnings) console.log(`   ⚠ ${warning}`)
    for (const note of result.notes) console.log(`   - ${note}`)
  }
  console.log(BAR)
  console.log(`  auto approved: ${approved.length} 件`)
  console.log(`  blocked      : ${blocked.length} 件`)
  console.log(BAR)

  process.exit(blocked.length > 0 ? 1 : 0)
}

main()
