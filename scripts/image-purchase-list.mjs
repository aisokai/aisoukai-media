#!/usr/bin/env node
// image-purchase-list.mjs
// 不足カテゴリ（画像 0 件 or 少数）の購入候補を一覧表示する。読み取り専用。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

// カテゴリごとの購入ガイド（docs/image-purchase-guide.md の要約）
const PURCHASE_GUIDE = {
  'root-canal': {
    label:    '根管治療',
    target:   3,
    types: [
      '歯の断面イラスト（神経・歯髄が描かれたもの）',
      'ファイル（根管用器具）を使った治療イメージ',
      '痛みの少ない治療を受けている患者イメージ',
    ],
    avoid: [
      '抜歯後の出血・血液が鮮明なもの',
      '患者が明らかに苦痛の表情をしているもの',
    ],
    keywords: ['根管治療 歯の神経', '歯科 断面 神経 イラスト', 'ラバーダム 歯科'],
    caution:  '「痛くない根管治療」「○回で完了」等の断定・保証表現を含む画像テキストは不可',
  },
  'periodontal': {
    label:    '歯周病治療',
    target:   3,
    types: [
      '歯肉炎・歯周炎を示すイラスト',
      'スケーリング・PMTC 等の処置イメージ',
      'ブラッシング指導の様子',
    ],
    avoid: [
      '実際の患者の化膿・重度歯周炎を強調した写真',
      '「歯が抜ける」を過激に描いたビジュアル',
    ],
    keywords: ['歯周病 歯ぐき スケーリング', '歯周病 イラスト 歯肉炎', '歯周病 原因 生活習慣'],
    caution:  '「歯周病が完治する」「骨が再生する」等の断定は不可。全身疾患との関連は「リスクがある」表現に留める',
  },
  'wisdom-tooth': {
    label:    '親知らず',
    target:   3,
    types: [
      '水平埋伏親知らずのイラスト断面図',
      '抜歯前の診察・説明シーン',
      '術後ケア（ガーゼ・アイスパック）のイメージ',
    ],
    avoid: [
      '抜歯中の出血・抜いた歯の写真',
      '痛みで泣いているような極端な表情',
    ],
    keywords: ['親知らず 抜歯 歯科 水平埋伏', '口腔外科 親知らず 説明', '親知らず X線 パノラマ'],
    caution:  '「必ず抜く必要がある」等の断定を含む画像テキストは使用不可',
  },
}

const MIN_THRESHOLD = 2  // この枚数以下なら「不足」と見なす

function main() {
  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)

  console.log(BAR)
  console.log('  image:purchase:list — 不足カテゴリ 購入候補ガイド')
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

  // カテゴリ別件数
  const countByCategory = {}
  for (const img of images) {
    countByCategory[img.category] = (countByCategory[img.category] ?? 0) + 1
  }

  const shortfall = Object.keys(PURCHASE_GUIDE).filter(
    cat => (countByCategory[cat] ?? 0) <= MIN_THRESHOLD
  )

  console.log()
  console.log('カテゴリ別件数（不足チェック）:')
  console.log(DIV)
  for (const [cat, info] of Object.entries(PURCHASE_GUIDE)) {
    const count = countByCategory[cat] ?? 0
    const icon  = count === 0 ? '❌' : count <= MIN_THRESHOLD ? '⚠️ ' : '✅'
    console.log(`  ${icon} ${info.label.padEnd(12)} ${count} 件（目標: ${info.target} 枚以上）`)
  }
  console.log(DIV)

  if (shortfall.length === 0) {
    console.log()
    console.log('✅ 不足カテゴリはありません')
    console.log(BAR)
    return
  }

  console.log()
  console.log(`不足カテゴリ: ${shortfall.length} 件`)

  for (const cat of shortfall) {
    const info  = PURCHASE_GUIDE[cat]
    const count = countByCategory[cat] ?? 0

    console.log()
    console.log(BAR)
    console.log(`  【${info.label}】(${cat})  現在 ${count} 件 → 目標 ${info.target} 枚以上`)
    console.log(DIV)

    console.log('  必要な画像タイプ:')
    for (const t of info.types) {
      console.log(`    • ${t}`)
    }

    console.log()
    console.log('  避けるべき画像:')
    for (const a of info.avoid) {
      console.log(`    ✕ ${a}`)
    }

    console.log()
    console.log('  Pixta 推奨検索キーワード:')
    for (const k of info.keywords) {
      console.log(`    「${k}」`)
    }

    console.log()
    console.log(`  医療広告注意: ${info.caution}`)
  }

  console.log()
  console.log(BAR)
  console.log('購入後のフロー:')
  console.log(DIV)
  console.log('  1. ダウンロードした画像を public/images/library/inbox/ に配置')
  console.log('  2. npm run image:import-inbox            # dry-run で確認')
  console.log('  3. npm run image:import-inbox -- --apply # 実行')
  console.log('  4. npm run image:license:update -- <image-id> --date YYYY-MM-DD --plan "プラン"')
  console.log('  5. npm run image:check                   # エラーがないことを確認')
  console.log(BAR)

  console.log()
  console.log('詳細: docs/image-purchase-guide.md')
  console.log(BAR)
}

main()
