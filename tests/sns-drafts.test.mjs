import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSnsDraftData } from '../scripts/lib/sns-drafts.mjs'

const validDraft = {
  channel: 'instagram',
  platform: 'instagram',
  title: '歯みがき習慣の見直し',
  date: '2026-06-15',
  status: 'pending_review',
  reviewed: false,
  approved_for_manual_post: false,
  ai_generated: true,
  medical_risk: 'low',
  source_topic_id: 'SNS-202606-001',
  publish_mode: 'manual_only',
}

test('SNS draft schema accepts manual-only pending review drafts', () => {
  const result = validateSnsDraftData(
    '2026-06-15-instagram-sns-202606-001.md',
    validDraft,
    '## キャプション\n\n歯みがき習慣を見直しましょう。',
  )

  assert.deepEqual(result.errors, [])
})

test('SNS draft schema blocks automatic external publishing modes', () => {
  const result = validateSnsDraftData(
    '2026-06-15-instagram-sns-202606-001.md',
    { ...validDraft, publish_mode: 'api_post' },
    '## キャプション\n\n歯みがき習慣を見直しましょう。',
  )

  assert.match(result.errors.join('\n'), /manual_only/)
})

