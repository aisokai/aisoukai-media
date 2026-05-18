#!/usr/bin/env node
// image-assign.mjs
// image-library.json の画像 ID を記事 frontmatter に割り当てる CLI。
// Human がトリガーする。reviewed 状態は変更しない。approve/publish はしない。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

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

// gray-matter が ISO 日付文字列を Date に変換するケースへの対処
function normalizeDates(data) {
  const out = { ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
  }
  return out
}

function main() {
  const args      = parseArgs(process.argv.slice(2))
  const slugInput = String(args.slug ?? args._[0] ?? '').trim()
  const imageId   = String(args.image ?? '').trim()

  if (!slugInput || !imageId) {
    console.error('使い方: npm run image:assign -- <slug> --image <image-id>')
    console.error('   例:  npm run image:assign -- 2026-01-20-cavity-treatment --image cavity-01')
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

  const imageEntry = (library.images ?? []).find((img) => img.id === imageId)
  if (!imageEntry) {
    const ids = (library.images ?? []).map((i) => i.id).join(', ') || '（なし）'
    console.error(`エラー: image-id "${imageId}" が data/image-library.json に見つかりません`)
    console.error(`  登録済み ID: ${ids}`)
    process.exit(1)
  }

  const filename = slugInput.endsWith('.md') ? slugInput : `${slugInput}.md`
  const filePath = join(POSTS_DIR, filename)

  if (!existsSync(filePath)) {
    console.error(`エラー: 記事ファイルが見つかりません: content/posts/${filename}`)
    process.exit(1)
  }

  const raw    = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const data   = normalizeDates(parsed.data)

  const prevImage    = data.image    ?? ''
  const prevImageAlt = data.image_alt ?? ''

  // image と image_alt のみ更新。reviewed / draft / その他は絶対に変更しない。
  data.image     = imageEntry.path
  data.image_alt = imageEntry.alt

  writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')

  const BAR = '━'.repeat(52)
  console.log(BAR)
  console.log('画像割当完了')
  console.log(BAR)
  console.log(`  ファイル    : content/posts/${filename}`)
  console.log(`  image-id    : ${imageId}`)
  console.log(`  image       : ${prevImage || '（未設定）'} → ${imageEntry.path}`)
  console.log(`  image_alt   : ${prevImageAlt || '（未設定）'} → ${imageEntry.alt}`)
  console.log(`  reviewed    : ${data.reviewed}（変更なし）`)
  console.log(`  license     : ${imageEntry.license_source ?? ''} / ${imageEntry.license_note ?? ''}`)
  console.log(BAR)
  console.log()
  console.log('次:')
  console.log('  validate:posts')
  console.log('  dev で表示確認')
  console.log('  commit（push は Human）')
}

main()
