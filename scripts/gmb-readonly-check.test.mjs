import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { checkGmbReadiness } from './gmb-readonly-check.mjs'

test('readiness check returns counts only and never reads reviews', async () => {
  const result = await checkGmbReadiness({
    listAccountsImpl: async () => [{ name: 'accounts/a' }],
    listLocationsImpl: async () => [{ name: 'locations/l' }],
  })
  assert.deepEqual(result, {
    ok: true,
    mode: 'read_only',
    accountCount: 1,
    locationCount: 1,
    reviewsRead: false,
    externalMutation: false,
  })
})

test('readiness check source contains no post, reply, or review operation', () => {
  const source = readFileSync(new URL('./gmb-readonly-check.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /localPosts|updateReply|deleteReply|listReviews|writeFile|POST|PATCH|DELETE/)
})
