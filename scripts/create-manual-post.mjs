#!/usr/bin/env node
// create-manual-post.mjs
// 手動投稿 (お知らせ / ブログ) の下書き作成 CLI。
//
// 使い方:
//   npm run post:create -- --type notice --instruction "6月20日午後は休診" [--title "..."] [--publish-at YYYY-MM-DD]
//   npm run post:create -- --request <req-id>           # 保存済みリクエストから生成
//   npm run post:create -- --input <request.json>       # 入力 JSON ファイルから生成
//   npm run post:create:dryrun -- --type blog --instruction "..."
//   npm run post:create -- --approve <YYYY-MM-DD-slug.md> --by "承認者名"   # Human 承認のみ
//
// 安全設計:
//   - 生成する下書きは必ず draft / pending / pending (公開ステータスにしない)
//   - --approve は Human の明示操作のみ (MitaniOS UI の Human 承認チェック経由を含む)。承認者名必須
//   - 公開・push はしない。commit も別コマンド (post:commit)
//
// MitaniOS 連携用に、結果を最終行 "RESULT_JSON: {...}" として出力する。

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  POST_TYPES, POST_TYPE_LABELS,
  approveManualPost, buildManualPostDraft, loadManualPostRequest,
  updateManualPostRequest, writeManualPostDraft,
} from './lib/manual-post.mjs'
import { getTodayJst } from './lib/media-queue.mjs'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2).replace(/-/g, '_')
    const next = argv[i + 1]
    args[key] = next && !next.startsWith('--') ? argv[++i] : true
  }
  return args
}

function printResult(result) {
  console.log(`RESULT_JSON: ${JSON.stringify(result)}`)
}

function usage() {
  console.error('使い方:')
  console.error('  npm run post:create -- --type notice|blog --instruction "要点" [--title "..."] [--publish-at YYYY-MM-DD] [--dry-run]')
  console.error('  npm run post:create -- --request <req-id> [--dry-run]')
  console.error('  npm run post:create -- --input <request.json> [--dry-run]')
  console.error('  npm run post:create -- --approve <YYYY-MM-DD-slug.md> --by "承認者名"')
  process.exit(1)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const dryRun = args.dry_run === true

  // ── Human 承認モード ──
  if (args.approve) {
    const file = String(args.approve)
    const by = typeof args.by === 'string' ? args.by : ''
    const { filename, data } = approveManualPost({ file, by })
    console.log('━'.repeat(52))
    console.log('Human 承認を記録しました')
    console.log(`  ファイル           : content/posts/${filename}`)
    console.log(`  publication_status : ${data.publication_status}`)
    console.log(`  legal/image        : ${data.legal_check_status} / ${data.image_check_status}`)
    console.log(`  reviewed_by        : ${data.reviewed_by} (${data.reviewed_at})`)
    console.log('  ※ push はしません (push は先生のみ)')
    printResult({
      mode: 'approve', file: filename, title: data.title,
      publication_status: data.publication_status, reviewed_by: data.reviewed_by,
    })
    return
  }

  // ── 下書き生成の入力を組み立てる ──
  let input
  let requestId = ''
  if (args.request) {
    const request = loadManualPostRequest(String(args.request))
    if (request.status === 'drafted' && request.draft_file) {
      console.error(`エラー: このリクエストは下書き生成済みです: ${request.draft_file}`)
      printResult({ mode: 'error', error: 'already_drafted', file: request.draft_file })
      process.exit(1)
    }
    requestId = request.id
    input = {
      postType: request.post_type,
      instruction: request.raw_instruction,
      titleHint: request.title_hint ?? '',
      publishAt: request.publish_at ?? '',
    }
  } else if (args.input) {
    const raw = JSON.parse(readFileSync(String(args.input), 'utf8'))
    requestId = String(raw.id ?? '')
    input = {
      postType: String(raw.post_type ?? raw.type ?? ''),
      instruction: String(raw.raw_instruction ?? raw.instruction ?? ''),
      titleHint: String(raw.title_hint ?? raw.title ?? ''),
      publishAt: String(raw.publish_at ?? ''),
    }
  } else if (args.type || args.instruction) {
    input = {
      postType: String(args.type ?? ''),
      instruction: typeof args.instruction === 'string' ? args.instruction : '',
      titleHint: typeof args.title === 'string' ? args.title : '',
      publishAt: typeof args.publish_at === 'string' ? args.publish_at : '',
    }
  } else {
    usage()
    return
  }

  if (!POST_TYPES.includes(input.postType)) {
    console.error(`エラー: --type は ${POST_TYPES.join(' / ')} のいずれかを指定してください`)
    process.exit(1)
  }

  const draft = buildManualPostDraft({
    ...input,
    date: typeof args.date === 'string' ? args.date : getTodayJst(),
    requestId,
  })

  console.log('━'.repeat(52))
  console.log(`手動投稿下書き (${POST_TYPE_LABELS[input.postType]}) ${dryRun ? '— dry-run・保存なし' : ''}`)
  console.log('━'.repeat(52))
  console.log(`  タイトル  : ${draft.frontmatter.title}`)
  console.log(`  ファイル  : content/posts/${draft.filename}`)
  console.log(`  公開予定  : ${draft.frontmatter.publish_at} / カテゴリ: ${draft.frontmatter.category}`)
  console.log(`  画像      : ${draft.frontmatter.image}`)
  console.log(`  image_alt : ${draft.frontmatter.image_alt}`)
  console.log(`  ステータス: ${draft.frontmatter.publication_status} / legal: ${draft.frontmatter.legal_check_status} / image: ${draft.frontmatter.image_check_status}`)
  for (const w of draft.warnings) console.warn(`  ⚠ ${w}`)

  if (dryRun) {
    console.log()
    console.log('--- 生成内容プレビュー ---')
    console.log(draft.markdown)
    printResult({
      mode: 'dry-run', post_type: input.postType, file: draft.filename,
      title: draft.frontmatter.title, image: draft.frontmatter.image,
      image_alt: draft.frontmatter.image_alt, warnings: draft.warnings, request_id: requestId,
    })
    return
  }

  writeManualPostDraft(draft)
  if (requestId && args.request) {
    updateManualPostRequest(requestId, { status: 'drafted', draft_file: draft.filename })
  }
  console.log()
  console.log(`✅ 下書きを保存しました: content/posts/${draft.filename}`)
  console.log('   公開には Human 承認 (post:create -- --approve) と先生の push が必要です。')
  printResult({
    mode: 'create', post_type: input.postType, file: draft.filename,
    title: draft.frontmatter.title, image: draft.frontmatter.image,
    image_alt: draft.frontmatter.image_alt, warnings: draft.warnings, request_id: requestId,
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (err) {
    console.error(`❌ ${err.message}`)
    printResult({ mode: 'error', error: err.message })
    process.exit(1)
  }
}
