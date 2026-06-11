#!/usr/bin/env node
// Media Automation ログローテーション (Phase 7)。
// 5MB超のログを logs/archive/ へ移動する (rename = 削除ではない)。外部通信なし。
//
// 使い方: node scripts/rotate-media-logs.mjs [--dry-run] [--max-mb 5]

import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, getJstTimestamp } from './lib/media-queue.mjs'

const LOGS_DIR = join(ROOT, 'logs')
const ARCHIVE_DIR = join(LOGS_DIR, 'archive')

const ROTATE_TARGETS = [
  'media-automation.jsonl',
  'media-watcher.log',
  'media-watcher-error.log',
  'media-executor.log',
  'media-executor-error.log',
  'media-export.log',
  'media-export-error.log',
  'media-health.log',
  'media-health-error.log',
  'gmb-review-watcher.log',
]

export function shouldRotate(path, maxBytes) {
  return existsSync(path) && statSync(path).size > maxBytes
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const maxIdx = process.argv.indexOf('--max-mb')
  const maxMb = maxIdx >= 0 ? Number(process.argv[maxIdx + 1]) : 5
  const maxBytes = maxMb * 1024 * 1024
  const stamp = getJstTimestamp().slice(0, 10)

  let rotated = 0
  for (const file of ROTATE_TARGETS) {
    const path = join(LOGS_DIR, file)
    if (!shouldRotate(path, maxBytes)) continue
    const dest = join(ARCHIVE_DIR, `${stamp}-${basename(file)}`)
    if (dryRun) {
      console.log(`[dry-run] rotate: ${file} → archive/${basename(dest)}`)
    } else {
      mkdirSync(ARCHIVE_DIR, { recursive: true })
      renameSync(path, dest)
      console.log(`✅ rotate: ${file} → archive/${basename(dest)}`)
    }
    rotated++
  }
  if (rotated === 0) console.log(`✅ ローテーション対象なし (${maxMb}MB 未満)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
