#!/usr/bin/env node
import { SNS_DRAFTS_DIR, listSnsDraftFiles, readSnsDraftFile } from './lib/sns-drafts.mjs'

function pad(str, len) {
  const s = String(str ?? '')
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length)
}

const files = listSnsDraftFiles(SNS_DRAFTS_DIR)
const pending = []
const rejected = []

for (const filePath of files) {
  const { file, data } = readSnsDraftFile(filePath)
  const entry = {
    file,
    platform: data.platform ?? '',
    status: data.status ?? '',
    date: data.date ?? '',
    title: String(data.title ?? '(タイトル未設定)').slice(0, 36),
    rejection: data.rejection_reason ? String(data.rejection_reason) : '',
  }

  if (entry.status === 'rejected' || entry.rejection) {
    rejected.push(entry)
  } else if (data.reviewed !== true || data.approved_for_manual_post !== true) {
    pending.push(entry)
  }
}

const BAR = '━'.repeat(100)

console.log(BAR)
console.log(`SNS review 待ちドラフト一覧  (${pending.length} 件)`)
console.log(BAR)

if (pending.length === 0) {
  console.log('✅ SNS review 待ちドラフトはありません。')
} else {
  console.log(`${pad('ファイル', 48)}  ${pad('媒体', 10)}  ${pad('状態', 14)}  ${pad('投稿日', 10)}  タイトル`)
  console.log('─'.repeat(100))
  for (const draft of pending) {
    console.log(
      `${pad(draft.file, 48)}  ${pad(draft.platform, 10)}  ${pad(draft.status, 14)}  ${pad(draft.date, 10)}  ${draft.title}`,
    )
  }
  console.log(BAR)
  console.log()
  console.log('承認: npm run sns:approve -- <slug> --reviewed-by "氏名"')
  console.log('却下: npm run sns:reject  -- <slug> --reason "理由"')
}

if (rejected.length > 0) {
  console.log()
  console.log('─'.repeat(100))
  console.log(`SNS差し戻し済み  (${rejected.length} 件)`)
  console.log('─'.repeat(100))
  for (const draft of rejected) {
    console.log(`  ${pad(draft.file, 52)}  理由: ${draft.rejection.slice(0, 40)}`)
  }
  console.log('─'.repeat(100))
}

