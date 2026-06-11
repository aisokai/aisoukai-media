import test from 'node:test'
import assert from 'node:assert/strict'
import { selectAutoExecutable } from '../scripts/media-executor.mjs'
import { createJob, loadGateConfig, transitionJob } from '../scripts/lib/media-queue.mjs'

const realConfig = loadGateConfig()

function withFlags(flags) {
  return { ...realConfig, flags: { ...realConfig.flags, ...flags } }
}

function makeJob(type, { risk = 'low', status = 'review_pending' } = {}) {
  let job = createJob({
    type, source: 'watcher', sourceText: 'x', targetChannels: ['gmb'], riskLevel: risk, config: realConfig,
  })
  if (status !== 'draft_requested') {
    job = transitionJob(job, 'draft_generated')
    if (status !== 'draft_generated') job = transitionJob(job, status)
  }
  return job
}

test('全フラグOFFでは何も自動実行対象にならない', () => {
  const jobs = [makeJob('gmb_emergency_notice'), makeJob('review_reply'), makeJob('gmb_update')]
  const selected = selectAutoExecutable(jobs, withFlags({}), { variantResolver: () => 'template_only' })
  assert.deepEqual(selected, [])
})

test('gmb_post_auto ON で定型GMB投稿のみ対象になる', () => {
  const jobs = [makeJob('gmb_emergency_notice'), makeJob('gmb_update'), makeJob('review_reply')]
  const selected = selectAutoExecutable(jobs, withFlags({ gmb_post_auto: true }), { variantResolver: () => 'normal' })
  assert.deepEqual(selected.map((j) => j.type), ['gmb_emergency_notice'])
})

test('gmb_reply_auto_template ON ではテンプレ返信variantのみ対象', () => {
  const config = withFlags({ gmb_reply_auto_template: true })
  const replyJob = makeJob('review_reply')
  const templateOnly = selectAutoExecutable([replyJob], config, { variantResolver: () => 'template_only' })
  assert.equal(templateOnly.length, 1)
  const normal = selectAutoExecutable([replyJob], config, { variantResolver: () => 'normal' })
  assert.equal(normal.length, 0, '通常返信は gmb_reply_auto が必要')
})

test('high risk job はフラグONでも対象外', () => {
  const job = makeJob('review_reply', { risk: 'high', status: 'human_required' })
  const selected = selectAutoExecutable([job], withFlags({ gmb_reply_auto: true, gmb_reply_auto_template: true }))
  assert.deepEqual(selected, [])
})

test('review_pending 以外のstatusは対象外', () => {
  const approved = makeJob('gmb_emergency_notice', { status: 'approved' })
  const selected = selectAutoExecutable([approved], withFlags({ gmb_post_auto: true }))
  assert.deepEqual(selected, [])
})
