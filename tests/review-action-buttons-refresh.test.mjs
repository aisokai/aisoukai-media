import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const SOURCE = 'src/app/admin/pending-review/ReviewActionButtons.tsx'

test('review action buttons refresh the pending list after a successful action', () => {
  const source = readFileSync(SOURCE, 'utf8')

  assert.match(source, /useRouter/)
  assert.match(source, /const\s+router\s*=\s*useRouter\(\)/)
  assert.match(source, /const\s+\[completed,\s*setCompleted\]\s*=\s*useState\(false\)/)
  assert.match(source, /setCompleted\(true\)/)
  assert.match(source, /router\.refresh\(\)/)
  assert.match(source, /disabled=\{isPending \|\| completed\}/)
  assert.match(source, /承認済み/)
})

test('approve action is idempotent for already reviewed posts', () => {
  const source = readFileSync('src/app/admin/pending-review/actions.ts', 'utf8')
  const reviewActions = readFileSync('src/lib/reviewActions.ts', 'utf8')

  assert.match(source, /isReviewedPost/)
  assert.match(source, /reviewed_at/)
  assert.match(source, /reviewed_by/)
  assert.match(source, /この記事は既に承認済みです/)
  assert.match(source, /return\s*\{\s*ok:\s*true/s)
  assert.match(reviewActions, /applyTeacherApproval/)
  assert.match(reviewActions, /expectedContentVersion/)
  assert.match(reviewActions, /stock_status = 'rejected'/)
})
