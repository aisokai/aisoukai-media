import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const SOURCE = 'src/app/admin/pending-review/ReviewActionButtons.tsx'

test('review action buttons refresh the pending list after a successful action', () => {
  const source = readFileSync(SOURCE, 'utf8')

  assert.match(source, /useRouter/)
  assert.match(source, /const\s+router\s*=\s*useRouter\(\)/)
  assert.match(source, /if\s*\(\s*next\.ok\s*\)\s*router\.refresh\(\)/)
})
