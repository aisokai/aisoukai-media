import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNotificationReviewContext,
  buildReviewSummary,
} from '../scripts/lib/content-status.mjs'

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
}

function writePost(root, file, title) {
  writeFileSync(join(root, 'content', 'posts', file), `---
title: ${title}
date: 2026-06-19
category: テスト
reviewed: false
publication_status: draft
legal_check_status: pending
image_check_status: pending
---

本文
`)
}

test('production notification counts origin/main pending posts and separates local-only drafts', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-content-status-'))
  mkdirSync(join(root, 'content', 'posts'), { recursive: true })
  git(root, ['init'])

  writePost(root, '2026-06-19-origin.md', 'origin pending')
  git(root, ['add', 'content/posts/2026-06-19-origin.md'])
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'seed'])
  git(root, ['branch', '-M', 'main'])
  git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])

  writePost(root, '2026-06-20-local.md', 'local only pending')

  const context = buildNotificationReviewContext(join(root, 'content', 'posts'), {
    root,
    dashboardUrl: 'https://aisoukai-media.vercel.app/admin/pending-review',
  })

  assert.equal(context.dashboardKind, 'production')
  assert.equal(context.originAvailable, true)
  assert.deepEqual(context.visibleStatus.pending.map((item) => item.slug), ['2026-06-19-origin'])
  assert.deepEqual(context.localOnly.map((item) => item.slug), ['2026-06-20-local'])

  const summary = buildReviewSummary(context.visibleStatus, {
    dashboardUrl: context.dashboardUrl,
    hiddenLocalItems: context.localOnly,
    dashboardKind: context.dashboardKind,
  })

  assert.match(summary, /review待ち 1件/)
  assert.match(summary, /ローカルのみ \/ needs-push 1件/)
  assert.match(summary, /本番レビュー画面には未反映。push後に表示されます。/)
})
