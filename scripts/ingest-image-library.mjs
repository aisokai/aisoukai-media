#!/usr/bin/env node
// ingest-image-library.mjs
// public/images/library/_inbox/ の画像を分類して data/image-library.json に登録する。
// Human（または MitaniOS DMP メニューからの手動起動）がトリガーする。常駐しない。
//
// 方針:
//   - 先生が _inbox に入れる画像は利用可能である前提（license_status: assumed_approved 固定）
//   - 著作権確認・外部照会・ライセンス判定は行わない
//   - sha256 で重複判定し、登録済みの画像はスキップする
//   - 分類はファイル名キーワード + sidecar（<filename>.meta.json）の希望カテゴリのみ
//
// 使い方:
//   node scripts/ingest-image-library.mjs --dry-run   (確認のみ。デフォルト)
//   node scripts/ingest-image-library.mjs --apply     (移動 + manifest 更新)
//
// 出力の最終行に機械可読サマリー「RESULT_JSON: {...}」を出す（MitaniOS が解析する）。
import { createHash } from 'node:crypto'
import {
  existsSync, mkdirSync, readdirSync, readFileSync,
  renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const LIBRARY_DIR  = join(ROOT, 'public', 'images', 'library')
const INBOX_DIR    = join(LIBRARY_DIR, '_inbox')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

// ── 分類カテゴリ ──────────────────────────────────────────────
export const INGEST_CATEGORIES = [
  'cavity', 'root-canal', 'periodontal', 'whitening',
  'pediatric', 'denture', 'prevention', 'general',
]

// ファイル名にキーワードが含まれていれば該当カテゴリ（先勝ち）。一致なし → general
const CATEGORY_RULES = [
  { category: 'root-canal',  keywords: ['root-canal', 'rootcanal', 'root_canal', 'endodontic', 'pulp', '根管', '神経'] },
  { category: 'whitening',   keywords: ['whitening', 'whiten', 'bleach', 'ホワイトニング', '審美'] },
  { category: 'cavity',      keywords: ['cavity', 'caries', 'decay', '虫歯', 'むし歯'] },
  { category: 'periodontal', keywords: ['periodontal', 'periodont', 'perio', 'gum', 'gingiv', '歯周', '歯肉', '歯ぐき'] },
  { category: 'pediatric',   keywords: ['pediatric', 'paediatric', 'child', 'kids', 'baby', '小児', '子供', '子ども', '乳歯'] },
  { category: 'denture',     keywords: ['denture', '入れ歯', '義歯'] },
  { category: 'prevention',  keywords: ['prevention', 'preventive', 'cleaning', 'fluoride', 'hygiene', 'pmtc', '予防', 'フッ素', '定期検診', '検診'] },
]

const CATEGORY_ALT = {
  'cavity':      '虫歯の治療に関するイメージ',
  'root-canal':  '根管治療に関するイメージ',
  'periodontal': '歯周病の治療・予防に関するイメージ',
  'whitening':   'ホワイトニング・審美歯科に関するイメージ',
  'pediatric':   '小児歯科に関するイメージ',
  'denture':     '入れ歯・義歯に関するイメージ',
  'prevention':  '予防歯科・定期検診に関するイメージ',
  'general':     '歯科診療に関するイメージ',
}

// 既存の自動画像選択（scripts/lib/image-scoring.mjs）はタグ一致でスコアリングするため、
// 新規登録分にも日本語タグを付与して記事候補に乗るようにする
const CATEGORY_TAGS = {
  'cavity':      ['虫歯', '治療', '歯科'],
  'root-canal':  ['根管治療', '神経', '歯科'],
  'periodontal': ['歯周病', '歯ぐき', '歯科'],
  'whitening':   ['ホワイトニング', '審美', '歯科'],
  'pediatric':   ['小児歯科', '子ども', '乳歯', '歯科'],
  'denture':     ['入れ歯', '義歯', '歯科'],
  'prevention':  ['予防', '定期検診', 'クリーニング', '歯科'],
  'general':     ['歯科', '歯科診療'],
}

// ── 画像寸法・フォーマット判定（外部依存なし。ヘッダのみ読む）──
function parsePng(buf) {
  if (buf.length < 24) return null
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!sig.every((b, i) => buf[i] === b)) return null
  return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function parseJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) { offset++; continue }
    const marker = buf[offset + 1]
    if (marker === 0xff) { offset++; continue }
    // SOF0〜SOF15（C4/C8/CC はテーブル系のため除外）
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { format: 'jpeg', height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
    }
    if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) { offset += 2; continue }
    offset += 2 + buf.readUInt16BE(offset + 2)
  }
  return null
}

function parseWebp(buf) {
  if (buf.length < 30) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null
  const chunk = buf.toString('ascii', 12, 16)
  if (chunk === 'VP8 ') {
    return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (buf[20] !== 0x2f) return null
    const bits = buf.readUInt32LE(21)
    return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    return { format: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
  }
  return null
}

function parseAvif(buf) {
  if (buf.length < 16 || buf.toString('ascii', 4, 8) !== 'ftyp') return null
  const brand = buf.toString('ascii', 8, 12)
  if (brand !== 'avif' && brand !== 'avis') return null
  // ispe (Image Spatial Extents) box を走査: [size(4)][ispe][ver/flags(4)][w(4)][h(4)]
  let idx = buf.indexOf('ispe')
  while (idx !== -1 && idx + 16 <= buf.length) {
    const width  = buf.readUInt32BE(idx + 8)
    const height = buf.readUInt32BE(idx + 12)
    if (width > 0 && width < 65536 && height > 0 && height < 65536) {
      return { format: 'avif', width, height }
    }
    idx = buf.indexOf('ispe', idx + 4)
  }
  return { format: 'avif', width: null, height: null }
}

export function readImageMeta(buf) {
  return parsePng(buf) ?? parseJpeg(buf) ?? parseWebp(buf) ?? parseAvif(buf)
}

// ── ファイル名 slug 化 ────────────────────────────────────────
export function slugifyBasename(base, sha256) {
  const slug = String(base)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  // 日本語名などで slug が空になる場合は hash 先頭 8 桁で代替
  return slug || `img-${sha256.slice(0, 8)}`
}

function inferCategory(filename, sidecarCategory) {
  if (sidecarCategory && INGEST_CATEGORIES.includes(sidecarCategory)) return sidecarCategory
  const haystack = String(filename).normalize('NFKC').toLowerCase()
  for (const { category, keywords } of CATEGORY_RULES) {
    if (keywords.some((kw) => haystack.includes(kw.toLowerCase()))) return category
  }
  return 'general'
}

function uniqueName(taken, candidate) {
  if (!taken.has(candidate)) { taken.add(candidate); return candidate }
  let n = 2
  while (taken.has(`${candidate}-${n}`)) n++
  const result = `${candidate}-${n}`
  taken.add(result)
  return result
}

// _inbox を再帰走査して画像ファイル一覧を返す
function scanInbox(dir) {
  const results = []
  if (!existsSync(dir)) return results
  function walk(current) {
    for (const entry of readdirSync(current)) {
      if (entry.startsWith('.')) continue
      const fullPath = join(current, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) walk(fullPath)
      else if (stat.isFile() && IMAGE_EXTS.has(extname(entry).toLowerCase())) results.push(fullPath)
    }
  }
  walk(dir)
  return results.sort()
}

// MitaniOS アップロード時の sidecar（<画像ファイル名>.meta.json）を読む。なければ null
function readSidecar(imagePath) {
  const sidecarPath = `${imagePath}.meta.json`
  if (!existsSync(sidecarPath)) return null
  try {
    const data = JSON.parse(readFileSync(sidecarPath, 'utf8'))
    return {
      path:     sidecarPath,
      title:    typeof data.title === 'string' ? data.title.trim().slice(0, 120) : '',
      note:     typeof data.note === 'string' ? data.note.trim().slice(0, 300) : '',
      category: typeof data.category === 'string' ? data.category.trim() : '',
    }
  } catch {
    return { path: sidecarPath, title: '', note: '', category: '' }
  }
}

function sha256Of(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

// 既存ライブラリの sha256 集合（manifest 記載分 + ディスク上の既存画像の実 hash）
function collectExistingHashes(library) {
  const hashes = new Set()
  for (const img of library.images ?? []) {
    if (typeof img.sha256 === 'string' && img.sha256) hashes.add(img.sha256)
  }
  if (existsSync(LIBRARY_DIR)) {
    for (const entry of readdirSync(LIBRARY_DIR)) {
      if (entry === '_inbox' || entry.startsWith('.')) continue
      const dir = join(LIBRARY_DIR, entry)
      if (!statSync(dir).isDirectory()) continue
      for (const file of readdirSync(dir)) {
        if (!IMAGE_EXTS.has(extname(file).toLowerCase())) continue
        try { hashes.add(sha256Of(readFileSync(join(dir, file)))) } catch { /* skip */ }
      }
    }
  }
  return hashes
}

// ── メイン ────────────────────────────────────────────────────
function main() {
  const argv   = process.argv.slice(2)
  const apply  = argv.includes('--apply')
  const dryRun = !apply

  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)

  console.log(BAR)
  console.log(`  images:ingest — ${apply ? '実行モード (--apply)' : 'dry-run（確認のみ）'}`)
  console.log(BAR)

  if (!existsSync(INBOX_DIR)) {
    if (apply) mkdirSync(INBOX_DIR, { recursive: true })
    console.log()
    console.log('  _inbox フォルダが存在しません（画像 0 件として扱います）')
    console.log(`  場所: public/images/library/_inbox/`)
  }

  let library = { images: [] }
  if (existsSync(LIBRARY_PATH)) {
    try {
      library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
    } catch (e) {
      console.error(`パースエラー (image-library.json): ${e.message}`)
      process.exit(1)
    }
  }
  if (!Array.isArray(library.images)) library.images = []

  const existingIds    = new Set(library.images.map((img) => img.id))
  const existingPaths  = new Set(library.images.map((img) => img.path))
  const existingHashes = collectExistingHashes(library)
  const batchHashes    = new Set()  // 同一バッチ内の重複も検出する

  const imageFiles = scanInbox(INBOX_DIR)
  console.log()
  console.log(`  _inbox 検出画像 : ${imageFiles.length} 件`)
  console.log(`  既存ライブラリ  : ${library.images.length} 件`)
  console.log()

  const plans = []
  const errors = []
  const byCategory = {}

  for (const srcPath of imageFiles) {
    const ext      = extname(srcPath).toLowerCase()
    const fileBase = basename(srcPath, ext)
    let buf
    try {
      buf = readFileSync(srcPath)
    } catch (e) {
      errors.push(`${relative(ROOT, srcPath)}: 読み取り失敗: ${e.message}`)
      continue
    }

    const sha256 = sha256Of(buf)
    if (existingHashes.has(sha256) || batchHashes.has(sha256)) {
      plans.push({ skip: true, srcPath, reason: '重複（sha256 一致）' })
      continue
    }

    const meta = readImageMeta(buf)
    if (!meta) {
      errors.push(`${relative(ROOT, srcPath)}: 画像ヘッダを解析できません（対応形式: jpg/jpeg/png/webp/avif）`)
      continue
    }

    const sidecar  = readSidecar(srcPath)
    const category = inferCategory(fileBase, sidecar?.category)
    const slug     = slugifyBasename(fileBase, sha256)
    const now      = new Date().toISOString()

    // 出力ファイル名・id の一意化（ディスク上 + manifest + 同一バッチ）
    const destDir = join(LIBRARY_DIR, category)
    let destBase = slug
    let n = 1
    while (
      existsSync(join(destDir, `${destBase}${ext}`))
      || existingPaths.has(`/images/library/${category}/${destBase}${ext}`)
    ) {
      n++
      destBase = `${slug}-${n}`
    }
    const destFilename = `${destBase}${ext}`
    const publicPath   = `/images/library/${category}/${destFilename}`
    existingPaths.add(publicPath)

    const id = uniqueName(existingIds, `${category}-${destBase}`)
    batchHashes.add(sha256)
    byCategory[category] = (byCategory[category] ?? 0) + 1

    const title = sidecar?.title || fileBase
    const entry = {
      id,
      path:            publicPath,
      category,
      title,
      alt:             sidecar?.title ? `${sidecar.title}のイメージ` : CATEGORY_ALT[category],
      width:           meta.width,
      height:          meta.height,
      format:          meta.format,
      sha256,
      source_filename: basename(srcPath),
      license_status:  'assumed_approved',
      usage_status:    'active',
      created_at:      now,
      updated_at:      now,
      tags:            [...CATEGORY_TAGS[category]],
      license_source:  '院内提供',
      license_note:    '先生が_inboxへ投入した画像（assumed_approved運用）',
    }
    if (sidecar?.note) entry.note = sidecar.note

    plans.push({ skip: false, srcPath, destDir, destPath: join(destDir, destFilename), publicPath, sidecar, entry })
  }

  const toProcess = plans.filter((p) => !p.skip)
  const toSkip    = plans.filter((p) => p.skip)

  // ── 計画表示 ──
  if (toProcess.length > 0) {
    console.log('分類結果:')
    console.log(DIV)
    for (const cat of Object.keys(byCategory).sort()) {
      const flag = cat === 'general' ? '  ⚠️ general（分類キーワード不一致）' : ''
      console.log(`  ${cat.padEnd(14)} : ${String(byCategory[cat]).padStart(3)} 件${flag}`)
    }
    console.log(DIV)
    for (const plan of toProcess) {
      console.log(`  ${dryRun ? '[DRY-RUN]' : '[移動]'} ${relative(ROOT, plan.srcPath)}`)
      console.log(`           → ${plan.publicPath}  (id: ${plan.entry.id})`)
    }
    console.log(DIV)
  }
  if (toSkip.length > 0) {
    console.log(`  重複スキップ: ${toSkip.length} 件`)
    for (const plan of toSkip) {
      console.log(`    [SKIP] ${relative(ROOT, plan.srcPath)} — ${plan.reason}`)
    }
  }
  for (const e of errors) console.error(`  ❌ ${e}`)

  // ── 実行 ──
  let ingested = 0
  if (apply && toProcess.length > 0) {
    const newEntries = []
    for (const plan of toProcess) {
      try {
        if (!existsSync(plan.destDir)) mkdirSync(plan.destDir, { recursive: true })
        renameSync(plan.srcPath, plan.destPath)
        // sidecar の内容は manifest に取り込み済みのため、消費した sidecar は削除する
        if (plan.sidecar?.path && existsSync(plan.sidecar.path)) unlinkSync(plan.sidecar.path)
        newEntries.push(plan.entry)
        ingested++
      } catch (err) {
        errors.push(`${relative(ROOT, plan.srcPath)}: ${err.message}`)
      }
    }
    library.images = [...library.images, ...newEntries]
    writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2) + '\n', 'utf8')
  }

  const inboxRemaining = scanInbox(INBOX_DIR).length
  console.log()
  console.log(BAR)
  if (dryRun) {
    console.log(`  dry-run 完了 — ファイル・JSON は変更していません`)
    console.log('  実行: npm run images:ingest')
  } else {
    console.log(`  ingest 完了 — 登録 ${ingested} 件 / 重複スキップ ${toSkip.length} 件 / エラー ${errors.length} 件`)
    console.log(`  data/image-library.json: 合計 ${library.images.length} 件`)
  }
  console.log(BAR)

  const result = {
    mode:               dryRun ? 'dry-run' : 'apply',
    scanned:            imageFiles.length,
    ingested:           dryRun ? 0 : ingested,
    planned:            toProcess.length,
    skipped_duplicates: toSkip.length,
    errors:             errors.length,
    by_category:        byCategory,
    manifest_total:     library.images.length,
    inbox_remaining:    inboxRemaining,
  }
  console.log(`RESULT_JSON: ${JSON.stringify(result)}`)

  if (errors.length > 0) process.exit(1)
}

main()
