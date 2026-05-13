#!/usr/bin/env node
// image-license-bulk-template.mjs
// TODO が残る画像の license 情報を Markdown テーブルで出力する。
// Human が purchase_date と plan を埋めて image:license:update に使う。
// 読み取り専用 — data/ ファイルは変更しない。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')
const OUT_PATH     = join(ROOT, 'docs', 'license-bulk-template.md')

function isTodo(note) {
  if (!note || note.trim() === '') return true
  return note.includes('TODO')
}

function extractPixtaId(id) {
  const idx = id.indexOf('-')
  return idx >= 0 ? id.slice(idx + 1) : id
}

function main() {
  const argv    = process.argv.slice(2)
  const saveFile = !argv.includes('--stdout')
  const BAR = '═'.repeat(62)

  console.log(BAR)
  console.log('  image:license:bulk-template — TODO 画像一覧を出力')
  console.log(BAR)
  console.log()

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
  const todos  = images.filter(img => isTodo(img.license_note))

  if (todos.length === 0) {
    console.log('  ✅ TODO の画像はありません（全件 license_note が入力済みです）')
    console.log(BAR)
    return
  }

  console.log(`  TODO 件数: ${todos.length} 件 / 全 ${images.length} 件`)
  console.log()

  // Markdown テーブル生成
  const today = new Date().toISOString().slice(0, 10)

  const lines = [
    `# license_note 一括入力テンプレート`,
    ``,
    `生成日: ${today}  `,
    `TODO 件数: ${todos.length} 件`,
    ``,
    `purchase_date と plan を埋めて、以下のコマンドで 1 件ずつ更新してください:`,
    `\`\`\``,
    `npm run image:license:update -- <image_id> --date YYYY-MM-DD --plan "シングルパック"`,
    `\`\`\``,
    ``,
    `---`,
    ``,
    `| image_id | pixta_id | category | path | current_note | purchase_date | plan |`,
    `|----------|----------|----------|------|--------------|---------------|------|`,
  ]

  for (const img of todos) {
    const pixtaId = extractPixtaId(img.id)
    const note    = (img.license_note ?? '').replace(/\|/g, '\\|')
    const path    = img.path.replace('/images/library/', '')
    lines.push(`| ${img.id} | ${pixtaId} | ${img.category} | ${path} | ${note} | （記入） | （記入） |`)
  }

  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`## plan 選択肢`)
  lines.push(``)
  lines.push(`- シングルパック`)
  lines.push(`- 定額プラン（月 XX 点）`)
  lines.push(`- 法人プラン`)
  lines.push(``)

  const content = lines.join('\n')

  if (saveFile) {
    writeFileSync(OUT_PATH, content, 'utf8')
    console.log(`  出力先: docs/license-bulk-template.md`)
    console.log()
    console.log('次のステップ:')
    console.log('  1. docs/license-bulk-template.md を開いて purchase_date と plan を記入する')
    console.log('  2. npm run image:license:update -- <image_id> --date YYYY-MM-DD --plan "プラン名"  # 1 件ずつ')
    console.log('  3. npm run image:license:list  — 残 TODO 件数を確認する')
  } else {
    console.log(content)
  }

  console.log()
  console.log(BAR)
}

main()
