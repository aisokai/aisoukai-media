#!/usr/bin/env node
// image-license-list.mjs
// license_note に TODO が残っている画像を一覧表示する。読み取り専用。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

function parseArgs(argv) {
  const args = { _: [], all: false }
  for (const a of argv) {
    if (a === '--all') args.all = true
    else args._.push(a)
  }
  return args
}

function extractPixtaId(id) {
  const idx = id.indexOf('-')
  return idx >= 0 ? id.slice(idx + 1) : id
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)

  console.log(BAR)
  console.log('  image:license:list — license_note 未入力一覧')
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

  const images = library.images ?? []
  const todo = images.filter(img => (img.license_note ?? '').includes('TODO'))

  console.log()
  console.log(`  全 ${images.length} 件中、license 未入力: ${todo.length} 件`)
  console.log()

  if (todo.length === 0) {
    console.log('✅ license_note の TODO は残っていません')
    console.log(BAR)
    return
  }

  const LIMIT = args.all ? todo.length : Math.min(todo.length, 20)

  console.log(`  表示: ${LIMIT} 件${args.all ? '' : `（--all で全 ${todo.length} 件表示）`}`)
  console.log(DIV)
  console.log(
    `  ${'image-id'.padEnd(28)} ${'Pixta ID'.padEnd(12)} category      license_note`
  )
  console.log(DIV)

  for (let i = 0; i < LIMIT; i++) {
    const img      = todo[i]
    const pixtaId  = extractPixtaId(img.id)
    const note     = img.license_note ?? ''
    console.log(
      `  ${img.id.padEnd(28)} ${pixtaId.padEnd(12)} ${(img.category ?? '').padEnd(14)}${note}`
    )
  }

  console.log(DIV)
  console.log()
  console.log('更新コマンド（1件ずつ実行）:')
  console.log('  npm run image:license:update -- <image-id> --date YYYY-MM-DD --plan "シングルパック"')
  console.log()
  console.log('例:')
  if (todo.length > 0) {
    const ex = todo[0]
    console.log(`  npm run image:license:update -- ${ex.id} --date 2026-05-13 --plan "シングルパック"`)
  }
  console.log(BAR)
}

main()
