import test from 'node:test'
import assert from 'node:assert/strict'
import { assessScheduledGitReadiness, parseGitDivergence } from '../scripts/lib/scheduled-git-readiness.mjs'

const base = {
  statusOk: true,
  dirtyCount: 0,
  fetchOk: true,
  divergenceOk: true,
  divergenceOutput: '0\t0',
  branch: 'main',
  head: 'abc1234',
}

test('scheduled Git readiness parses only non-negative integer divergence', () => {
  assert.deepEqual(parseGitDivergence('2 3'), { ahead: 2, behind: 3 })
  assert.equal(parseGitDivergence('2.5 0'), null)
  assert.equal(parseGitDivergence('-1 0'), null)
  assert.equal(parseGitDivergence('0 0 unexpected'), null)
  assert.equal(parseGitDivergence('unknown'), null)
})

test('scheduled Git readiness fails closed for dirty, fetch failure, and unreadable divergence', () => {
  assert.equal(assessScheduledGitReadiness({ ...base, dirtyCount: 1 }).ok, false)
  assert.equal(assessScheduledGitReadiness({ ...base, fetchOk: false }).ok, false)
  assert.equal(assessScheduledGitReadiness({ ...base, divergenceOutput: 'invalid' }).ok, false)
  assert.match(assessScheduledGitReadiness({ ...base, indexLockPresent: true }).reason, /index lock/)
})

test('scheduled Git readiness allows clean ahead-only commits while retaining Human push context', () => {
  const result = assessScheduledGitReadiness({ ...base, divergenceOutput: '1 0' })
  assert.equal(result.ok, true)
  assert.match(result.reason, /origin\/mainと整合/)
  assert.match(result.reason, /ahead 1/)
  assert.match(result.reason, /Human push待ち/)
  assert.deepEqual(result.details, {
    branch: 'main',
    head: 'abc1234',
    ahead: 1,
    behind: 0,
    aheadSummary: '先行commit: abc1234 を含む 1件',
  })
})

test('scheduled Git readiness keeps behind and diverged histories blocked', () => {
  assert.match(assessScheduledGitReadiness({ ...base, divergenceOutput: '0 1' }).reason, /behind 1/)
  assert.match(assessScheduledGitReadiness({ ...base, divergenceOutput: '2 3' }).reason, /分岐/)
})
