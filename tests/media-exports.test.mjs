import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDailyMarkdown } from '../scripts/export-obsidian.mjs'
import { buildStatusExport } from '../scripts/export-status-json.mjs'
import { shouldRotate } from '../scripts/rotate-media-logs.mjs'

test('日次Markdownは承認・実行イベントを人間可読に整形する', () => {
  const md = buildDailyMarkdown({
    date: '2026-06-11',
    events: [
      { ts: '2026-06-11T08:00:00+09:00', event: 'job_saved', job_id: 'mj-1' },
      { ts: '2026-06-11T09:30:00+09:00', event: 'job_approved', job_id: 'mj-1', by: 'human:先生' },
      { ts: '2026-06-11T09:31:00+09:00', event: 'apply_executed', job_id: 'mj-1', external_result: { reply_name: 'r/1' } },
    ],
    statusCounts: { queue_total: 5, review_pending: 1, human_required: 0, failed: 0 },
  })
  assert.match(md, /# Media Automation 日次記録 2026-06-11/)
  assert.match(md, /✅ 承認 mj-1 human:先生/)
  assert.match(md, /📤 外部実行/)
  assert.match(md, /queue更新ログ/)
})

test('status JSON エクスポートに秘密値・raw_text が含まれない', () => {
  const data = buildStatusExport()
  assert.ok(data.generated_at)
  assert.equal(typeof data.counts.queue_total, 'number')
  const serialized = JSON.stringify(data)
  assert.ok(!serialized.includes('raw_text'))
  assert.ok(!/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}/.test(serialized))
  for (const p of data.pending) {
    assert.ok(p.summary.length <= 80)
  }
})

test('shouldRotate はサイズ閾値で判定する', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rotate-test-'))
  const small = join(dir, 'small.log')
  writeFileSync(small, 'a'.repeat(100))
  assert.equal(shouldRotate(small, 1024), false)
  assert.equal(shouldRotate(small, 50), true)
  assert.equal(shouldRotate(join(dir, 'missing.log'), 50), false)
})
