#!/usr/bin/env node
// check-image-library.mjs
// data/image-library.json と public/images/library/ の整合性を検証する。読み取り専用。
// ingest 済みエントリ（license_status を持つ新スキーマ）は必須フィールドも検証する。
// エラーがあれば exit 1。警告のみなら exit 0。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const LIBRARY_DIR  = join(ROOT, 'public', 'images', 'library')
const INBOX_DIR    = join(LIBRARY_DIR, '_inbox')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

// 旧運用カテゴリ + ingest カテゴリの和集合を許容する
const VALID_CATEGORIES = new Set([
  // 旧運用（image-import-inbox 時代）
  'preventive', 'wisdom-tooth', 'implant', 'announcement',
  // ingest-image-library（現行）
  'cavity', 'root-canal', 'periodontal', 'whitening',
  'pediatric', 'denture', 'prevention', 'general',
])

const NEW_SCHEMA_REQUIRED = [
  'id', 'path', 'category', 'title', 'alt', 'format', 'sha256',
  'source_filename', 'license_status', 'usage_status', 'created_at', 'updated_at',
]

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'])

function countInbox(dir) {
  if (!existsSync(dir)) return 0
  let count = 0
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) count += countInbox(fullPath)
    else if (IMAGE_EXTS.has(extname(entry).toLowerCase())) count++
  }
  return count
}

function main() {
  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)
  console.log(BAR)
  console.log('  images:library:check — 画像ライブラリ整合性チェック')
  console.log(BAR)

  if (!existsSync(LIBRARY_PATH)) {
    console.error('エラー: data/image-library.json が見つかりません')
    process.exit(1)
  }

  let library
  try {
    library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
  } catch (e) {
    console.error(`パースエラー: ${e.message}`)
    process.exit(1)
  }

  const images   = Array.isArray(library.images) ? library.images : []
  const errors   = []
  const warnings = []

  // id / path / sha256 の重複確認
  const seenIds = new Set()
  const seenPaths = new Set()
  const seenHashes = new Map()
  for (const img of images) {
    if (seenIds.has(img.id)) errors.push(`id 重複: "${img.id}"`)
    seenIds.add(img.id)
    if (img.path) {
      if (seenPaths.has(img.path)) errors.push(`path 重複: "${img.path}"`)
      seenPaths.add(img.path)
    }
    if (typeof img.sha256 === 'string' && img.sha256) {
      if (seenHashes.has(img.sha256)) errors.push(`sha256 重複: [${img.id}] と [${seenHashes.get(img.sha256)}]`)
      else seenHashes.set(img.sha256, img.id)
    }
  }

  let newSchemaCount = 0
  for (const img of images) {
    const label = `[${img.id ?? '(id なし)'}]`

    if (!img.path || !String(img.path).startsWith('/')) {
      errors.push(`${label} path が不正です: "${img.path ?? ''}"`)
      continue
    }
    // ingest 済みエントリは library 配下に置かれていること
    if (img.license_status !== undefined && !String(img.path).startsWith('/images/library/')) {
      errors.push(`${label} ingest 済みエントリの path が library 外です: "${img.path}"`)
    }
    if (!existsSync(join(ROOT, 'public', img.path))) {
      errors.push(`${label} ファイルが存在しません: public${img.path}`)
    }
    if (!img.category || !VALID_CATEGORIES.has(img.category)) {
      errors.push(`${label} category が無効です: "${img.category ?? ''}"`)
    }
    if (!img.alt || String(img.alt).trim() === '') {
      warnings.push(`${label} alt が空です`)
    }

    // 新スキーマ（ingest 済み）エントリの必須フィールド検証
    if (img.license_status !== undefined) {
      newSchemaCount++
      for (const field of NEW_SCHEMA_REQUIRED) {
        if (img[field] === undefined || img[field] === null || img[field] === '') {
          errors.push(`${label} 必須フィールド ${field} がありません`)
        }
      }
      if (img.license_status !== 'assumed_approved') {
        warnings.push(`${label} license_status が assumed_approved 以外です: "${img.license_status}"`)
      }
      if (!['active', 'retired'].includes(img.usage_status)) {
        errors.push(`${label} usage_status が無効です: "${img.usage_status}"`)
      }
      if (img.width !== null && (!Number.isInteger(img.width) || img.width <= 0)) {
        errors.push(`${label} width が不正です: ${img.width}`)
      }
      if (img.height !== null && (!Number.isInteger(img.height) || img.height <= 0)) {
        errors.push(`${label} height が不正です: ${img.height}`)
      }
    }
  }

  const inboxCount = countInbox(INBOX_DIR)

  console.log()
  console.log(`  ライブラリ件数        : ${images.length} 件`)
  console.log(`  うち ingest 済みスキーマ: ${newSchemaCount} 件`)
  console.log(`  _inbox 未取り込み     : ${inboxCount} 件`)
  console.log()

  if (errors.length > 0) {
    console.log(`❌ エラー（${errors.length} 件）:`)
    console.log(DIV)
    for (const e of errors) console.error(`  ❌ ${e}`)
    console.log(DIV)
  }
  if (warnings.length > 0) {
    console.log(`⚠️  警告（${warnings.length} 件）:`)
    console.log(DIV)
    for (const w of warnings) console.warn(`  ⚠️  ${w}`)
    console.log(DIV)
  }
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All checks passed')
  } else if (errors.length === 0) {
    console.log(`⚠️  警告 ${warnings.length} 件あり。エラーなし。`)
  }
  if (inboxCount > 0) {
    console.log(`  💡 _inbox に未取り込み画像があります: npm run images:ingest`)
  }
  console.log(BAR)
  process.exit(errors.length > 0 ? 1 : 0)
}

main()
