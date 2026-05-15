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

// 記事の image パスから image-library の ID を引く
function getImageId(imagePath, lib) {
  if (!imagePath) return null
  return (lib.images ?? []).find((img) => img.path === imagePath)?.id ?? null
}

function findBestImage({ images, title, category, excerpt, bodyContent, usedImages = new Set() }) {
  if (!images || images.length === 0) return null
  const articleText = [title, category, excerpt ?? '', bodyContent?.slice(0, 300) ?? ''].join(' ')
  const tokens = tokenize(articleText)
  const scored = images
    .map((img) => ({
      img,
      score: scoreImage(img, tokens) + (usedImages.has(img.id) ? -1000 : 0),
    }))
    .sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (best && best.score > 0) return best.img
  // カテゴリ fallback（未使用優先、不足時は使用済みも許容）
  const libCat = ARTICLE_CAT_TO_LIB_CAT[category] ?? 'general'
  return (
    images.find((img) => img.category === libCat   && !usedImages.has(img.id)) ??
    images.find((img) => img.category === 'general' && !usedImages.has(img.id)) ??
    images.find((img) => img.category === libCat) ??
    images.find((img) => img.category === 'general') ??
    null
  )
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
  const apply    = process.argv.includes('--apply')
  const reassign = process.argv.includes('--reassign')

  const BAR = '━'.repeat(64)
  const DIV = '─'.repeat(64)
  console.log(BAR)
  console.log(`image 一括割当 ${apply ? '【APPLY モード】' : '【DRY-RUN モード（--apply で書き込み）】'}${reassign ? ' + 重複再割当' : ''}`)
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

  // ── Pass 1: 重複画像IDを特定（--reassign 時のみ）────────────────────────
  const duplicateIds = new Set()
  if (reassign) {
    const imageCount = {}
    for (const filename of files) {
      try {
        const { data } = matter(readFileSync(join(POSTS_DIR, filename), 'utf8'))
        const imgId = getImageId(data.image, lib)
        if (imgId) imageCount[imgId] = (imageCount[imgId] ?? 0) + 1
      } catch {}
    }
    for (const [id, count] of Object.entries(imageCount)) {
      if (count > 1) duplicateIds.add(id)
    }
    console.log(`  重複画像: ${duplicateIds.size} 種類 → 使用記事を再割当対象にします`)
  }

  // ── Pass 2: 非重複画像を usedImages に確保 ───────────────────────────────
  const usedImages = new Set()
  for (const filename of files) {
    try {
      const { data } = matter(readFileSync(join(POSTS_DIR, filename), 'utf8'))
      const imgId = getImageId(data.image, lib)
      if (imgId && !duplicateIds.has(imgId)) usedImages.add(imgId)
    } catch {}
  }

  const results = { assigned: [], noCandidate: [], skipped: [] }

  // ── Pass 3: メイン処理 ───────────────────────────────────────────────────
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

    if (data.image) {
      const imgId       = getImageId(data.image, lib)
      const isDuplicate = imgId && duplicateIds.has(imgId)
      if (!reassign || !isDuplicate) {
        results.skipped.push({ filename, imageId: imgId ?? data.image })
        continue
      }
      // reassign && isDuplicate → 再割当対象（usedImages には追加しない）
    }

    const best = findBestImage({
      images,
      title:       data.title ?? '',
      category:    data.category ?? '',
      excerpt:     data.excerpt ?? data.description ?? '',
      bodyContent: parsed.content,
      usedImages,
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
      wasSet:    !!data.image,
    })
    usedImages.add(best.id)

    if (apply) {
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
    const mark  = apply ? '✏️' : '📋'
    const label = r.wasSet ? ' [再割当]' : ''
    console.log(`${mark}${label} ${r.filename}`)
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
  console.log(`ℹ️  スキップ（設定済み・非重複）: ${results.skipped.length} 件`)
  console.log(BAR)

  if (!apply) {
    console.log()
    console.log('変更を適用するには: npm run image:assign-bulk -- --apply [--reassign]')
    console.log(BAR)
  }
}

main()
