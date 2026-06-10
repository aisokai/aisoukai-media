import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('batch scheduled draft script is exposed and only generates approved missing monthly topics', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const source = readFileSync('scripts/generate-scheduled-drafts.mjs', 'utf8')

  assert.equal(pkg.scripts['article:batch-scheduled'], 'node scripts/generate-scheduled-drafts.mjs')
  assert.match(source, /--month 2026-06/)
  assert.match(source, /dry-run/)
  assert.match(source, /ANTHROPIC_API_KEY/)
  assert.match(source, /status.*approved/s)
  assert.match(source, /publish_date/)
  assert.match(source, /generate-draft\.mjs/)
  assert.match(source, /isGenerated/)
})

