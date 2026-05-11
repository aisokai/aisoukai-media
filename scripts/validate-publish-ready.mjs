#!/usr/bin/env node
// validate-publish-ready.mjs
// publish-ready 判定チェッカー。記事ごとに承認状態・必須項目を検査し、
// Human approval が済んでいない記事を明示する。ファイルは変更しない。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

const VALID_CATEGORIES = new Set([
  '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
  '親知らず', 'インプラント', 'その他', 'お知らせ',
])

const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/

function toDateStr(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

/**
 * 1 記事を検査し { blockers, warnings } を返す。
 * blockers: publish-ready を妨げる理由（これがあると ❌）
 * warnings: 注意喚起（publish-ready 判定には影響しないが表示する）
 */
function checkPost(filename) {
  const blockers = []
  const warnings = []

  if (!FILENAME_RE.test(filename)) {
    blockers.push('ファイル名が YYYY-MM-DD-slug.md 形式ではありません')
    return { blockers, warnings }
  }

  const filePath = join(POSTS_DIR, filename)
  let data
  try {
    const raw = readFileSync(filePath, 'utf8')
    data = matter(raw).data
  } catch (e) {
    blockers.push(`frontmatter のパースに失敗しました: ${e.message}`)
    return { blockers, warnings }
  }

  // ── 承認状態 ──
  if (data.reviewed !== true) {
    blockers.push('reviewed: false — Human approval が未完了です')
  }

  if (data.draft === true) {
    blockers.push('draft: true — ドラフト明示記事は公開対象外です')
  }

  // ── AI生成フラグ（warning: 内容確認を促す） ──
  if (data.ai_generated === true) {
    warnings.push('ai_generated: true — 医療情報の正確性を必ず人間が確認してください')
  }

  // ── 必須フィールド ──
  if (!data.title || String(data.title).trim() === '') {
    blockers.push('title が空です')
  }

  const excerpt = String(data.excerpt ?? data.description ?? '').trim()
  if (!excerpt) {
    blockers.push('excerpt が空です（互換として description でも可）')
  }

  if (!data.author || String(data.author).trim() === '') {
    blockers.push('author が空です')
  }

  if (!data.category) {
    blockers.push('category がありません')
  } else if (!VALID_CATEGORIES.has(data.category)) {
    blockers.push(`category が無効です: "${data.category}"`)
  }

  if (!data.date) {
    blockers.push('date がありません')
  } else {
    const dateStr = toDateStr(data.date)
    if (!DATE_RE.test(dateStr)) {
      blockers.push(`date の形式が不正です: "${dateStr}" (YYYY-MM-DD が必要)`)
    }
  }

  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    warnings.push('tags が空配列または未定義です')
  }

  if (data.image && !String(data.image).startsWith('/')) {
    blockers.push(`image のパスが "/" で始まっていません: "${data.image}"`)
  }

  return { blockers, warnings }
}

// ── エントリポイント ──

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

const results = files.map((file) => ({ file, ...checkPost(file) }))
const ready     = results.filter((r) => r.blockers.length === 0)
const notReady  = results.filter((r) => r.blockers.length > 0)

const BAR = '━'.repeat(56)
console.log(BAR)
console.log(`publish-ready チェック  (全 ${files.length} 件)`)
console.log(BAR)

if (notReady.length > 0) {
  for (const { file, blockers, warnings } of notReady) {
    console.log(`\n❌ ${file}`)
    for (const b of blockers) console.log(`   ⛔ ${b}`)
    for (const w of warnings) console.log(`   ⚠️  ${w}`)
  }
}

if (ready.length > 0) {
  console.log()
  for (const { file, warnings } of ready) {
    console.log(`✅ ${file}`)
    for (const w of warnings) console.log(`   ⚠️  ${w}`)
  }
}

console.log()
console.log(BAR)
console.log(`  publish-ready    : ${ready.length} 件`)
console.log(`  要 Human approval: ${notReady.length} 件`)
console.log(BAR)

if (ready.length > 0) {
  console.log()
  console.log('次のステップ（publish-ready 記事を公開する場合）:')
  console.log('  1. 上記 ✅ 記事の本文・医療情報を最終確認する')
  console.log('  2. 問題なければ npm run build を実行してデプロイへ進む')
} else {
  console.log()
  console.log('publish-ready な記事はありません。')
  console.log('記事を公開するには reviewed: true に変更し、内容を確認してください。')
}

// blocker が1件でもある記事が存在する場合は exit 1
process.exit(notReady.length > 0 ? 1 : 0)
