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


// ---- publish_mode: ai_mutual_review (指示書C 第1層) ----

const HASH = 'a'.repeat(64)
const mutualDraft = {
  ...validDraft,
  publish_mode: 'ai_mutual_review',
  created_by: 'claude:run-test-001',
  mutual_review: {
    state: 'pending',
    content_hash: null,
    evidence_id: null,
    reviewed_by: null,
    reviewed_at: null,
    exception_category: null,
  },
}
const FILE = '2026-06-15-instagram-sns-202606-001.md'
const BODY = '## キャプション\n\n歯みがき習慣を見直しましょう。'
const reviewedBlock = (state, extra = {}) => ({
  state,
  content_hash: HASH,
  evidence_id: '00000000-0000-4000-8000-000000000001',
  reviewed_by: 'chatgpt:run-test-002',
  reviewed_at: '2026-06-15T10:00:00.000+09:00',
  exception_category: null,
  ...extra,
})

test('C-2: 許可外の publish_mode はエラーで、メッセージに許可値2つを含む', () => {
  const result = validateSnsDraftData(FILE, { ...validDraft, publish_mode: 'api_post' }, BODY)
  const message = result.errors.join('\n')
  assert.match(message, /manual_only/)
  assert.match(message, /ai_mutual_review/)
})

test('C-3: ai_mutual_review + state: pending (証拠なし) は第1層を通る', () => {
  const result = validateSnsDraftData(FILE, mutualDraft, BODY)
  assert.deepEqual(result.errors, [])
})

test('C-3b: ai_mutual_review では created_by と mutual_review が必須', () => {
  const { created_by: _c, mutual_review: _m, ...rest } = mutualDraft
  const message = validateSnsDraftData(FILE, rest, BODY).errors.join('\n')
  assert.match(message, /created_by/)
  assert.match(message, /mutual_review ブロックがありません/)
  const badIdentity = validateSnsDraftData(FILE, { ...mutualDraft, created_by: 'claude' }, BODY)
  assert.match(badIdentity.errors.join('\n'), /created_by/)
})

test('C-9: manual_only に mutual_review / created_by が混在したらエラー', () => {
  const withReview = validateSnsDraftData(FILE, { ...validDraft, mutual_review: mutualDraft.mutual_review }, BODY)
  assert.match(withReview.errors.join('\n'), /manual_only のドラフトに mutual_review/)
  const withCreator = validateSnsDraftData(FILE, { ...validDraft, created_by: 'claude:run-x' }, BODY)
  assert.match(withCreator.errors.join('\n'), /manual_only のドラフトに created_by/)
})

test('C-10: ai_mutual_review で approved_for_manual_post: true はエラー', () => {
  const result = validateSnsDraftData(FILE, { ...mutualDraft, approved_for_manual_post: true }, BODY)
  assert.match(result.errors.join('\n'), /approved_for_manual_post/)
})

// レビュー済み state の互換用 top-level 写し
const reviewedTop = { reviewed: true, reviewed_by: 'chatgpt:run-test-002', reviewed_at: '2026-06-15T10:00:00.000+09:00' }

test('C-11: state: escalated で exception_category 欠落はエラー', () => {
  const result = validateSnsDraftData(FILE, { ...mutualDraft, ...reviewedTop, mutual_review: reviewedBlock('escalated') }, BODY)
  assert.match(result.errors.join('\n'), /exception_category が必須/)
  const ok = validateSnsDraftData(FILE, {
    ...mutualDraft,
    ...reviewedTop,
    mutual_review: reviewedBlock('escalated', { exception_category: 'complaint' }),
  }, BODY)
  assert.deepEqual(ok.errors, [])
})

test('C-12: state: escalated で status: approved / posted はエラー', () => {
  for (const status of ['approved', 'posted']) {
    const result = validateSnsDraftData(FILE, {
      ...mutualDraft,
      status,
      mutual_review: reviewedBlock('escalated', { exception_category: 'complaint' }),
    }, BODY)
    assert.match(result.errors.join('\n'), /status/, status)
  }
})

test('C 状態整合: status: approved は state: passed のときだけ許可される', () => {
  const pending = validateSnsDraftData(FILE, { ...mutualDraft, status: 'approved' }, BODY)
  assert.match(pending.errors.join('\n'), /state が passed ではありません/)
  const changes = validateSnsDraftData(FILE, { ...mutualDraft, status: 'approved', mutual_review: reviewedBlock('changes_requested') }, BODY)
  assert.ok(changes.errors.length > 0)
  const passed = validateSnsDraftData(FILE, { ...mutualDraft, ...reviewedTop, status: 'approved', mutual_review: reviewedBlock('passed') }, BODY)
  assert.deepEqual(passed.errors, [])
  assert.deepEqual(passed.warnings, [], 'approved_for_manual_post の警告は manual_only のみ')
})

test('C 状態整合: レビュー済み state では reviewed_by / reviewed_at / content_hash / evidence_id が必須', () => {
  for (const key of ['reviewed_by', 'reviewed_at', 'content_hash', 'evidence_id']) {
    const result = validateSnsDraftData(FILE, {
      ...mutualDraft,
      mutual_review: reviewedBlock('passed', { [key]: null }),
    }, BODY)
    assert.match(result.errors.join('\n'), new RegExp(`mutual_review\\.${key}`), key)
  }
})

test('C 互換用 top-level (reviewed / reviewed_by / reviewed_at) が mutual_review と一致しなければエラー', () => {
  const block = reviewedBlock('passed')
  const base = { ...mutualDraft, ...reviewedTop, status: 'approved', mutual_review: block }
  assert.match(validateSnsDraftData(FILE, { ...base, reviewed: false }, BODY).errors.join('\n'), /reviewed が true/)
  assert.match(validateSnsDraftData(FILE, { ...base, reviewed_by: undefined }, BODY).errors.join('\n'), /top-level の reviewed_by/)
  assert.match(validateSnsDraftData(FILE, { ...base, reviewed_by: 'chatgpt:other' }, BODY).errors.join('\n'), /top-level の reviewed_by/)
  assert.match(validateSnsDraftData(FILE, { ...base, reviewed_at: '2026-06-16T10:00:00.000+09:00' }, BODY).errors.join('\n'), /top-level の reviewed_at/)
})

test('C media_files は repo 相対パスのみ許可する', () => {
  for (const bad of ['/etc/passwd', '../outside.png', 'public//x.png', '.env.local', 'public/.hidden/x.png', './x.png',
    'content/posts/x.md', 'config/media-gate.json', 'public/robots.txt', 'public/images/', 'public/images/.hidden/x.png']) {
    const result = validateSnsDraftData(FILE, { ...mutualDraft, media_files: [bad] }, BODY)
    assert.match(result.errors.join('\n'), /media_files/, bad)
  }
  const ok = validateSnsDraftData(FILE, { ...mutualDraft, media_files: ['public/images/sns/a.png'] }, BODY)
  assert.deepEqual(ok.errors, [])
})

test('C-1 回帰: manual_only の approved で approved_for_manual_post が false なら従来どおり警告のみ', () => {
  const result = validateSnsDraftData(FILE, { ...validDraft, status: 'approved' }, BODY)
  assert.deepEqual(result.errors, [])
  assert.equal(result.warnings.length, 1)
})
