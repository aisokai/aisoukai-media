#!/usr/bin/env node
// image-suggest.mjs
// 記事 slug に合った画像候補を image-library.json から提示する CLI。
// 読み取り専用。ファイルは変更しない。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { findCandidates, loadFeedback } from './lib/image-scoring.mjs'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key  = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key]  = next && !next.startsWith('--') ? argv[++i] : true
    } else {
      args._.push(argv[i])
    }
  }
  return args
}

function main() {
  const args      = parseArgs(process.argv.slice(2))
  const slugInput = String(args.slug ?? args._[0] ?? '').trim()

  if (!slugInput) {
    console.error('使い方: npm run image:suggest -- <slug>')
    console.error('   例:  npm run image:suggest -- 2026-01-20-cavity-treatment')
    process.exit(1)
  }

  const filename = slugInput.endsWith('.md') ? slugInput : `${slugInput}.md`
  const filePath = join(POSTS_DIR, filename)

  if (!existsSync(filePath)) {
    console.error(`エラー: 記事ファイルが見つかりません: content/posts/${filename}`)
    process.exit(1)
  }

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

  const { data, content } = matter(readFileSync(filePath, 'utf8'))
  const images            = library.images ?? []
  const feedback          = loadFeedback()

  const BAR = '━'.repeat(58)
  const DIV = '─'.repeat(58)
  console.log(BAR)
  console.log(`画像候補提示（フィードバック反映）`)
  console.log(BAR)
  console.log(`  slug       : ${slugInput}`)
  console.log(`  タイトル   : ${String(data.title ?? '').slice(0, 48)}`)
  console.log(`  カテゴリ   : ${data.category ?? ''}`)
  console.log(`  ライブラリ : ${images.length} 件`)
  console.log(`  フィードバック: ${feedback.length} 件`)
  console.log()

  if (images.length === 0) {
    console.log('  ライブラリに画像が登録されていません。')
    console.log(BAR)
    return
  }

  // 他記事で使用中の画像IDを収集（対象記事自身はスキップ）
  const usedImages = new Set()
  for (const pf of readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))) {
    if (pf === filename) continue
    try {
      const { data: pd } = matter(readFileSync(join(POSTS_DIR, pf), 'utf8'))
      const imgId = images.find((img) => img.path === pd.image)?.id
      if (imgId) usedImages.add(imgId)
    } catch {}
  }

  // スコアリング（ベース + フィードバック調整）・ソート・上位5件
  const candidates = findCandidates({
    images,
    title:       String(data.title ?? ''),
    category:    String(data.category ?? ''),
    excerpt:     String(data.excerpt ?? data.description ?? ''),
    bodyContent: content,
    usedImages,
    limit:       5,
    feedback,
  })

  if (candidates.length === 0) {
    console.log('  候補なし — ライブラリ内の tags と記事の内容が一致しませんでした。')
    console.log()
    console.log('  登録済み画像の tags:')
    for (const img of images.slice(0, 8)) {
      console.log(`    [${img.id}] ${(img.tags ?? []).join(' / ')}`)
    }
    console.log(BAR)
    return
  }

  console.log(`画像候補 (${candidates.length} 件):`)
  console.log(DIV)

  for (const [i, candidate] of candidates.entries()) {
    const { img, score, base, adj, notes, concerns, alreadyUsed } = candidate
    const adjStr = adj !== 0 ? ` (ベース ${base.toFixed(1)} ${adj >= 0 ? '+' : ''}${adj.toFixed(1)} FB)` : ''
    console.log(`${i + 1}. [${img.id}]  スコア: ${score.toFixed(1)}${adjStr}${alreadyUsed ? '  ⚠️ 他記事で使用中' : ''}`)
    console.log(`   path    : ${img.path}`)
    console.log(`   alt     : ${img.alt}`)
    console.log(`   tags    : ${(img.tags ?? []).join(' / ')}`)
    console.log(`   理由    : ${notes.join(' / ')}`)
    if (concerns.length > 0) {
      console.log(`   懸念    : ${concerns.join(' / ')}`)
    }
    console.log(`   source  : ${img.license_source ?? ''}`)
    console.log(`   割当    : npm run image:assign -- ${slugInput} --image ${img.id}`)
    console.log(`   FB記録  : npm run image:feedback -- ${slugInput} --image ${img.id} --action approve|reject`)
    if (i < candidates.length - 1) console.log()
  }

  console.log(BAR)
}

main()
