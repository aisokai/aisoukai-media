#!/usr/bin/env node
// image-import-inbox.mjs
// public/images/library/inbox/ 配下の画像を自動分類して image-library.json に登録する。
// Human がトリガーする。画像加工はしない。元の inbox は削除しない。
//
// --dry-run (デフォルト) : 処理内容を表示するだけ。ファイル・JSON を変更しない。
// --apply               : ファイルコピー + image-library.json 更新を実行する。
// --move                : --apply と併用するとコピーではなく移動する。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const LIBRARY_DIR  = join(ROOT, 'public', 'images', 'library')
const INBOX_DIR    = join(LIBRARY_DIR, 'inbox')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg'])

// ── カテゴリ分類テーブル ───────────────────────────────────────
// ファイル名・親フォルダ名のいずれかにキーワードが含まれていれば該当カテゴリに分類する
const CATEGORY_RULES = [
  {
    category: 'cavity',
    keywords: ['cavity', 'caries', 'decay', '虫歯', 'むし歯', 'cavit'],
  },
  {
    category: 'root-canal',
    keywords: ['root', 'canal', 'rootcanal', '根管', 'endodontic', 'pulp'],
  },
  {
    category: 'periodontal',
    keywords: ['periodontal', 'periodont', 'gum', 'gingiv', '歯周', '歯肉'],
  },
  {
    category: 'preventive',
    keywords: ['preventive', 'prevention', 'cleaning', 'fluoride', 'hygiene', '予防', 'フッ素', '定期検診', 'pmtc'],
  },
  {
    category: 'pediatric',
    keywords: ['pediatric', 'paediatric', 'child', 'kids', 'baby', '小児', '子供', '子ども', '乳歯'],
  },
  {
    category: 'wisdom-tooth',
    keywords: ['wisdom', 'extraction', '親知らず', '抜歯', 'molar'],
  },
  {
    category: 'implant',
    keywords: ['implant', 'インプラント'],
  },
  {
    category: 'announcement',
    keywords: ['announcement', 'notice', 'news', 'info', 'お知らせ'],
  },
]

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

// Pixta の "_s" / "_m" / "_l" サフィックスを除去して素の ID を取り出す
function stripPixtaSuffix(name) {
  return name.replace(/_[smlxo]$/, '')
}

// ファイル名・フォルダ名からカテゴリを推定する（一致なし → 'general'）
function inferCategory(filename, parentFolderName) {
  const haystack = `${filename} ${parentFolderName}`.toLowerCase()
  for (const { category, keywords } of CATEGORY_RULES) {
    if (keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return category
    }
  }
  return 'general'
}

// Pixta 形式かどうかを判定（数字のみ + 任意の _suffix）
function isPixtaId(base) {
  return /^\d+(_[a-z])?$/.test(base)
}

// 出力ファイル名（重複時は連番サフィックス）
function resolveDestFilename(destDir, category, baseId, ext) {
  const primary = `${category}-${baseId}${ext}`
  if (!existsSync(join(destDir, primary))) return primary
  let n = 2
  while (true) {
    const candidate = `${category}-${baseId}-${n}${ext}`
    if (!existsSync(join(destDir, candidate))) return candidate
    n++
  }
}

// inbox を再帰走査して画像ファイル一覧を返す
function scanInbox(dir) {
  const results = []
  if (!existsSync(dir)) return results

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        // inbox の直下のサブフォルダは走査対象（inbox 自体は除外）
        if (fullPath !== INBOX_DIR) walk(fullPath)
        else walk(fullPath)
      } else if (stat.isFile() && IMAGE_EXTS.has(extname(entry).toLowerCase())) {
        results.push(fullPath)
      }
    }
  }

  walk(dir)
  return results
}

// ── メイン ────────────────────────────────────────────────────
function main() {
  const argv  = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const move  = argv.includes('--move')
  const dryRun = !apply

  const BAR  = '═'.repeat(62)
  const DIV  = '─'.repeat(62)
  const mode = apply ? (move ? '実行モード (--apply --move)' : '実行モード (--apply)') : 'dry-run（確認のみ）'

  console.log(BAR)
  console.log(`  image:import-inbox — ${mode}`)
  console.log(BAR)

  if (!existsSync(INBOX_DIR)) {
    console.error(`エラー: inbox フォルダが存在しません: public/images/library/inbox/`)
    process.exit(1)
  }

  // ── 既存ライブラリ読み込み ──
  let library = { images: [] }
  if (existsSync(LIBRARY_PATH)) {
    try {
      library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
    } catch (e) {
      console.error(`パースエラー (image-library.json): ${e.message}`)
      process.exit(1)
    }
  }

  const existingPaths = new Set((library.images ?? []).map((img) => img.path))
  const existingIds   = new Set((library.images ?? []).map((img) => img.id))

  // ── inbox 走査 ──
  const imageFiles = scanInbox(INBOX_DIR)
  console.log()
  console.log(`  inbox 検出画像: ${imageFiles.length} 件`)
  console.log(`  既存ライブラリ: ${library.images.length} 件`)
  console.log()

  if (imageFiles.length === 0) {
    console.log('  inbox に画像ファイルが見つかりませんでした。')
    console.log(`  対象形式: ${[...IMAGE_EXTS].join(' / ')}`)
    console.log(BAR)
    return
  }

  // ── 各ファイルの処理計画を作成 ──
  const plans = []
  const categoryCount = {}
  let skippedCount = 0

  for (const srcPath of imageFiles) {
    const ext         = extname(srcPath).toLowerCase()
    const fileBase    = basename(srcPath, ext)   // 例: 34130816_s
    const parentName  = basename(dirname(srcPath)) // 例: 20260513013850_photo
    const category    = inferCategory(fileBase, parentName)
    const baseId      = stripPixtaSuffix(fileBase)  // 例: 34130816
    const pixtaSource = isPixtaId(fileBase) ? 'Pixta' : '不明'

    const destDir      = join(LIBRARY_DIR, category)
    const destFilename = resolveDestFilename(destDir, category, baseId, ext)
    const destPath     = join(destDir, destFilename)
    const publicPath   = `/images/library/${category}/${destFilename}`

    // 既にライブラリに登録済みのパスはスキップ
    if (existingPaths.has(publicPath)) {
      skippedCount++
      plans.push({ skip: true, srcPath, publicPath, category, reason: '登録済み' })
      continue
    }

    // 一意 ID を生成（重複回避）
    let id = `${category}-${baseId}`
    if (existingIds.has(id)) {
      let n = 2
      while (existingIds.has(`${id}-${n}`)) n++
      id = `${id}-${n}`
    }
    existingIds.add(id)

    categoryCount[category] = (categoryCount[category] ?? 0) + 1

    plans.push({
      skip:       false,
      srcPath,
      destPath,
      publicPath,
      category,
      id,
      ext,
      pixtaSource,
      parentName,
      entry: {
        id,
        path:          publicPath,
        category,
        tags:          [...CATEGORY_TAGS[category]],
        alt:           CATEGORY_ALT[category],
        license_source: pixtaSource,
        license_note:  isPixtaId(fileBase) ? `Pixta ID: ${baseId}（ライセンス詳細を確認して更新すること）` : '（不明 — ライセンス情報を確認して入力すること）',
      },
    })
  }

  // ── 処理計画の表示 ──
  const toProcess = plans.filter((p) => !p.skip)
  const toSkip    = plans.filter((p) => p.skip)

  if (toProcess.length === 0) {
    console.log('  新規登録対象はありません（すべて登録済みまたはスキップ）')
    console.log(BAR)
    return
  }

  // カテゴリ別サマリー
  console.log('分類結果:')
  console.log(DIV)
  const allCategories = Object.keys(categoryCount).sort()
  for (const cat of allCategories) {
    const flag = cat === 'general' ? '  ⚠️ general (手動分類を推奨)' : ''
    console.log(`  ${cat.padEnd(16)} : ${String(categoryCount[cat]).padStart(3)} 件${flag}`)
  }
  if (toSkip.length > 0) {
    console.log(`  ${'スキップ(登録済)'.padEnd(16)} : ${String(toSkip.length).padStart(3)} 件`)
  }
  console.log(DIV)
  console.log(`  合計新規登録      : ${toProcess.length} 件`)
  console.log()

  // 詳細リスト
  console.log('処理詳細:')
  console.log(DIV)
  for (const plan of toProcess) {
    const srcRel = relative(ROOT, plan.srcPath)
    const action = dryRun ? '[DRY-RUN]' : (move ? '[移動]' : '[コピー]')
    console.log(`${action} ${srcRel}`)
    console.log(`         → ${plan.publicPath}`)
    console.log(`         id: ${plan.id}  category: ${plan.category}  source: ${plan.pixtaSource}`)
  }
  console.log(DIV)

  if (dryRun) {
    console.log()
    console.log('dry-run のためファイルおよび JSON は変更しません。')
    console.log('実行するには --apply をつけてください:')
    console.log('  npm run image:import-inbox -- --apply')
    console.log('  npm run image:import-inbox -- --apply --move   (移動)')
    console.log(BAR)
    return
  }

  // ── 実行フェーズ ──
  const newEntries = []
  const errors     = []

  for (const plan of toProcess) {
    const destDir = dirname(plan.destPath)
    try {
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      if (move) {
        renameSync(plan.srcPath, plan.destPath)
      } else {
        copyFileSync(plan.srcPath, plan.destPath)
      }
      newEntries.push(plan.entry)
    } catch (err) {
      errors.push({ plan, err })
      console.error(`  ❌ エラー: ${plan.srcPath}: ${err.message}`)
    }
  }

  // JSON 更新
  library.images = [...(library.images ?? []), ...newEntries]
  writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2) + '\n', 'utf8')

  // ── 完了サマリー ──
  console.log()
  console.log(BAR)
  console.log('  import-inbox 完了')
  console.log(DIV)
  console.log(`  処理成功   : ${newEntries.length} 件`)
  if (errors.length > 0) {
    console.log(`  エラー     : ${errors.length} 件`)
  }
  console.log(`  image-library.json: 合計 ${library.images.length} 件`)
  console.log()
  console.log('次のステップ:')
  console.log('  1. data/image-library.json を開いて general 行きの画像を適切なカテゴリに修正する')
  console.log('  2. alt テキストを画像内容に合わせて書き直す')
  console.log('  3. license_note に Pixta 購入 ID / 日付などを追記する')
  console.log('  4. npm run validate:posts')
  console.log('  5. npm run image:suggest -- <slug> で記事に割り当てる')
  console.log(BAR)
}

main()
