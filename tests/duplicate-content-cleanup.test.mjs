import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import matter from 'gray-matter'

const POSTS = 'content/posts'

function frontmatter(slug) {
  return matter(readFileSync(`${POSTS}/${slug}.md`, 'utf8')).data
}

function isPublic(data) {
  return data.reviewed === true && data.draft !== true && !data.rejection_reason
}

test('duplicate cleanup removes selected duplicate posts from public publishing', () => {
  const keepPublic = [
    '2026-05-12-dental-checkup-guide',
    '2026-05-26-topic-20260512-031',
    '2026-05-13-cadcam',
  ]
  const removeFromPublic = [
    '2026-05-14-req-145026181',
    '2026-05-28-topic-20260512-032',
    '2026-05-14-req-145026175',
    '2026-05-14-req-145026183',
    '2026-05-15-req-145026184',
    '2026-05-15-req-145026186',
    '2026-05-15-req-145026187',
  ]

  for (const slug of keepPublic) {
    assert.equal(isPublic(frontmatter(slug)), true, `${slug} should remain public`)
  }

  for (const slug of removeFromPublic) {
    const data = frontmatter(slug)
    assert.equal(data.reviewed, false, `${slug} reviewed should be false`)
    assert.match(String(data.rejection_reason ?? ''), /重複整理/, `${slug} should have cleanup rejection reason`)
  }
})

test('duplicate cleanup archives source requests for removed request-based posts', () => {
  const store = JSON.parse(readFileSync('data/article-requests.json', 'utf8'))
  const archivedIds = [145026175, 145026183, 145026184, 145026186, 145026187]

  for (const updateId of archivedIds) {
    const request = store.requests.find((item) => item.update_id === updateId)
    assert.ok(request, `request ${updateId} should exist`)
    assert.equal(request.status, 'archived', `request ${updateId} should be archived`)
    assert.ok(
      request.history?.some((entry) => entry.action === 'archived'),
      `request ${updateId} should include archived history`,
    )
  }

  assert.equal(
    store.requests.some((item) => item.update_id === 145026181),
    false,
    'request 145026181 is missing from the request ledger and cannot be archived',
  )
})
