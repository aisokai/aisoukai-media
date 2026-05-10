#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
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

function toDateStr(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

function validatePost(filename) {
  const errors = []
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

  if (typeof data.image === 'string' && data.image.trim() !== '' && !data.image.startsWith('/')) {
    errors.push(`image のパスが "/" で始まっていません: "${data.image}"`)
  }

  if (data.category !== undefined && !VALID_CATEGORIES.includes(data.category)) {
    errors.push(`category が無効です: "${data.category}"`)
  }

  if (data.reviewed !== undefined && typeof data.reviewed !== 'boolean') {
    errors.push(`reviewed が boolean ではありません (実際の型: ${typeof data.reviewed})`)
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

  return errors
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

let hasErrors = false
const report = []

for (const file of files) {
  const errors = validatePost(file)
  report.push({ file, errors })
  if (errors.length > 0) hasErrors = true
}

if (!hasErrors) {
  console.log(`✅ All posts valid (${files.length} 件)`)
  process.exit(0)
}

for (const { file, errors } of report) {
  if (errors.length > 0) {
    console.error(`❌ ${file}`)
    for (const err of errors) {
      console.error(`   - ${err}`)
    }
  }
}
process.exit(1)
