#!/usr/bin/env node
// validate-publish-ready.mjs
// publish-ready 判定チェッカー。記事ごとに承認状態・必須項目を検査し、
// Human が本文確認済みでない記事を明示する。ファイルは変更しない。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { getTodayJst, toDateStr } from './lib/post-publication-status.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

const VALID_CATEGORIES = new Set([
  '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
  '親知らず', 'インプラント', 'その他', 'お知らせ',
])

const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/

// 医療広告ガイドライン上リスクのある表現パターン
// publish-ready 記事の本文に含まれていた場合に warning を出す（build は止めない）
const MEDICAL_AD_PATTERNS = [
  { re: /必ず/,                              label: '断定表現「必ず」' },
  { re: /絶対/,                              label: '断定表現「絶対」' },
  { re: /完全に治る/,                        label: '断定表現「完全に治る」' },
  { re: /100[%％]/,                          label: '断定数値「100%」' },
  { re: /No\.?1|NO\.?1|ナンバーワン/,        label: '比較優位「No.1 / ナンバーワン」' },
  { re: /日本一/,                            label: '比較優位「日本一」' },
  { re: /最安/,                              label: '比較優位「最安」' },
  { re: /他院より/,                          label: '比較優位「他院より」' },
  { re: /痛くない/,                          label: '誇大表現「痛くない」' },
  { re: /副作用なし/,                        label: '誇大表現「副作用なし」' },
]

/**
 * 1 記事を検査し { blockers, warnings } を返す。
 * blockers: publish-ready を妨げる理由（これがあると ❌）
 * warnings: 注意喚起（publish-ready 判定には影響しないが表示する）
 */
function checkPost(filename) {
  const blockers = []
  const warnings = []
  let rejected = false

  if (!FILENAME_RE.test(filename)) {
    blockers.push('ファイル名が YYYY-MM-DD-slug.md 形式ではありません')
    return { blockers, warnings, rejected }
  }

  const filePath = join(POSTS_DIR, filename)
  let data, content
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = matter(raw)
    data    = parsed.data
    content = parsed.content
  } catch (e) {
    blockers.push(`frontmatter のパースに失敗しました: ${e.message}`)
    return { blockers, warnings, rejected, content: '' }
  }

  rejected = !!data.rejection_reason
  if (rejected) {
    return { blockers, warnings, rejected, content: content ?? '' }
  }

  // ── 承認状態 ──
  const humanApproved = data.reviewed === true

  // reviewed:true なのに承認メタデータがない場合は blocker
  if (humanApproved) {
    if (!data.reviewed_at || String(data.reviewed_at).trim() === '') {
      blockers.push('reviewed_at がありません（approved:post 経由で承認してください）')
    }
    if (!data.reviewed_by || String(data.reviewed_by).trim() === '') {
      blockers.push('reviewed_by がありません（--reviewed-by オプションで承認者名を指定してください）')
    }
  }

  if (!humanApproved) {
    blockers.push('本文未承認です（reviewed:true / reviewed_at / reviewed_by が必要）')
  }

  if (data.auto_approved === true && !humanApproved) {
    blockers.push('auto_approved:true は本文承認の代替にしません')
  }

  if (data.draft === true) {
    blockers.push('draft: true — ドラフト明示記事は公開対象外です')
  }

  const today = getTodayJst()

  // ── publish_at: 未来日付はまだ公開しない ──
  if (data.publish_at) {
    const publishAtStr = toDateStr(data.publish_at)
    if (publishAtStr && publishAtStr > today) {
      blockers.push(`publish_at: ${publishAtStr} — 公開予定日が未来です（scheduled: ${publishAtStr}）`)
    }
  }

  // ── date: publish_at がない場合は date も未来判定に使う ──
  if (!data.publish_at && data.date) {
    const dateStr = toDateStr(data.date)
    if (dateStr && dateStr > today) {
      blockers.push(`date: ${dateStr} — 記事日付が未来です（scheduled: ${dateStr}）`)
    }
  }

  // ── AI生成フラグ（warning: 未承認の AI 生成物だけ内容確認を促す） ──
  if (data.ai_generated === true && !humanApproved) {
    warnings.push('ai_generated: true — Human による本文確認・承認を行ってください')
  }

  // ── 必須フィールド ──
  if (!data.title || String(data.title).trim() === '') {
    blockers.push('title が空です')
  }

  const excerpt = String(data.excerpt ?? data.description ?? '').trim()
  if (!excerpt) {
    blockers.push('excerpt が空です（互換として description でも可）')
  }

  if (!data.author || String(data.author).trim() === '') {
    blockers.push('author が空です')
  }

  if (!data.category) {
    blockers.push('category がありません')
  } else if (!VALID_CATEGORIES.has(data.category)) {
    blockers.push(`category が無効です: "${data.category}"`)
  }

  if (!data.date) {
    blockers.push('date がありません')
  } else {
    const dateStr = toDateStr(data.date)
    if (!DATE_RE.test(dateStr)) {
      blockers.push(`date の形式が不正です: "${dateStr}" (YYYY-MM-DD が必要)`)
    }
  }

  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    warnings.push('tags が空配列または未定義です')
  }

  if (data.image && !String(data.image).startsWith('/')) {
    blockers.push(`image のパスが "/" で始まっていません: "${data.image}"`)
  }

  return { blockers, warnings, content: content ?? '' }
}

// ── エントリポイント ──

let files
try {
  files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort()
} catch {
  console.error('エラー: content/posts/ が見つかりません')
  process.exit(1)
}

if (files.length === 0) {
  console.log('⚠️  記事が存在しません: content/posts/')
  process.exit(0)
}

const results = files.map((file) => ({ file, ...checkPost(file) }))
const rejected  = results.filter((r) => r.rejected)
const active    = results.filter((r) => !r.rejected)
const ready     = active.filter((r) => r.blockers.length === 0)
const notReady  = active.filter((r) => r.blockers.length > 0)

// 医療広告チェック — publish-ready 記事の本文のみをスキャンし warning を追加する
for (const r of ready) {
  for (const { re, label } of MEDICAL_AD_PATTERNS) {
    if (re.test(r.content)) {
      r.warnings.push(`医療広告注意: ${label} が含まれています`)
    }
  }
}

const BAR = '━'.repeat(56)
console.log(BAR)
console.log(`publish-ready チェック  (全 ${files.length} 件)`)
console.log(BAR)

if (notReady.length > 0) {
  for (const { file, blockers, warnings } of notReady) {
    console.log(`\n❌ ${file}`)
    for (const b of blockers) console.log(`   ⛔ ${b}`)
    for (const w of warnings) console.log(`   ⚠️  ${w}`)
  }
}

if (ready.length > 0) {
  console.log()
  for (const { file, warnings } of ready) {
    console.log(`✅ ${file}`)
    for (const w of warnings) console.log(`   ⚠️  ${w}`)
  }
}

if (rejected.length > 0) {
  console.log()
  for (const { file } of rejected) {
    console.log(`↩️  ${file}（差し戻し済み / 公開対象外）`)
  }
}

console.log()
console.log(BAR)
console.log(`  publish-ready    : ${ready.length} 件`)
console.log(`  要 approval      : ${notReady.length} 件`)
console.log(`  差し戻し済み     : ${rejected.length} 件`)
console.log(BAR)

if (ready.length > 0) {
  console.log()
  console.log('次のステップ（publish-ready 記事を公開する場合）:')
  console.log('  1. 上記 ✅ 記事の本文・医療情報を最終確認する')
  console.log('  2. 問題なければ npm run build を実行してデプロイへ進む')
} else {
  console.log()
  console.log('publish-ready な記事はありません。')
  console.log('  → 管理画面で本文確認・承認: /admin/pending-review')
  console.log('  → CLIで本文確認後に承認: npm run approve:post -- <slug> --reviewed-by "氏名" --confirm-body-reviewed')
  console.log('  → npm run status:content  でコンテンツ全体の状態を確認できます')
}

console.log()
console.log('exit コードについて:')
console.log('  exit 0  = publish-ready のみ（blocker なし）')
console.log('  exit 1  = review待ち・未来日付など active な blocker あり（ビルドエラーではありません）')
console.log('  日常確認には status:content / status:publish-ready が便利です')

// active な blocker が1件でもある場合は exit 1（CI ゲートとして維持）。
// 差し戻し済み記事は公開対象外として集計から分離する。
process.exit(notReady.length > 0 ? 1 : 0)
