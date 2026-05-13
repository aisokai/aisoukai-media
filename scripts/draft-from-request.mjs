#!/usr/bin/env node
// draft-from-request.mjs
// Telegram リクエストから frontmatter のみの下書きを生成する CLI。
// Human がトリガーする。AI が自動実行してはならない。
// 自動 approve / 自動 publish しない。生成物は reviewed: false。
// pending-review に出る状態にする（draft: false / reviewed: false）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname     = dirname(fileURLToPath(import.meta.url))
const ROOT          = join(__dirname, '..')
const POSTS_DIR     = join(ROOT, 'content', 'posts')
const REQUESTS_PATH = join(ROOT, 'data', 'article-requests.json')

const VALID_CATEGORIES = new Set([
  '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
  '親知らず', 'インプラント', 'その他', 'お知らせ',
])

function getJstTimestamp() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().replace('Z', '+09:00')
}

function getTodayJst() {
  const now = new Date(Date.now() + 9 * 3600 * 1000)
  return now.toISOString().slice(0, 10)
}

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

// 日本語を含むテキストからシンプルな slug を生成（ASCII のみ残す）
function makeSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\x20-\x7e]/g, '')  // 非ASCII を除去
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '')
}

function loadRequests() {
  if (!existsSync(REQUESTS_PATH)) return { last_update_id: 0, requests: [] }
  try {
    return JSON.parse(readFileSync(REQUESTS_PATH, 'utf8'))
  } catch {
    return { last_update_id: 0, requests: [] }
  }
}

function saveRequests(store) {
  writeFileSync(REQUESTS_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8')
}

function buildDraftContent(frontmatter, requestText) {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}:\n${v.map((i) => `  - ${i}`).join('\n')}`
      if (typeof v === 'boolean') return `${k}: ${v}`
      return `${k}: '${String(v).replace(/'/g, "''")}'`
    })
    .join('\n')

  const body = [
    '<!-- リクエスト内容:',
    `     ${requestText}`,
    '     本文は未入力です。以下のいずれかで内容を追加してください。',
    '     1. npm run generate:draft でAI下書きを生成する',
    '     2. 本文を手動で記入する',
    '-->',
    '',
    '## はじめに',
    '',
    '（本文を記入してください）',
  ].join('\n')

  return `---\n${fm}\n---\n\n${body}\n`
}

function main() {
  const args     = parseArgs(process.argv.slice(2))
  const updateId = parseInt(String(args.update_id ?? args._[0] ?? ''), 10)
  const category = String(args.category ?? '').trim()
  const date     = String(args.date ?? getTodayJst()).trim()
  const slugArg  = String(args.slug ?? '').trim()
  // --yes がない場合は dry-run（ファイル生成・JSON 更新をしない）
  const yes      = args.yes === true

  if (!updateId || Number.isNaN(updateId)) {
    console.error('使い方: npm run request:draft -- <update_id> --category "カテゴリ" --date YYYY-MM-DD --yes')
    console.error('   例:  npm run request:draft -- 145026171 --category "虫歯治療" --date 2026-06-01 --yes')
    console.error('   ※ --yes がない場合は dry-run（確認のみ）')
    process.exit(1)
  }

  if (!category) {
    console.error('エラー: --category は必須です')
    console.error(`  有効値: ${[...VALID_CATEGORIES].join(', ')}`)
    process.exit(1)
  }

  if (!VALID_CATEGORIES.has(category)) {
    console.error(`エラー: --category が無効です: "${category}"`)
    console.error(`  有効値: ${[...VALID_CATEGORIES].join(', ')}`)
    process.exit(1)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`エラー: --date の形式が不正です: "${date}"（YYYY-MM-DD が必要）`)
    process.exit(1)
  }

  const store   = loadRequests()
  const request = store.requests.find((r) => r.update_id === updateId)

  if (!request) {
    console.error(`エラー: update_id ${updateId} のリクエストが見つかりません`)
    console.error('  npm run request:list で一覧を確認してください')
    process.exit(1)
  }

  if (request.status !== 'requested') {
    console.error(`エラー: このリクエストは "${request.status}" 状態です（requested のみ下書き生成できます）`)
    process.exit(1)
  }

  const titleArg    = String(args.title ?? '').trim() || request.text
  const title       = titleArg.slice(0, 60).trim()
  const slugBase    = slugArg || makeSlug(titleArg) || `req-${updateId}`
  const slug        = `${date}-${slugBase || `req-${updateId}`}`
  const filename    = `${slug}.md`
  const filePath    = join(POSTS_DIR, filename)

  if (existsSync(filePath)) {
    console.error(`エラー: ファイルが既に存在します: content/posts/${filename}`)
    console.error('  --slug で別の名前を指定してください')
    process.exit(1)
  }

  // ── dry-run 確認表示 ────────────────────────────────────────
  const BAR = '━'.repeat(56)
  console.log(BAR)
  if (yes) {
    console.log('下書き生成 — 確認')
  } else {
    console.log('[DRY-RUN] 以下の内容で下書きを生成します（--yes で実行）')
  }
  console.log(BAR)
  console.log(`  update_id   : ${updateId}`)
  console.log(`  from        : @${request.from}`)
  console.log(`  受信日時    : ${request.received_at?.slice(0, 16).replace('T', ' ')} JST`)
  console.log(`  リクエスト  : "${request.text.slice(0, 60)}${request.text.length > 60 ? '…' : ''}"`)
  console.log(`  category    : ${category}`)
  console.log(`  date        : ${date}`)
  console.log(`  ファイル    : content/posts/${filename}`)
  console.log(`  reviewed    : false（公開対象外 — Human approval が必須）`)
  console.log(BAR)

  if (!yes) {
    console.log()
    console.log('実行するには --yes をつけてください:')
    const slugOpt = slugArg ? ` --slug ${slugArg}` : ''
    const titleOpt = args.title ? ` --title "${title}"` : ''
    console.log(`  npm run request:draft -- ${updateId} --category "${category}" --date ${date}${slugOpt}${titleOpt} --yes`)
    console.log()
    console.log('見送る場合:')
    console.log(`  npm run request:ignore -- ${updateId} --reason "理由"`)
    return
  }

  const frontmatter = {
    title,
    date,
    // リクエスト本文を仮 excerpt として設定（本文記入時に差し替えること）
    excerpt:             request.text.slice(0, 80),
    category,
    tags:                [category],
    author:              '藍想会メディア編集部',
    reviewed:            false,
    draft:               false,
    image:               '',
    source_request_id:   updateId,
    source_request_text: request.text.slice(0, 80),
  }

  writeFileSync(filePath, buildDraftContent(frontmatter, request.text), 'utf8')

  // リクエスト status を drafted に更新（append-only history）
  const now = getJstTimestamp()
  request.status            = 'drafted'
  request.status_updated_at = now
  request.draft_slug        = slug
  request.history           = [
    ...(request.history ?? [{ action: 'received', at: request.received_at }]),
    { action: 'drafted', at: now, draft_slug: slug },
  ]
  saveRequests(store)

  console.log()
  console.log('✅ 下書き生成完了（pending-review に追加されました）')
  console.log()
  console.log('次のステップ:')
  console.log(`  1. content/posts/${filename} を開いて本文を確認・記入する`)
  console.log('     または npm run generate:draft でAI下書きを生成する')
  console.log('  2. http://localhost:3000/admin/pending-review で確認する')
  console.log(`  3. npm run approve:post -- ${slug} --reviewed-by "氏名" で承認する`)
  console.log()
  console.log('完了後のクリーンアップ:')
  console.log(`  npm run request:archive -- ${updateId}`)
}

main()
