#!/usr/bin/env node
// GMB外部送信CLI (Phase 3)。唯一の外部送信エントリポイント。
// 対象は status=approved (approved_by / approved_at 記録済み) の GMB系 queue item のみ。
// デフォルトは dry-run。Human が明示実行する。
//
// 破壊的操作 (削除) は直接実行できない。必ず以下の3段階を踏む (Human Gate固定):
//   1. 削除リクエスト作成: gmb-apply --request-delete-reply <review_id> --by 氏名
//                          gmb-apply --request-delete-post <post_name> --by 氏名
//      → type=delete_review_reply / delete_gmb_post の queue item (human_required) が作られる
//   2. 承認: npm run media:approve -- <mj-id> --by 氏名
//   3. 実行: gmb-apply <mj-id> --apply --by 氏名
//
// 使い方:
//   node scripts/gmb-apply.mjs <mj-id>                      # dry-run (payload表示のみ)
//   node scripts/gmb-apply.mjs <mj-id> --apply [--by 氏名]  # 送信実行 (削除jobは --by 必須)

import { pathToFileURL } from 'node:url'
import { applyJob, createDeleteRequest } from './lib/media-apply.mjs'
import { notifyTelegramIfConfigured } from './lib/telegram-notify.mjs'

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

async function main() {
  const apply = process.argv.includes('--apply')
  const by = getArg('by')

  // ── 旧 --delete-reply / --delete-post: 直接削除は廃止。リクエスト作成に誘導 ──
  for (const [legacyFlag, kind] of [['delete-reply', 'delete_review_reply'], ['delete-post', 'delete_gmb_post']]) {
    if (process.argv.includes(`--${legacyFlag}`)) {
      console.error(`⛔ --${legacyFlag} の直接実行は廃止されました (破壊的操作はHuman Gate必須)。`)
      console.error(`   手順: --request-${legacyFlag} <対象> --by 氏名 → media:approve → gmb-apply <mj-id> --apply --by 氏名`)
      console.error(`   (action type: ${kind})`)
      process.exit(1)
    }
  }

  // ── 削除リクエスト作成 (送信なし・queue item作成のみ) ──
  for (const [flag, kind, label] of [
    ['request-delete-reply', 'delete_review_reply', 'review_id'],
    ['request-delete-post', 'delete_gmb_post', 'post_name'],
  ]) {
    if (!process.argv.includes(`--${flag}`)) continue
    const target = getArg(flag)
    if (!target || !by) {
      console.error(`書式: --${flag} <${label}> --by 氏名`)
      process.exit(1)
    }
    const job = createDeleteRequest({ kind, target, by })
    console.log(`✅ 削除リクエストを作成しました (送信は行われていません)`)
    console.log(`   job: ${job.id} [${job.status}] type=${kind} gate=${job.gate_policy}`)
    console.log(`   次: npm run media:approve -- ${job.id} --by "氏名" → gmb-apply ${job.id} --apply --by 氏名`)
    return
  }

  const id = process.argv[2]
  if (!id || !id.startsWith('mj-')) {
    console.error('使い方: node scripts/gmb-apply.mjs <mj-id> [--apply] [--by 氏名]')
    console.error('        node scripts/gmb-apply.mjs --request-delete-reply <review_id> --by 氏名')
    process.exit(1)
  }

  const result = await applyJob({ id, apply, executedBy: by ?? null })
  if (result.dryRun) {
    console.log(`[dry-run] ${id} (${result.job.type}) 送信内容:`)
    if (result.payload.kind === 'reply') {
      console.log(`  返信先 review: ${result.payload.reviewId}`)
      console.log(`  返信文: ${result.payload.comment}`)
    } else if (result.payload.kind === 'post') {
      console.log(`  投稿文: ${result.payload.draftText.slice(0, 200)}`)
      if (result.payload.ctaUrl) console.log(`  リンク: ${result.payload.ctaUrl}`)
    } else {
      console.log(`  ⚠ 破壊的操作: ${result.payload.kind} → ${result.payload.reviewId ?? result.payload.postName}`)
      console.log(`  実行には --apply --by 氏名 の両方が必要です`)
    }
    console.log('実行するには --apply を付けてください (approved job のみ送信されます)')
    return
  }

  console.log(`✅ 実行しました: ${id} → executed`)
  console.log(`   external_result: ${JSON.stringify(result.externalResult)}`)
  const labels = { reply: 'GMB返信', post: 'GMB投稿', delete_reply: 'GMB返信削除', delete_post: 'GMB投稿削除' }
  await notifyTelegramIfConfigured(
    `✅ ${labels[result.payload.kind] ?? result.payload.kind} を実行しました\njob: ${id}\nID: ${JSON.stringify(result.externalResult)}`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  })
}
