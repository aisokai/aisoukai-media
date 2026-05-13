#!/usr/bin/env node
// image-list.mjs
// 画像ライブラリの状態サマリーを表示する。読み取り専用。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

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

// alt が空またはカテゴリデフォルト値のまま（未カスタマイズ）
function isDefaultAlt(img) {
  if (!img.alt || img.alt.trim() === '') return true
  const def = CATEGORY_ALT[img.category]
  return def ? img.alt === def : false
}

// license_note がデフォルト文言のまま、または未設定
function isUnclearedLicense(img) {
  const note = img.license_note ?? ''
  return note.trim() === '' || note.includes('ライセンス詳細を確認して更新すること')
}

function main() {
  const argv  = process.argv.slice(2)
  const showAll = argv.includes('--all')

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

  // 記事の image フィールドを収集（使用中パスの集合）
  const usedPaths = new Set()
  const postFiles = existsSync(POSTS_DIR)
    ? readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
    : []

  for (const f of postFiles) {
    try {
      const { data } = matter(readFileSync(join(POSTS_DIR, f), 'utf8'))
      if (typeof data.image === 'string' && data.image.trim()) {
        usedPaths.add(data.image.trim())
      }
    } catch { /* 読み取り失敗は無視 */ }
  }

  // 集計
  const categoryCount = {}
  for (const img of images) {
    categoryCount[img.category] = (categoryCount[img.category] ?? 0) + 1
  }

  const altIssues     = images.filter(isDefaultAlt)
  const licenseIssues = images.filter(isUnclearedLicense)
  const unusedImages  = images.filter((img) => !usedPaths.has(img.path))
  const usedImages    = images.filter((img) =>  usedPaths.has(img.path))
  const generalImages = images.filter((img) => img.category === 'general')

  const LIMIT = showAll ? Infinity : 10
  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)

  console.log(BAR)
  console.log('  image:list — 画像ライブラリ サマリー')
  console.log(BAR)
  console.log()
  console.log(`  合計              : ${String(images.length).padStart(4)} 件`)
  console.log(`  使用中            : ${String(usedImages.length).padStart(4)} 件`)
  console.log(`  未使用            : ${String(unusedImages.length).padStart(4)} 件`)
  console.log(`  alt 未カスタマイズ : ${String(altIssues.length).padStart(4)} 件`)
  console.log(`  license 未更新     : ${String(licenseIssues.length).padStart(4)} 件`)
  console.log()

  // ── カテゴリ別件数 ──
  console.log('カテゴリ別:')
  console.log(DIV)
  const sortedCats = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])
  for (const [cat, count] of sortedCats) {
    const flag = cat === 'general' ? '  ⚠️  手動分類を推奨' : ''
    console.log(`  ${cat.padEnd(16)}: ${String(count).padStart(4)} 件${flag}`)
  }
  console.log(DIV)
  console.log()

  // ── alt 未カスタマイズ ──
  if (altIssues.length > 0) {
    const shown = altIssues.slice(0, LIMIT)
    console.log(`alt 未カスタマイズ（${altIssues.length} 件）:`)
    console.log(DIV)
    for (const img of shown) {
      const altStr = img.alt ? img.alt.slice(0, 28) + '…' : '（空）'
      console.log(`  [${img.id}]`)
      console.log(`    category: ${img.category}   alt: ${altStr}`)
    }
    if (!showAll && altIssues.length > LIMIT) {
      console.log(`  ... 他 ${altIssues.length - LIMIT} 件（--all で全件表示）`)
    }
    console.log(DIV)
    console.log()
  }

  // ── license 未更新 ──
  if (licenseIssues.length > 0) {
    const shown = licenseIssues.slice(0, LIMIT)
    console.log(`license_note 未更新（${licenseIssues.length} 件）:`)
    console.log(DIV)
    for (const img of shown) {
      const noteStr = (img.license_note ?? '').slice(0, 36)
      console.log(`  [${img.id}]  source: ${img.license_source ?? '（未設定）'}`)
      console.log(`    note: ${noteStr || '（空）'}`)
    }
    if (!showAll && licenseIssues.length > LIMIT) {
      console.log(`  ... 他 ${licenseIssues.length - LIMIT} 件（--all で全件表示）`)
    }
    console.log(DIV)
    console.log()
  }

  // ── 未使用画像 ──
  if (unusedImages.length > 0) {
    const shown = unusedImages.slice(0, LIMIT)
    console.log(`未使用画像（${unusedImages.length} 件 — 記事に割当なし）:`)
    console.log(DIV)
    for (const img of shown) {
      console.log(`  [${img.id}]  ${img.path}`)
    }
    if (!showAll && unusedImages.length > LIMIT) {
      console.log(`  ... 他 ${unusedImages.length - LIMIT} 件（--all で全件表示）`)
    }
    console.log(DIV)
    console.log()
  }

  // ── 推奨アクション ──
  if (generalImages.length > 0 || altIssues.length > 0) {
    console.log('次のステップ:')
    if (generalImages.length > 0) {
      console.log(`  1. general 画像 ${generalImages.length} 件をカテゴリ分類する`)
      console.log('     npm run image:reclassify -- <id> --category <category>')
    }
    if (altIssues.length > 0) {
      console.log('  2. data/image-library.json の alt を画像内容に合わせて更新する')
    }
    if (licenseIssues.length > 0) {
      console.log('  3. data/image-library.json の license_note を更新する')
    }
    console.log()
  }

  console.log(BAR)
}

main()
