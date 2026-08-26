import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CANDIDATE_ONE_SLUG,
  getCandidateOneLocalPreview,
  isCandidateOneLocalPreviewAllowed,
  isLoopbackPreviewHost,
} from '../src/lib/candidateOneLocalPreview.ts'

test('candidate-one preview permits only localhost and loopback hosts', () => {
  for (const host of ['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:4567']) {
    assert.equal(isLoopbackPreviewHost(host), true)
  }

  for (const host of [null, '', 'example.com', 'localhost.evil.example', '127.0.0.1.evil.example', '[::1]']) {
    assert.equal(isLoopbackPreviewHost(host), false)
  }
})

test('candidate-one preview fails closed in production and for non-loopback hosts', () => {
  assert.equal(isCandidateOneLocalPreviewAllowed({ host: 'localhost:3000', nodeEnv: 'development' }), true)
  assert.equal(isCandidateOneLocalPreviewAllowed({ host: 'localhost:3000', nodeEnv: 'production' }), false)
  assert.equal(isCandidateOneLocalPreviewAllowed({ host: 'example.com', nodeEnv: 'development' }), false)
})

test('candidate-one preview route is fixed and keeps internal metadata out of the UI', () => {
  const page = readFileSync('src/app/local-preview/candidate-1/page.tsx', 'utf8')
  const preview = readFileSync('src/lib/candidateOneLocalPreview.ts', 'utf8')

  assert.equal(CANDIDATE_ONE_SLUG, '2026-08-23-oral-health-prevention')
  assert.match(page, /notFound\(\)/)
  assert.doesNotMatch(page, /__local-preview/)
  assert.doesNotMatch(page, /params|searchParams|console\./)
  assert.doesNotMatch(preview, /readdirSync|source_theme|row_version|snapshot_hash/)
  assert.match(preview, /remarkHtml, \{ sanitize: true \}/)
})

test('candidate-one preview exposes only editorial render fields', async () => {
  const post = await getCandidateOneLocalPreview()

  assert.deepEqual(Object.keys(post).sort(), [
    'category',
    'contentHtml',
    'date',
    'excerpt',
    'image',
    'imageAlt',
    'tags',
    'title',
  ].sort())
  assert.ok(post.title)
  assert.ok(post.contentHtml)
})
