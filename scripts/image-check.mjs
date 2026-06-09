#!/usr/bin/env node
// image-check.mjs
// image-library.json の整合性を検証する。読み取り専用。
// エラーがあれば exit 1 を返す。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
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

function main() {
  const auditLicenses = process.argv.includes('--audit-licenses')
  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)

  console.log(BAR)
  console.log('  image:check — 画像ライブラリ 整合性チェック')
  if (auditLicenses) {
    console.log('  license audit: on')
  }
  console.log(BAR)

  // ── library 読み込み ──
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
  const errors        = []
  const warnings      = []   // alt / tags / article 参照 など構造的な警告
  const licenseTodos  = []   // license_note が TODO のまま（Human 作業）
  const catWarnings   = []   // カテゴリ不足（推奨購入）

  // ── 1. id 重複確認 ──
  const idSeen = new Map()
  for (const img of images) {
    const key = img.id
    if (idSeen.has(key)) {
      errors.push(`id 重複: "${key}"`)
    } else {
      idSeen.set(key, true)
    }
  }

  // ── 2. 各エントリの検証 ──
  for (const img of images) {
    const label = `[${img.id}]`

    // 必須フィールドの存在
    if (!img.id || String(img.id).trim() === '') {
      errors.push(`${label} id が空です`)
    }
    if (!img.path || String(img.path).trim() === '') {
      errors.push(`${label} path が空です`)
      continue  // path がないと以降のチェックが無意味
    }

    // path 形式
    if (!img.path.startsWith('/')) {
      errors.push(`${label} path が "/" で始まっていません: "${img.path}"`)
    }

    // path 実在確認
    const diskPath = join(ROOT, 'public', img.path)
    if (!existsSync(diskPath)) {
      errors.push(`${label} ファイルが存在しません: public${img.path}`)
    }

    // category 妥当性
    if (!img.category || !VALID_CATEGORIES.has(img.category)) {
      errors.push(`${label} category が無効です: "${img.category ?? ''}"`)
    }

    // alt 確認
    if (!img.alt || img.alt.trim() === '') {
      warnings.push(`${label} alt が空です`)
    } else {
      const defAlt = CATEGORY_ALT[img.category]
      if (defAlt && img.alt === defAlt) {
        warnings.push(`${label} alt がデフォルト値のままです（画像内容に合わせて更新を推奨）`)
      }
    }

    // license_source 確認
    const src = img.license_source ?? ''
    if (!src.trim()) {
      warnings.push(`${label} license_source が空です`)
    } else if (src === '不明') {
      warnings.push(`${label} license_source が "不明" です。確認が必要です`)
    }

    // license_note 確認（TODO は別グループ）
    const note = img.license_note ?? ''
    if (!note.trim()) {
      warnings.push(`${label} license_note が空です`)
    } else if (auditLicenses && (note.includes('ライセンス詳細を確認して更新すること') || note.includes('TODO'))) {
      const pixtaId = img.id.slice(img.id.indexOf('-') + 1)
      licenseTodos.push({ id: img.id, pixtaId, category: img.category, note })
    }

    // tags 確認
    if (!Array.isArray(img.tags) || img.tags.length === 0) {
      warnings.push(`${label} tags が空配列です（image:suggest のスコアが 0 になります）`)
    }
  }

  // ── 3b. 不足カテゴリの確認 ──
  const SHORTAGE_CATS = {
    'root-canal':   { label: '根管治療', min: 1 },
    'periodontal':  { label: '歯周病治療', min: 1 },
    'wisdom-tooth': { label: '親知らず', min: 1 },
  }
  const countByCat = {}
  for (const img of images) {
    countByCat[img.category] = (countByCat[img.category] ?? 0) + 1
  }
  for (const [cat, info] of Object.entries(SHORTAGE_CATS)) {
    const count = countByCat[cat] ?? 0
    if (count < info.min) {
      catWarnings.push(`${info.label}（${cat}）の専用画像が ${count} 件です（npm run image:purchase:list で購入候補を確認）`)
    }
  }

  // ── 3. 記事 frontmatter の image 参照確認 ──
  const libraryPaths = new Set(images.map((img) => img.path))
  const postFiles = existsSync(POSTS_DIR)
    ? readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
    : []

  const articleIssues = []
  for (const f of postFiles) {
    try {
      const { data } = matter(readFileSync(join(POSTS_DIR, f), 'utf8'))
      const imgPath = typeof data.image === 'string' ? data.image.trim() : ''
      if (imgPath && !libraryPaths.has(imgPath)) {
        articleIssues.push({ file: f, path: imgPath })
        warnings.push(`content/posts/${f}: image "${imgPath}" が image-library.json に存在しません`)
      }
    } catch (e) {
      warnings.push(`content/posts/${f}: 読み取り失敗: ${e.message}`)
    }
  }

  // ── 結果表示 ──
  console.log()
  console.log(`  ライブラリ件数 : ${images.length} 件`)
  console.log(`  確認記事数     : ${postFiles.length} 件`)
  console.log()

  const hasErrors      = errors.length > 0
  const hasWarnings    = warnings.length > 0
  const hasCatWarnings = catWarnings.length > 0
  const hasTodos       = licenseTodos.length > 0
  const hasAnyIssue    = hasErrors || hasWarnings || hasCatWarnings || hasTodos

  if (!hasAnyIssue) {
    console.log('✅ All checks passed')
    console.log(BAR)
    process.exit(0)
  }

  // エラー（要修正）
  if (hasErrors) {
    console.log(`❌ エラー（${errors.length} 件）— 要修正:`)
    console.log(DIV)
    for (const e of errors) {
      console.error(`  ❌ ${e}`)
    }
    console.log(DIV)
    console.log()
  }

  // 構造的警告（alt / tags / 記事参照など）
  if (hasWarnings) {
    console.log(`⚠️  構造的警告（${warnings.length} 件）:`)
    console.log(DIV)
    for (const w of warnings) {
      console.warn(`  ⚠️  ${w}`)
    }
    console.log(DIV)
    console.log()
  }

  // カテゴリ不足警告（推奨購入）
  if (hasCatWarnings) {
    console.log(`📦 カテゴリ不足（${catWarnings.length} 件）— 購入推奨:`)
    console.log(DIV)
    for (const w of catWarnings) {
      console.warn(`  📦 ${w}`)
    }
    console.log(DIV)
    console.log()
  }

  // license_note TODO（Human 作業）
  if (hasTodos) {
    console.log(`📝 license_note 未入力（${licenseTodos.length} 件）— Human が購入情報を記入:`)
    console.log(DIV)
    const SHOW = Math.min(licenseTodos.length, 5)
    for (let i = 0; i < SHOW; i++) {
      const t = licenseTodos[i]
      console.log(`  📝 [${t.id}]  Pixta ID: ${t.pixtaId}  category: ${t.category}`)
    }
    if (licenseTodos.length > SHOW) {
      console.log(`  ... 他 ${licenseTodos.length - SHOW} 件（npm run image:license:list で全件確認）`)
    }
    console.log(DIV)
    console.log('  更新コマンド:')
    console.log('    npm run image:license:update -- <image-id> --date YYYY-MM-DD --plan "プラン名"')
    console.log()
  }

  if (hasErrors) {
    console.error(`❌ ${errors.length} 件のエラーを修正してください`)
    console.log(BAR)
    process.exit(1)
  }

  // 警告のみ
  const totalWarn = warnings.length + catWarnings.length + licenseTodos.length
  console.log(`⚠️  警告 ${totalWarn} 件あり。エラーなし。`)
  if (!auditLicenses) {
    console.log('  license_note の未入力監査は npm run image:license:list または image:check -- --audit-licenses で確認')
  }
  console.log(BAR)
  process.exit(0)
}

main()
