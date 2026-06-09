#!/usr/bin/env node
// image-reclassify.mjs
// 画像のカテゴリを変更し、ファイルを新カテゴリフォルダに移動して
// image-library.json と記事 frontmatter を更新する。
// Human がトリガーする。
//
// --dry-run (デフォルト) : 変更内容を表示するだけ。
// --apply               : ファイル移動 + JSON + 記事更新を実行。
import {
  existsSync, mkdirSync, readdirSync,
  readFileSync, renameSync, writeFileSync,
} from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
const LIBRARY_DIR  = join(ROOT, 'public', 'images', 'library')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

const VALID_CATEGORIES = new Set([
  'cavity', 'root-canal', 'periodontal', 'preventive',
  'pediatric', 'wisdom-tooth', 'implant', 'announcement', 'general',
])

const CATEGORY_ALT = {
  'cavity':       '虫歯の治療に関するイメージ',
  'root-canal':   '根管治療に関するイメージ',
  'periodontal':  '歯周病の治療・予防に関するイメージ',
  'preventive':   '予防歯科・定期検診に関するイメージ',
  'pediatric':    '小児歯科に関するイメージ',
  'wisdom-tooth': '親知らずの治療に関するイメージ',
  'implant':      'インプラント治療に関するイメージ',
  'announcement': '医療法人藍想会のお知らせに関するイメージ',
  'general':      '歯科診療に関するイメージ',
}

const CATEGORY_TAGS = {
  'cavity':       ['虫歯', '治療', '歯科'],
  'root-canal':   ['根管治療', '神経', '歯科'],
  'periodontal':  ['歯周病', '歯ぐき', '歯科'],
  'preventive':   ['予防', '定期検診', 'クリーニング', '歯科'],
  'pediatric':    ['小児歯科', '子ども', '乳歯', '歯科'],
  'wisdom-tooth': ['親知らず', '抜歯', '歯科'],
  'implant':      ['インプラント', '歯科'],
  'announcement': ['お知らせ', '藍想会'],
  'general':      ['歯科', '歯科診療'],
}

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

function normalizeDates(data) {
  const out = { ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
  }
  return out
}

// id から base 部分を取得（"general-34130816" → "34130816"）
function extractBaseId(id) {
  const idx = id.indexOf('-')
  return idx >= 0 ? id.slice(idx + 1) : id
}

// 記事一覧から指定パスを使用している記事を返す
function findArticlesUsingPath(path) {
  const results = []
  if (!existsSync(POSTS_DIR)) return results
  for (const f of readdirSync(POSTS_DIR).filter((n) => n.endsWith('.md'))) {
    try {
      const raw    = readFileSync(join(POSTS_DIR, f), 'utf8')
      const { data } = matter(raw)
      if (data.image === path) results.push(f)
    } catch { /* skip */ }
  }
  return results
}

function main() {
  const args       = parseArgs(process.argv.slice(2))
  const imageId    = String(args._[0] ?? args.id ?? '').trim()
  const newCat     = String(args.category ?? '').trim()
  const apply      = args.apply === true
  const customAlt  = typeof args.alt === 'string' ? args.alt.trim() : null
  const dryRun     = !apply

  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)
  const mode = apply ? '実行モード (--apply)' : 'dry-run（確認のみ）'

  console.log(BAR)
  console.log(`  image:reclassify — ${mode}`)
  console.log(BAR)

  if (!imageId || !newCat) {
    console.error('使い方: npm run image:reclassify -- <image-id> --category <category>')
    console.error(`  カテゴリ一覧: ${[...VALID_CATEGORIES].join(' / ')}`)
    process.exit(1)
  }

  if (!VALID_CATEGORIES.has(newCat)) {
    console.error(`エラー: カテゴリ "${newCat}" は無効です`)
    console.error(`  有効なカテゴリ: ${[...VALID_CATEGORIES].join(' / ')}`)
    process.exit(1)
  }

  let library
  try {
    library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
  } catch (e) {
    console.error(`パースエラー (image-library.json): ${e.message}`)
    process.exit(1)
  }

  const images   = library.images ?? []
  const imgIndex = images.findIndex((img) => img.id === imageId)
  if (imgIndex < 0) {
    console.error(`エラー: image-id "${imageId}" が見つかりません`)
    console.error(`  登録済み ID: ${images.map((i) => i.id).join(', ') || '（なし）'}`)
    process.exit(1)
  }

  const img    = images[imgIndex]
  const oldCat = img.category

  if (oldCat === newCat) {
    console.log(`  ℹ️  category はすでに "${newCat}" です。変更の必要はありません。`)
    console.log(BAR)
    return
  }

  // パスから拡張子を取得
  const ext        = extname(img.path)  // 例: .jpg
  const baseId     = extractBaseId(imageId)
  const newFilename = `${newCat}-${baseId}${ext}`
  const newPublicPath = `/images/library/${newCat}/${newFilename}`

  // ディスク上のパス
  const oldDiskPath = join(ROOT, 'public', img.path)
  const newDestDir  = join(LIBRARY_DIR, newCat)
  const newDiskPath = join(newDestDir, newFilename)

  // alt の決定
  const oldDefaultAlt = CATEGORY_ALT[oldCat] ?? ''
  const isAltDefault  = !img.alt || img.alt === oldDefaultAlt
  const newAlt = customAlt
    ?? (isAltDefault ? (CATEGORY_ALT[newCat] ?? '') : img.alt)

  const altChanged = newAlt !== img.alt
  // 記事参照確認
  const usingArticles = findArticlesUsingPath(img.path)

  // ── 変更計画の表示 ──
  console.log()
  console.log(`  image-id   : ${imageId}`)
  console.log(`  category   : ${oldCat}  →  ${newCat}`)
  console.log(`  path       : ${img.path}`)
  console.log(`           →  ${newPublicPath}`)
  console.log(`  tags       : [${(img.tags ?? []).join(', ')}]`)
  console.log(`           →  [${CATEGORY_TAGS[newCat].join(', ')}]`)
  if (altChanged) {
    console.log(`  alt        : ${img.alt || '（空）'}`)
    console.log(`           →  ${newAlt}`)
    if (!isAltDefault && !customAlt) {
      console.log('  ℹ️  alt はカスタム値のため元のまま維持します（--alt "..." で上書き可）')
    }
  } else {
    console.log(`  alt        : ${img.alt || '（空）'} （変更なし）`)
  }
  console.log()

  // ファイル存在確認
  if (!existsSync(oldDiskPath)) {
    console.warn(`  ⚠️  ファイルが見つかりません: public${img.path}`)
    console.warn('      JSON のみ更新します（ファイル移動はスキップ）')
  } else {
    console.log(`  ファイル移動: public${img.path}`)
    console.log(`             → public/images/library/${newCat}/${newFilename}`)
  }

  if (usingArticles.length > 0) {
    console.log()
    console.log(`  記事参照 ${usingArticles.length} 件（path を更新します）:`)
    for (const f of usingArticles) {
      console.log(`    content/posts/${f}`)
    }
  } else {
    console.log('  記事参照    : なし')
  }

  if (existsSync(newDiskPath)) {
    console.warn(`  ⚠️  移動先ファイルがすでに存在します: public/images/library/${newCat}/${newFilename}`)
    console.warn('      --apply を実行すると上書きされます')
  }

  if (dryRun) {
    console.log()
    console.log(DIV)
    console.log('dry-run のため変更は行いません。')
    console.log('実行するには --apply を付けてください:')
    console.log(`  npm run image:reclassify -- ${imageId} --category ${newCat} --apply`)
    console.log(BAR)
    return
  }

  // ── 実行フェーズ ──
  // 1. ファイル移動
  if (existsSync(oldDiskPath)) {
    mkdirSync(newDestDir, { recursive: true })
    renameSync(oldDiskPath, newDiskPath)
    console.log(`  ✅ ファイル移動完了`)
  }

  // 2. image-library.json 更新
  images[imgIndex] = {
    ...img,
    category: newCat,
    path:     newPublicPath,
    tags:     [...CATEGORY_TAGS[newCat]],
    alt:      newAlt,
  }
  library.images = images
  writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2) + '\n', 'utf8')
  console.log('  ✅ image-library.json 更新完了')

  // 3. 記事 frontmatter 更新
  let articleErrors = 0
  for (const f of usingArticles) {
    try {
      const filePath = join(POSTS_DIR, f)
      const raw      = readFileSync(filePath, 'utf8')
      const parsed   = matter(raw)
      const data     = normalizeDates(parsed.data)
      data.image = newPublicPath
      // image_alt も更新（新しい alt と一致させる）
      if (data.image_alt === img.alt) data.image_alt = newAlt
      writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')
      console.log(`  ✅ 記事更新: content/posts/${f}`)
    } catch (err) {
      console.error(`  ❌ 記事更新失敗: ${f}: ${err.message}`)
      articleErrors++
    }
  }

  // ── 完了 ──
  console.log()
  console.log(BAR)
  console.log('  reclassify 完了')
  console.log(DIV)
  console.log(`  image-id   : ${imageId}`)
  console.log(`  category   : ${oldCat}  →  ${newCat}`)
  console.log(`  path       : ${newPublicPath}`)
  if (articleErrors > 0) {
    console.error(`  記事更新エラー: ${articleErrors} 件`)
  }
  console.log()
  console.log('次のステップ:')
  console.log('  1. npm run validate:posts で整合性を確認する')
  console.log('  2. npm run image:check で library を確認する')
  console.log('  3. git add + commit（push は Human が手動実行）')
  console.log(BAR)
}

main()
