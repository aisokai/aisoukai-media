#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

const VALID_CATEGORIES = [
  '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
  '親知らず', 'インプラント', 'その他', 'お知らせ',
]

const REQUIRED_FIELDS = ['title', 'date', 'category', 'tags', 'author', 'reviewed', 'image']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/
const VALID_MEDICAL_RISK = ['low', 'medium', 'high']
const VALID_CHECK_STATUS = ['pending', 'passed', 'failed']
const VALID_PUBLICATION_STATUS = ['draft', 'pending_review', 'auto_approved', 'human_approved']

function toDateStr(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

function validatePost(filename) {
  const errors   = []
  const warnings = []
  const filePath = join(POSTS_DIR, filename)

  if (!FILENAME_RE.test(filename)) {
    errors.push('ファイル名が YYYY-MM-DD-slug.md 形式ではありません')
    return errors
  }

  let data, content
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = matter(raw)
    data = parsed.data
    content = parsed.content
  } catch (e) {
    errors.push(`frontmatter のパースに失敗しました: ${e.message}`)
    return errors
  }

  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`${field} フィールドがありません`)
    }
  }

  if (typeof data.title === 'string' && data.title.trim() === '') {
    errors.push('title が空です')
  }

  const excerpt = typeof data.excerpt === 'string' && data.excerpt.trim() !== ''
    ? data.excerpt
    : (typeof data.description === 'string' ? data.description : '')

  if (excerpt.trim() === '') {
    errors.push('excerpt がありません（互換として description でも可）')
  }

  if (typeof data.author === 'string' && data.author.trim() === '') {
    errors.push('author が空です')
  }

  if (typeof data.image === 'string' && data.image.trim() !== '') {
    if (!data.image.startsWith('/')) {
      errors.push(`image のパスが "/" で始まっていません: "${data.image}"`)
    } else {
      // image が指定されている場合、public/ 配下に実ファイルが存在するか確認する
      const imageDiskPath = join(ROOT, 'public', data.image)
      if (!existsSync(imageDiskPath)) {
        errors.push(`image ファイルが public/ に存在しません: "${data.image}"`)
      }
    }
    // image が設定されているのに image_alt が空の場合は警告（エラーにしない）
    if (!data.image_alt || String(data.image_alt).trim() === '') {
      warnings.push('image_alt が設定されていません（アクセシビリティのために image_alt の設定を推奨します）')
    }
  }

  if (data.publication_status === 'human_approved') {
    const image = String(data.image ?? '').trim()
    const imageAlt = String(data.image_alt ?? '').trim()

    if (!image) {
      errors.push('公開対象記事の image が空です')
    } else if (!image.startsWith('/images/')) {
      errors.push(`公開対象記事の image は "/images/" で始まる必要があります: "${image}"`)
    } else {
      const imageDiskPath = join(ROOT, 'public', image)
      if (!existsSync(imageDiskPath)) {
        errors.push(`公開対象記事の image ファイルが public/ に存在しません: "${image}"`)
      }
    }

    if (!imageAlt) {
      errors.push('公開対象記事の image_alt が空です')
    }
  }

  if (data.category !== undefined && !VALID_CATEGORIES.includes(data.category)) {
    errors.push(`category が無効です: "${data.category}"`)
  }

  if (data.reviewed !== undefined && typeof data.reviewed !== 'boolean') {
    errors.push(`reviewed が boolean ではありません (実際の型: ${typeof data.reviewed})`)
  }

  if (data.auto_approved !== undefined && typeof data.auto_approved !== 'boolean') {
    errors.push(`auto_approved が boolean ではありません (実際の型: ${typeof data.auto_approved})`)
  }

  if (data.medical_risk !== undefined && !VALID_MEDICAL_RISK.includes(data.medical_risk)) {
    errors.push(`medical_risk が無効です: "${data.medical_risk}"`)
  }

  if (data.legal_check_status !== undefined && !VALID_CHECK_STATUS.includes(data.legal_check_status)) {
    errors.push(`legal_check_status が無効です: "${data.legal_check_status}"`)
  }

  if (data.image_check_status !== undefined && !VALID_CHECK_STATUS.includes(data.image_check_status)) {
    errors.push(`image_check_status が無効です: "${data.image_check_status}"`)
  }

  if (data.publication_status !== undefined && !VALID_PUBLICATION_STATUS.includes(data.publication_status)) {
    errors.push(`publication_status が無効です: "${data.publication_status}"`)
  }

  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    errors.push('tags が配列ではありません')
  }

  if (data.date !== undefined) {
    const dateStr = toDateStr(data.date)
    if (!DATE_RE.test(dateStr)) {
      errors.push(`date の形式が不正です: "${dateStr}" (YYYY-MM-DD が必要)`)
    } else {
      const filenameDate = filename.slice(0, 10)
      if (dateStr !== filenameDate) {
        errors.push(`date (${dateStr}) がファイル名の日付 (${filenameDate}) と一致しません`)
      }
    }
  }

  if (!content || content.trim() === '') {
    errors.push('本文が空です')
  }

  return { errors, warnings }
}

let files
try {
  files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort()
} catch {
  console.error('エラー: content/posts/ が見つかりません')
  process.exit(1)
}

if (files.length === 0) {
  console.log('⚠️  記事が存在しません: content/posts/')
  process.exit(0)
}

let hasErrors   = false
let hasWarnings = false
const report    = []

for (const file of files) {
  const { errors, warnings } = validatePost(file)
  report.push({ file, errors, warnings })
  if (errors.length   > 0) hasErrors   = true
  if (warnings.length > 0) hasWarnings = true
}

if (!hasErrors) {
  if (hasWarnings) {
    console.log(`✅ All posts valid (${files.length} 件) — 警告あり`)
    for (const { file, warnings } of report) {
      if (warnings.length > 0) {
        console.warn(`⚠️  ${file}`)
        for (const w of warnings) console.warn(`   ⚠ ${w}`)
      }
    }
    process.exit(0)
  }
  console.log(`✅ All posts valid (${files.length} 件)`)
  process.exit(0)
}

for (const { file, errors, warnings } of report) {
  if (errors.length > 0) {
    console.error(`❌ ${file}`)
    for (const err of errors) console.error(`   - ${err}`)
  }
  if (warnings.length > 0) {
    console.warn(`⚠️  ${file}`)
    for (const w of warnings) console.warn(`   ⚠ ${w}`)
  }
}
process.exit(1)
