import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  approveMediaJob, handleMediaCommand, rejectMediaJob,
} from '../scripts/lib/telegram-media-commands.mjs'
import { createJob, loadGateConfig, saveJob, transitionJob } from '../scripts/lib/media-queue.mjs'

const config = loadGateConfig()

function makePendingJob(dir, logPath) {
  let job = createJob({
    type: 'gmb_update', source: 'telegram', sourceText: 'テスト投稿', targetChannels: ['gmb'], config,
  })
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'review_pending')
  saveJob(job, { dir, logPath })
  return job
}

test('approveMediaJob は review_pending → approved に遷移し承認者を記録する', () => {
  const dir = mkdtempSync(join(tmpdir(), 'media-approve-test-'))
  const logPath = join(dir, 'log.jsonl')
  const job = makePendingJob(dir, logPath)
  const approved = approveMediaJob({ id: job.id, by: '先生', dir, logPath })
  assert.equal(approved.status, 'approved')
  assert.equal(approved.approved_by, 'human:先生')
  assert.ok(approved.approved_at)
})

test('rejectMediaJob は review_pending → rejected に遷移する', () => {
  const dir = mkdtempSync(join(tmpdir(), 'media-reject-test-'))
  const logPath = join(dir, 'log.jsonl')
  const job = makePendingJob(dir, logPath)
  const rejected = rejectMediaJob({ id: job.id, reason: '文面修正', by: '先生', dir, logPath })
  assert.equal(rejected.status, 'rejected')
})

test('承認可能でないstatusのjobは承認できない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'media-approve-test-'))
  const logPath = join(dir, 'log.jsonl')
  let job = createJob({
    type: 'gmb_update', source: 'telegram', sourceText: 'x', targetChannels: ['gmb'], config,
  })
  saveJob(job, { dir, logPath })  // draft_requested のまま
  assert.throws(() => approveMediaJob({ id: job.id, by: '先生', dir, logPath }), /承認可能ではありません/)
})

test('/approve は未authorized なら権限エラー', async () => {
  const result = await handleMediaCommand('/approve mj-20260611-000000-test', {
    authorized: false, fromUser: 'attacker', dryRun: true,
  })
  assert.equal(result.ok, false)
  assert.match(result.reply, /権限エラー/)
})

test('/approve は telegram_media_approve フラグOFFなら未解禁エラー (二重ゲート)', async () => {
  const result = await handleMediaCommand('/approve mj-20260611-000000-test', {
    authorized: true, fromUser: '先生', dryRun: true,
    config: { flags: { telegram_media_approve: false } },
  })
  assert.equal(result.ok, false)
  assert.match(result.reply, /未解禁/)
})

test('/approve はフラグON + authorized + dry-run で遷移せず受理される', async () => {
  const result = await handleMediaCommand('/approve mj-20260611-000000-test', {
    authorized: true, fromUser: '先生', dryRun: true,
    config: { flags: { telegram_media_approve: true } },
  })
  assert.equal(result.ok, true)
  assert.match(result.summary, /dry-run/)
})

test('実configの telegram_media_approve は初期OFF', () => {
  assert.equal(config.flags.telegram_media_approve, false)
})

test('/status と /review は照会のみで応答を返す', async () => {
  const status = await handleMediaCommand('/status', { authorized: false, dryRun: true })
  assert.equal(status.ok, true)
  assert.match(status.reply, /Media Queue 状態/)

  const review = await handleMediaCommand('/review', { authorized: false, dryRun: true })
  assert.equal(review.ok, true)
})

test('実行系コマンドは handler でも blocked', async () => {
  for (const cmd of ['post', 'publish', 'deploy', 'apply', 'send', 'push']) {
    const result = await handleMediaCommand(`/${cmd} now`, { authorized: true, dryRun: true })
    assert.equal(result.ok, false, `/${cmd} はblockedであるべき`)
    assert.match(result.reply, /blocked/)
  }
})
