#!/usr/bin/env node
// image-usage.mjs
// 記事 ↔ 画像の対応関係を表示する。読み取り専用。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

function main() {
  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)

  console.log(BAR)
  console.log('  image:usage — 記事 ↔ 画像 対応一覧')
  console.log(BAR)

  // image-library.json
  let library = { images: [] }
  if (existsSync(LIBRARY_PATH)) {
    try {
      library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
    } catch { /* skip */ }
  }
  const images   = library.images ?? []
  const pathToId = new Map(images.map(img => [img.path, img.id]))

  // 記事一覧
  const postFiles = existsSync(POSTS_DIR)
    ? readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).sort()
    : []

  const assigned   = []  // { slug, date, title, category, imagePath, imageId }
  const unassigned = []  // { slug, date, title, category }
  const pathUsage  = new Map()  // imagePath → [slug, ...]

  for (const f of postFiles) {
    try {
      const { data } = matter(readFileSync(join(POSTS_DIR, f), 'utf8'))
      const slug     = f.replace(/\.md$/, '')
      const imgPath  = typeof data.image === 'string' ? data.image.trim() : ''

      if (imgPath) {
        const imageId = pathToId.get(imgPath) ?? '（ライブラリ未登録）'
        assigned.push({
          slug,
          date:      data.date ?? '',
          title:     data.title ?? slug,
          category:  data.category ?? '',
          imagePath: imgPath,
          imageId,
        })
        if (!pathUsage.has(imgPath)) pathUsage.set(imgPath, [])
        pathUsage.get(imgPath).push(slug)
      } else {
        unassigned.push({
          slug,
          date:     data.date ?? '',
          title:    data.title ?? slug,
          category: data.category ?? '',
          draft:    data.draft ?? false,
          reviewed: data.reviewed ?? false,
        })
      }
    } catch { /* skip */ }
  }

  // 複数記事で共用されている画像
  const shared = [...pathUsage.entries()].filter(([, slugs]) => slugs.length > 1)

  console.log()
  console.log(`  記事数     : ${postFiles.length} 件`)
  console.log(`  画像割当済 : ${assigned.length} 件`)
  console.log(`  画像未割当 : ${unassigned.length} 件`)
  console.log(`  画像共用   : ${shared.length} 件（複数記事で同じ画像）`)
  console.log()

  // ── 画像割当済み記事 ──
  if (assigned.length > 0) {
    console.log('画像割当済み記事:')
    console.log(DIV)
    for (const a of assigned) {
      const shortPath = a.imagePath.replace('/images/library/', '')
      console.log(`  [${a.date}] ${a.slug}`)
      console.log(`    image-id: ${a.imageId}`)
      console.log(`    path    : ${shortPath}`)
    }
    console.log(DIV)
    console.log()
  }

  // ── 未割当記事 ──
  if (unassigned.length > 0) {
    console.log('⚠️  画像未割当の記事:')
    console.log(DIV)
    for (const u of unassigned) {
      const flags = []
      if (u.reviewed) flags.push('reviewed')
      if (!u.draft)   flags.push('visible')
      const flagStr = flags.length ? `  [${flags.join('/')}]` : ''
      console.log(`  [${u.date}] ${u.slug}${flagStr}`)
      console.log(`    カテゴリ: ${u.category}`)
    }
    console.log(DIV)
    console.log()
    console.log('画像を割り当てるには:')
    console.log('  npm run image:suggest -- <slug>  # 候補確認')
    console.log('  npm run image:assign  -- <slug> --image <image-id>  # 割当')
    console.log()
  }

  // ── 共用画像 ──
  if (shared.length > 0) {
    console.log('ℹ️  複数記事で共用されている画像:')
    console.log(DIV)
    for (const [imgPath, slugs] of shared) {
      const imageId   = pathToId.get(imgPath) ?? '（未登録）'
      const shortPath = imgPath.replace('/images/library/', '')
      console.log(`  ${imageId}`)
      console.log(`    path   : ${shortPath}`)
      console.log(`    使用記事: ${slugs.length} 件`)
      for (const s of slugs) {
        console.log(`      - ${s}`)
      }
    }
    console.log(DIV)
    console.log('  ℹ️  共用自体は問題なし。カテゴリ専用画像を購入すると改善できます')
    console.log()
  }

  console.log(BAR)
}

main()
