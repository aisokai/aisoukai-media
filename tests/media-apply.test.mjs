import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GMB_APPLYABLE_TYPES, applyJob, buildApplyPayload } from '../scripts/lib/media-apply.mjs'
import { ROOT, createJob, loadGateConfig, saveJob, transitionJob } from '../scripts/lib/media-queue.mjs'

const config = loadGateConfig()
const FIXTURE_DIR = join(ROOT, 'tmp', 'test-fixtures', 'gmb-reviews', 'replies')
const FIXTURE_REL = 'tmp/test-fixtures/gmb-reviews/replies/test-review-1.json'

function setupReplyFixture() {
  mkdirSync(FIXTURE_DIR, { recursive: true })
  writeFileSync(join(ROOT, FIXTURE_REL), JSON.stringify({
    review_id: 'test-review-1',
    template_id: 'thanks_no_text',
    draft_text: 'ご来院ありがとうございます。',
    risk_level: 'low',
    gate_policy: 'auto_when_enabled',
    job_id: 'mj-x',
    external_result: null,
    replied_at: null,
    created_at: '2026-06-11T08:00:00+09:00',
  }, null, 2))
}

function makeApprovedReplyJob(dir, logPath) {
  setupReplyFixture()
  let job = createJob({
    type: 'review_reply', source: 'watcher', sourceText: 'review test-review-1',
    targetChannels: ['gmb'], riskLevel: 'low', config,
  })
  job = { ...job, output_paths: [FIXTURE_REL] }
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'review_pending')
  job = transitionJob(job, 'approved', { approved_by: 'human:先生', approved_at: job.updated_at })
  saveJob(job, { dir, logPath })
  return job
}

test('buildApplyPayload は返信案から送信payloadを組み立てる', () => {
  setupReplyFixture()
  const job = { id: 'mj-t', type: 'review_reply', output_paths: [FIXTURE_REL] }
  const payload = buildApplyPayload(job)
  assert.equal(payload.kind, 'reply')
  assert.equal(payload.reviewId, 'test-review-1')
  assert.match(payload.comment, /ご来院/)
})

test('applyJob は approved 以外を拒否する', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apply-test-'))
  const logPath = join(dir, 'log.jsonl')
  setupReplyFixture()
  let job = createJob({
    type: 'review_reply', source: 'watcher', sourceText: 'x', targetChannels: ['gmb'], config,
  })
  job = { ...job, output_paths: [FIXTURE_REL] }
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'review_pending')
  saveJob(job, { dir, logPath })
  await assert.rejects(
    () => applyJob({ id: job.id, apply: true, dir, logPath, config, client: {} }),
    /approved ではありません/,
  )
})

test('applyJob はデフォルト dry-run で送信しない', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apply-test-'))
  const logPath = join(dir, 'log.jsonl')
  const job = makeApprovedReplyJob(dir, logPath)
  let called = false
  const client = { replyReview: async () => { called = true; return {} } }
  const result = await applyJob({ id: job.id, dir, logPath, config, client })
  assert.equal(result.dryRun, true)
  assert.equal(called, false, 'dry-runでは送信clientが呼ばれない')
})

test('applyJob --apply は送信し executed + external_result を記録する', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apply-test-'))
  const logPath = join(dir, 'log.jsonl')
  const job = makeApprovedReplyJob(dir, logPath)
  const client = { replyReview: async ({ reviewId }) => ({ reply_name: `reviews/${reviewId}/reply` }) }
  const result = await applyJob({ id: job.id, apply: true, dir, logPath, config, client })
  assert.equal(result.dryRun, false)
  assert.equal(result.job.status, 'executed')
  assert.equal(result.job.external_result.reply_name, 'reviews/test-review-1/reply')
  const saved = JSON.parse(readFileSync(join(dir, `${job.id}.json`), 'utf8'))
  assert.equal(saved.status, 'executed')
})

test('applyJob は送信失敗時に該当jobのみ failed にする', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apply-test-'))
  const logPath = join(dir, 'log.jsonl')
  const job = makeApprovedReplyJob(dir, logPath)
  const client = { replyReview: async () => { throw new Error('API down') } }
  await assert.rejects(() => applyJob({ id: job.id, apply: true, dir, logPath, config, client }))
  const saved = JSON.parse(readFileSync(join(dir, `${job.id}.json`), 'utf8'))
  assert.equal(saved.status, 'failed')
  assert.equal(saved.retry_count, 1)
})

test('apply対象typeはGMB系の固定リストのみ', () => {
  assert.ok(GMB_APPLYABLE_TYPES.includes('review_reply'))
  assert.ok(GMB_APPLYABLE_TYPES.includes('gmb_update'))
  assert.ok(!GMB_APPLYABLE_TYPES.includes('blog_article'))
  assert.ok(!GMB_APPLYABLE_TYPES.includes('sns_repurpose'))
})

test.after(() => {
  rmSync(join(ROOT, 'tmp', 'test-fixtures'), { recursive: true, force: true })
})
