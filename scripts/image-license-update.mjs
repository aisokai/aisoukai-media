#!/usr/bin/env node
// image-license-update.mjs
// 指定した画像の license_note を Pixta 購入情報で更新する。
// Human がトリガーする。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
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

function extractPixtaId(id) {
  const idx = id.indexOf('-')
  return idx >= 0 ? id.slice(idx + 1) : id
}

function main() {
  const args    = parseArgs(process.argv.slice(2))
  const imageId = String(args._[0] ?? args.id ?? '').trim()
  const date    = String(args.date ?? '').trim()
  const plan    = String(args.plan ?? '').trim()

  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)

  console.log(BAR)
  console.log('  image:license:update — license_note を更新')
  console.log(BAR)

  // 引数バリデーション
  if (!imageId || !date || !plan) {
    console.error('使い方:')
    console.error('  npm run image:license:update -- <image-id> --date YYYY-MM-DD --plan "プラン名"')
    console.error()
    console.error('  --date : Pixta 購入日（YYYY-MM-DD）')
    console.error('  --plan : ダウンロードプラン（例: シングルパック, 定額プラン, 法人プラン）')
    process.exit(1)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`エラー: --date は YYYY-MM-DD 形式で指定してください（例: 2026-05-13）`)
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

  const images   = library.images ?? []
  const imgIndex = images.findIndex(img => img.id === imageId)

  if (imgIndex < 0) {
    console.error(`エラー: image-id "${imageId}" が見つかりません`)
    const ids = images.map(i => i.id).join(', ')
    console.error(`  登録済み ID: ${ids || '（なし）'}`)
    process.exit(1)
  }

  const img       = images[imgIndex]
  const pixtaId   = extractPixtaId(imageId)
  const oldNote   = img.license_note ?? ''
  const newNote   = `Pixta ID: ${pixtaId} — 購入日: ${date} / プラン: ${plan}`

  console.log()
  console.log(`  image-id    : ${imageId}`)
  console.log(`  category    : ${img.category}`)
  console.log(`  path        : ${img.path}`)
  console.log()
  console.log(`  license_note（変更前）:`)
  console.log(`    ${oldNote}`)
  console.log(`  license_note（変更後）:`)
  console.log(`    ${newNote}`)
  console.log()

  if (oldNote === newNote) {
    console.log('  ℹ️  変更なし（同一の値がすでに設定されています）')
    console.log(BAR)
    return
  }

  // 更新
  images[imgIndex] = { ...img, license_note: newNote }
  library.images   = images
  writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2) + '\n', 'utf8')

  console.log('  ✅ image-library.json を更新しました')
  console.log(DIV)
  console.log()
  console.log('次のステップ:')
  console.log('  npm run image:license:list  — 残 TODO 件数を確認する')
  console.log('  npm run image:check         — ライブラリ整合性を確認する')
  console.log(BAR)
}

main()
