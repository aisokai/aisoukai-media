import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLineworksRequest } from '../scripts/lineworks-intake-dry-run.mjs'

test('LINE WORKS指示はmedia queue itemに変換される', () => {
  const { job, request } = buildLineworksRequest({ text: '明日の休診案内を作成して' })
  assert.equal(job.type, 'lineworks_instruction')
  assert.equal(job.source, 'lineworks')
  assert.equal(job.status, 'draft_requested')
  assert.equal(request.intake_mode, 'mock')
  assert.equal(request.job_id, job.id)
})

test('秘密値らしき文字列はredactされる', () => {
  const { job, request } = buildLineworksRequest({ text: '設定 token=abcdef123456 を使って' })
  assert.ok(!request.text.includes('abcdef123456'))
  assert.ok(!job.source_text.includes('abcdef123456'))
})
