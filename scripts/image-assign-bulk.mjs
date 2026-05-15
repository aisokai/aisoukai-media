#!/usr/bin/env node
// image-assign-bulk.mjs
// image 未設定の全記事に対して image-library.json から最適画像を一括割当てする。
// デフォルト: dry-run（ファイル変更なし）
// --apply : frontmatter を書き込む
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

// 記事カテゴリ（日本語）→ image-library category（英語）
const ARTICLE_CAT_TO_LIB_CAT = {
  '虫歯治療':    'cavity',
  '歯周病治療':  'general',
  '根管治療':    'general',
  '親知らず':    'general',
  '予防歯科':    'preventive',
  'インプラント': 'implant',
  '小児歯科':    'pediatric',
  'お知らせ':    'announcement',
}

function tokenize(text) {
  const set = new Set()
  const str = String(text ?? '')
  for (const token of str.split(/[\s、。・「」【】（）()[\]：:,，！？!?]+/)) {
    if (token.length >= 2) set.add(token)
  }
  for (const w of (str.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])) {
    set.add(w)
  }
  return set
}

function scoreImage(image, articleTokens) {
  let score = 0
  for (const tag of image.tags ?? []) {
    if (articleTokens.has(tag)) { score += 2; continue }
    for (const token of articleTokens) {
      if (tag.includes(token) || token.includes(tag)) { score += 0.5; break }
    }
  }
  return score
}

function findBestImage({ images, title, category, excerpt, bodyContent }) {
  if (!images || images.length === 0) return null
  const articleText = [title, category, excerpt ?? '', bodyContent?.slice(0, 300) ?? ''].join(' ')
  const tokens = tokenize(articleText)
  const best = images
    .map((img) => ({ img, score: scoreImage(img, tokens) }))
    .sort((a, b) => b.score - a.score)[0]
  if (best && best.score > 0) return best.img
  const libCat = ARTICLE_CAT_TO_LIB_CAT[category] ?? 'general'
  return images.find((img) => img.category === libCat)
    ?? images.find((img) => img.category === 'general')
    ?? null
}

// gray-matter が Date に変換するフィールドを文字列に戻す
function normalizeDates(data) {
  const out = { ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
  }
  return out
}

function main() {
  const apply = process.argv.includes('--apply')

  const BAR = '━'.repeat(64)
  const DIV = '─'.repeat(64)
  console.log(BAR)
  console.log(`image 一括割当 ${apply ? '【APPLY モード】' : '【DRY-RUN モード（--apply で書き込み）】'}`)
  console.log(BAR)

  if (!existsSync(LIBRARY_PATH)) {
    console.error('エラー: data/image-library.json が見つかりません')
    process.exit(1)
  }
  let lib
  try {
    lib = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
  } catch (e) {
    console.error(`エラー: data/image-library.json の読み込みに失敗しました: ${e.message}`)
    process.exit(1)
  }
  const images = lib.images ?? []

  const files = readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()

  const results = { assigned: [], noCandidate: [], skipped: [] }

  for (const filename of files) {
    const filePath = join(POSTS_DIR, filename)
    let parsed, data
    try {
      const raw = readFileSync(filePath, 'utf8')
      parsed    = matter(raw)
      data      = normalizeDates(parsed.data)
    } catch (e) {
      console.log(`  ⚠️ スキップ（読み込みエラー）: ${filename} — ${e.message}`)
      continue
    }

    // image 設定済みはスキップ
    if (data.image) {
      results.skipped.push({ filename, imageId: data.image })
      continue
    }

    const best = findBestImage({
      images,
      title:       data.title ?? '',
      category:    data.category ?? '',
      excerpt:     data.excerpt ?? data.description ?? '',
      bodyContent: parsed.content,
    })

    if (!best) {
      results.noCandidate.push({ filename, category: data.category ?? '', reviewed: data.reviewed })
      continue
    }

    results.assigned.push({
      filename,
      category:  data.category ?? '',
      reviewed:  data.reviewed,
      imageId:   best.id,
      imagePath: best.path,
      imageAlt:  best.alt,
    })

    if (apply) {
      // image / image_alt のみ更新。他フィールドは絶対に変更しない。
      data.image     = best.path
      data.image_alt = best.alt
      writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')
    }
  }

  // ── 結果レポート ──────────────────────────────────────────────────────────

  console.log()
  console.log(`✅ 割当対象: ${results.assigned.length} 件`)
  console.log(DIV)
  for (const r of results.assigned) {
    const mark = apply ? '✏️' : '📋'
    console.log(`${mark} ${r.filename}`)
    console.log(`   category: ${r.category} / reviewed: ${r.reviewed}`)
    console.log(`   → image-id: ${r.imageId}`)
  }

  if (results.noCandidate.length > 0) {
    console.log()
    console.log(`⚠️  候補なし: ${results.noCandidate.length} 件（手動で設定してください）`)
    console.log(DIV)
    for (const r of results.noCandidate) {
      console.log(`   ${r.filename}  category: ${r.category} / reviewed: ${r.reviewed}`)
    }
  }

  console.log()
  console.log(`ℹ️  スキップ（設定済み）: ${results.skipped.length} 件`)
  console.log(BAR)

  if (!apply) {
    console.log()
    console.log('変更を適用するには: npm run image:assign-bulk -- --apply')
    console.log(BAR)
  }
}

main()
