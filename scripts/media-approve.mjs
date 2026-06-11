#!/usr/bin/env node
// Media Queue item の承認 / 差し戻し CLI。Human が明示実行する。
// 状態遷移のみ。外部送信はしない (外部実行は apply コマンド実装後・別Gate)。
//
// 使い方:
//   node scripts/media-approve.mjs <mj-id> --by "氏名"
//   node scripts/media-approve.mjs <mj-id> --reject --reason "理由" --by "氏名"

import { pathToFileURL } from 'node:url'
import { approveMediaJob, rejectMediaJob } from './lib/telegram-media-commands.mjs'

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

function main() {
  const id = process.argv[2]
  const by = getArg('by')
  const isReject = process.argv.includes('--reject')
  if (!id || !id.startsWith('mj-') || !by) {
    console.error('使い方: node scripts/media-approve.mjs <mj-id> --by "氏名" [--reject --reason "理由"]')
    process.exit(1)
  }
  try {
    const job = isReject
      ? rejectMediaJob({ id, reason: getArg('reason') ?? '', by })
      : approveMediaJob({ id, by })
    console.log(`✅ ${id} を ${job.status} にしました (by ${by})`)
    if (!isReject) console.log('   状態遷移のみです。外部実行は行われません。')
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
