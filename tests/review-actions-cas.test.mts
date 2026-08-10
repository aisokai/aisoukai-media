import assert from 'node:assert/strict'
import test from 'node:test'
import matter from 'gray-matter'
import { getContentVersion } from '../src/lib/dmpArticleState.mjs'
import { approvePostMarkdown, rejectPostMarkdown } from '../src/lib/reviewActions.ts'
import { getPostPublicationStatus } from '../scripts/lib/post-publication-status.mjs'

const raw = `---
title: CAS test
date: 2026-08-01
draft: false
reviewed: false
---
original body
`

test('approve/reject compare expected content version before mutating review state', () => {
  const parsed = matter(raw)
  const version = getContentVersion(parsed.data, parsed.content)
  assert.throws(() => approvePostMarkdown(raw, '2026-08-01-cas-test', '先生', ''), /更新/)
  assert.throws(() => rejectPostMarkdown(raw, '2026-08-01-cas-test', '先生', '修正', 'f'.repeat(64)), /更新/)

  const approved = matter(approvePostMarkdown(raw, '2026-08-01-cas-test', '先生', version).nextPostMarkdown)
  assert.equal(approved.data.reviewed_content_hash, getContentVersion(approved.data, approved.content))
  assert.notEqual(approved.data.reviewed_content_hash, version)
  assert.equal(getPostPublicationStatus(approved.data, { today: '2026-08-02', content: approved.content }).publishable, true)
  assert.equal(getPostPublicationStatus(approved.data, { today: '2026-08-02', content: 'changed body' }).publishable, false)

  const rejected = matter(rejectPostMarkdown(raw, '2026-08-01-cas-test', '先生', '修正', version).nextPostMarkdown)
  assert.equal(rejected.data.reviewed, false)
  assert.equal(getPostPublicationStatus(rejected.data, { today: '2026-08-02', content: rejected.content }).publishable, false)
})
