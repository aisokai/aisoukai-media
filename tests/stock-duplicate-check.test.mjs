import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { findStockDuplicateCandidates, normalizeStockTitle } from '../scripts/lib/stock-duplicate-check.mjs'

test('stock duplicate preflight detects only deterministic topic, normalized-title, and keyword matches', () => {
  const postsDir = mkdtempSync(join(tmpdir(), 'aisoukai-stock-test-'))
  try {
    writeFileSync(join(postsDir, '2026-01-01-existing.md'), `---\ntitle: "歯科　定期検診！"\nsource_topic_id: TOPIC-1\ntarget_keyword: "歯科 定期検診"\n---\nsynthetic fixture\n`)

    const matches = findStockDuplicateCandidates({
      postsDir,
      topicId: 'TOPIC-1',
      title: '歯科定期検診',
      keyword: '歯科 定期検診',
    })

    assert.deepEqual(matches, [{ slug: '2026-01-01-existing', reasons: ['topic_id', 'normalized_title', 'keyword'] }])
    assert.equal(normalizeStockTitle('Ａ Ｂ！'), 'ab')
  } finally {
    rmSync(postsDir, { recursive: true, force: true })
  }
})
