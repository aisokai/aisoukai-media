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

// 記事カテゴリ → 期待する画像カテゴリのマッピング
const CATEGORY_MAP = {
  '根管治療':  'root-canal',
  '歯周病治療': 'periodontal',
  '親知らず':  'wisdom-tooth',
}

// 記事の date と今日を比較して公開予定かどうかを判定する
const TODAY = new Date().toISOString().slice(0, 10)
function isUpcoming(dateStr) {
  return typeof dateStr === 'string' && dateStr > TODAY
}

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
  const pathToCategory = new Map(images.map(img => [img.path, img.category]))

  // 記事一覧
  const postFiles = existsSync(POSTS_DIR)
    ? readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).sort()
    : []

  const assigned   = []  // { slug, date, title, category, imagePath, imageId, upcoming, altImage }
  const unassigned = []  // { slug, date, title, category, draft, reviewed, upcoming }
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
          upcoming:  isUpcoming(data.date),
          altImage:  (() => {
            const expectedCat = CATEGORY_MAP[data.category ?? '']
            if (!expectedCat) return false
            const actualCat = pathToCategory.get(imgPath)
            return actualCat !== expectedCat
          })(),
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
          upcoming: isUpcoming(data.date),
        })
      }
    } catch { /* skip */ }
  }

  // 複数記事で共用されている画像
  const shared = [...pathUsage.entries()].filter(([, slugs]) => slugs.length > 1)

  // 代替画像使用中の記事
  const altImages = assigned.filter(a => a.altImage)

  console.log()
  console.log(`  記事数     : ${postFiles.length} 件`)
  console.log(`  画像割当済 : ${assigned.length} 件`)
  console.log(`  画像未割当 : ${unassigned.length} 件`)
  console.log(`  画像共用   : ${shared.length} 件（複数記事で同じ画像）`)
  if (altImages.length > 0) {
    console.log(`  代替画像使用 : ${altImages.length} 件（専用カテゴリ画像なし — 購入後に差し替え推奨）`)
  }
  console.log()

  // ── 画像割当済み記事 ──
  if (assigned.length > 0) {
    console.log('画像割当済み記事:')
    console.log(DIV)
    for (const a of assigned) {
      const shortPath   = a.imagePath.replace('/images/library/', '')
      const upcomingStr = a.upcoming ? '  [公開予定]' : ''
      const altStr      = a.altImage  ? '  ⚠️ 代替画像使用中' : ''
      console.log(`  [${a.date}] ${a.slug}${upcomingStr}${altStr}`)
      console.log(`    image-id: ${a.imageId}`)
      console.log(`    path    : ${shortPath}`)
      if (a.altImage) {
        const expectedCat = CATEGORY_MAP[a.category]
        console.log(`    ⚠️  category「${a.category}」の専用画像（${expectedCat}）がありません — 購入後に差し替えてください`)
      }
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
      if (u.upcoming)  flags.push('公開予定')
      else if (u.reviewed) flags.push('reviewed')
      if (!u.draft)    flags.push('visible')
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

  // ── 代替画像使用中 ──
  if (altImages.length > 0) {
    console.log('⚠️  代替画像使用中の記事（専用カテゴリ画像購入後に差し替え推奨）:')
    console.log(DIV)
    for (const a of altImages) {
      const expectedCat = CATEGORY_MAP[a.category]
      const shortPath   = a.imagePath.replace('/images/library/', '')
      console.log(`  [${a.date}] ${a.slug}`)
      console.log(`    カテゴリ    : ${a.category}（専用: ${expectedCat}）`)
      console.log(`    使用中の画像: ${shortPath}（category: ${pathToCategory.get(a.imagePath) ?? '?'}）`)
      console.log(`    差し替え手順: npm run image:purchase:list → 購入 → npm run image:assign -- ${a.slug} --image <新image-id>`)
    }
    console.log(DIV)
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
