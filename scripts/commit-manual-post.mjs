#!/usr/bin/env node
// commit-manual-post.mjs
// 手動投稿のローカル commit CLI。push はしない (push は先生のみ)。
//
// 使い方:
//   npm run post:commit -- --post 2026-06-13-notice-20260620.md [--dry-run]
//
// 安全設計:
//   - validate:posts が通らない場合は commit しない
//   - commit 対象は対象記事 + data/manual-post-requests + logs/review-history.md に限定
//     (パス限定 commit。他の作業中ファイルは巻き込まない)
//   - コミットメッセージは固定形式。任意文字列は受け付けない
//   - push は実装しない

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const POST_FILENAME_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    ...opts,
  }).trim()
}

function printResult(result) {
  console.log(`RESULT_JSON: ${JSON.stringify(result)}`)
}

function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const postIdx = argv.indexOf('--post')
  const post = postIdx >= 0 ? String(argv[postIdx + 1] ?? '') : ''

  if (!POST_FILENAME_RE.test(post)) {
    console.error('使い方: npm run post:commit -- --post <YYYY-MM-DD-slug.md> [--dry-run]')
    process.exit(1)
  }
  const postRelPath = `content/posts/${post}`
  if (!existsSync(join(ROOT, postRelPath))) {
    console.error(`エラー: 記事ファイルが見つかりません: ${postRelPath}`)
    process.exit(1)
  }

  // commit 前に必ず validate:posts を通す
  console.log('▶ validate:posts を実行します…')
  try {
    execFileSync(process.execPath, [join(__dirname, 'validate-posts.mjs')], {
      cwd: ROOT, stdio: 'inherit',
    })
  } catch {
    console.error('❌ validate:posts が失敗したため commit しません')
    printResult({ mode: 'commit', committed: false, error: 'validate_failed' })
    process.exit(1)
  }

  const paths = [postRelPath]
  if (existsSync(join(ROOT, 'data', 'manual-post-requests'))) paths.push('data/manual-post-requests')
  if (existsSync(join(ROOT, 'logs', 'review-history.md'))) paths.push('logs/review-history.md')

  const changes = git(['status', '--short', '--', ...paths])
  if (!changes) {
    console.log('変更がないため commit しません')
    printResult({ mode: 'commit', committed: false, error: 'no_changes' })
    return
  }
  console.log('対象の変更:')
  console.log(changes.split('\n').map((l) => `  ${l}`).join('\n'))

  const slug = post.replace(/\.md$/, '')
  const tracked = git(['ls-files', '--', postRelPath])
  const message = tracked
    ? `chore: update manual post ${slug}`
    : `feat: add manual post ${slug}`

  if (dryRun) {
    console.log(`(dry-run) commit 予定メッセージ: "${message}"`)
    printResult({ mode: 'commit', committed: false, dry_run: true, message, files: changes.split('\n') })
    return
  }

  git(['add', '--', ...paths])
  git(['commit', '-m', message, '--', ...paths])
  const hash = git(['rev-parse', '--short', 'HEAD'])

  console.log(`✅ commit しました: ${hash} "${message}"`)
  console.log('   push はしません (push は先生のみ)')
  printResult({ mode: 'commit', committed: true, hash, message, files: changes.split('\n') })
}

try {
  main()
} catch (err) {
  console.error(`❌ ${err.message}`)
  printResult({ mode: 'commit', committed: false, error: err.message })
  process.exit(1)
}
