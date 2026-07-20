import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  runGenerateDraft,
  runThemeBlogFlow,
} from '../scripts/theme-blog-flow.mjs'
import {
  auditBlogMarkdown,
} from '../scripts/lib/theme-blog-audit.mjs'
import {
  buildTelegramApprovalRequest,
  sendTelegramApprovalRequest,
} from '../scripts/lib/theme-blog-review-request.mjs'

const LINEAGE = {
  source_topic_id: 'THEME-20260714-001',
  source_theme_topic_id: 'THEME-20260714-001',
  source_theme_snapshot_id: 'SNAP-20260714-01',
  source_theme_snapshot_hash: 'abcdef1234567890',
  source_theme_row_version: '3',
}

const THEME_ROW = {
  theme_topic_id: LINEAGE.source_theme_topic_id,
  title_candidate: '歯科定期検診で確認したいこと',
  category: '予防歯科',
  target_keyword: '歯科定期検診',
  patient_intent: '定期検診で何を確認するか知りたい',
  medical_risk: 'low',
  publish_date: '2026-07-20',
  source_theme_snapshot_id: LINEAGE.source_theme_snapshot_id,
  source_theme_snapshot_hash: LINEAGE.source_theme_snapshot_hash,
  source_theme_row_version: LINEAGE.source_theme_row_version,
}

const THEME_API = {
  THEME_TOPIC_CSV_COLUMNS: Object.keys(THEME_ROW),
  parseThemeTopicCsv: () => [THEME_ROW],
  selectBlogThemeTopics: (rows, { existingSourceTopicIds }) => rows.filter(
    (row) => !existingSourceTopicIds.has(row.theme_topic_id),
  ),
  buildBlogTopicRow: (row, { publishDate }) => ({
    id: row.theme_topic_id,
    title_candidate: row.title_candidate,
    category: row.category,
    target_keyword: row.target_keyword,
    patient_intent: row.patient_intent,
    medical_risk: row.medical_risk,
    publish_date: publishDate,
    topic: row.title_candidate,
    source_theme_topic_id: row.theme_topic_id,
    source_theme_snapshot_id: row.source_theme_snapshot_id,
    source_theme_snapshot_hash: row.source_theme_snapshot_hash,
    source_theme_row_version: row.source_theme_row_version,
  }),
  findExistingThemeSourceTopicIds: () => new Set(),
}

function passMarkdown(overrides = {}) {
  const frontmatter = {
    title: '歯科定期検診で確認したいこと',
    date: '2026-07-20',
    publish_at: '2026-07-20',
    reviewed: false,
    draft: true,
    auto_approved: false,
    publication_status: 'draft',
    legal_check_status: 'pending',
    image_check_status: 'pending',
    image: '/images/dental-checkup.jpg',
    image_alt: '歯科定期検診のイメージ',
    ...LINEAGE,
    ...overrides,
  }
  return `---\n${Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n定期検診では、口腔内の状態やセルフケアについて確認します。気になる症状がある場合は、受診時に相談しましょう。\n`
}

function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'theme-blog-flow-test-'))
}

test('default dry-run selects one topic without generating, notifying, or writing a draft', async () => {
  const root = tempRoot()
  const topicsPath = join(root, 'canonical.csv')
  const postsDir = join(root, 'posts')
  writeFileSync(topicsPath, 'canonical fixture\n', 'utf8')
  mkdirSync(postsDir)
  let generateCalls = 0
  let notifyCalls = 0

  try {
    const result = await runThemeBlogFlow({
      topicsPath,
      postsDir,
      themeTopicCsv: THEME_API,
      generateDraft: async () => { generateCalls += 1 },
      sendReviewRequest: async () => { notifyCalls += 1 },
    })

    assert.equal(result.mode, 'dry-run')
    assert.equal(result.generated, false)
    assert.equal(result.notified, false)
    assert.equal(result.temporary_topic_csv.written, false)
    assert.equal(generateCalls, 0)
    assert.equal(notifyCalls, 0)
    assert.deepEqual(readdirSync(postsDir), [])
    assert.equal(existsSync(join(root, 'topics.csv')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('audit accepts the generated draft contract and preserves lineage', () => {
  const result = auditBlogMarkdown(passMarkdown(), { expectedLineage: LINEAGE })
  assert.equal(result.status, 'PASS')
  assert.equal(result.ok, true)
  assert.equal(result.frontmatter.source_topic_id, LINEAGE.source_theme_topic_id)
  assert.equal(result.frontmatter.source_theme_snapshot_hash, LINEAGE.source_theme_snapshot_hash)
})

test('audit rejects approval/publication drift and missing lineage', () => {
  const drift = auditBlogMarkdown(passMarkdown({ reviewed: true, publication_status: 'published' }))
  assert.equal(drift.status, 'FAIL')
  assert.match(drift.issues.join('\n'), /reviewed must be false/)
  assert.match(drift.issues.join('\n'), /publication_status must be draft/)

  const missing = auditBlogMarkdown(passMarkdown({ source_theme_snapshot_hash: '' }))
  assert.equal(missing.status, 'FAIL')
  assert.match(missing.issues.join('\n'), /missing lineage field: source_theme_snapshot_hash/)

  const secret = auditBlogMarkdown(passMarkdown({ image_alt: 'private patient record' }))
  assert.equal(secret.status, 'FAIL')
  assert.match(secret.issues.join('\n'), /secret\/private marker detected/)
})

test('Telegram request includes review facts and no direct action command', () => {
  const request = buildTelegramApprovalRequest({
    title: '歯科定期検診で確認したいこと',
    topicId: LINEAGE.source_theme_topic_id,
    snapshotHash: LINEAGE.source_theme_snapshot_hash,
    audit: { ok: true, status: 'PASS' },
    publishDate: '2026-07-20',
    reviewUrl: 'https://review.example.test/admin/pending-review/theme-1',
  })

  assert.equal(request.audit, 'PASS')
  assert.equal(request.snapshot_hash_short, 'abcdef123456')
  assert.match(request.text, /歯科定期検診で確認したいこと/)
  assert.match(request.text, /THEME-20260714-001/)
  assert.match(request.text, /abcdef123456/)
  assert.match(request.text, /監査: PASS/)
  assert.match(request.text, /2026-07-20/)
  assert.match(request.text, /https:\/\/review\.example\.test/)
  assert.doesNotMatch(request.text, /\b(?:approve|publish)\b|--(?:approve|publish)/i)
  assert.throws(() => buildTelegramApprovalRequest({
    title: 'x', topicId: 'y', snapshotHash: 'z', audit: { ok: true },
    publishDate: '2026-07-20', reviewUrl: 'http://review.example.test/item',
  }), /https/)
})

test('notify is gated on explicit generation and successful audit', async () => {
  const root = tempRoot()
  const topicsPath = join(root, 'canonical.csv')
  const postsDir = join(root, 'posts')
  writeFileSync(topicsPath, 'canonical fixture\n', 'utf8')
  mkdirSync(postsDir)
  await assert.rejects(
    () => runThemeBlogFlow({
      topicsPath, postsDir, themeTopicCsv: THEME_API, notify: true,
      reviewUrl: 'https://review.example.test/item',
    }),
    /--notify requires explicit --generate/,
  )

  let notifyCalls = 0
  try {
    const result = await runThemeBlogFlow({
      topicsPath,
      postsDir,
      themeTopicCsv: THEME_API,
      generate: true,
      notify: true,
      reviewUrl: 'https://review.example.test/item',
      generateDraft: async ({ postsDir: outputDir }) => {
        const draftPath = join(outputDir, '2026-07-20-theme-20260714-001.md')
        writeFileSync(draftPath, passMarkdown(), 'utf8')
        return { draftPath }
      },
      sendReviewRequest: async ({ request }) => {
        notifyCalls += 1
        assert.equal(request.audit, 'PASS')
        return { sent: true, reason: 'fixture' }
      },
    })
    assert.equal(result.mode, 'generate')
    assert.equal(result.audited, true)
    assert.equal(result.notified, true)
    assert.equal(notifyCalls, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('injected fetch success commits reservation and failure releases it', async () => {
  const request = buildTelegramApprovalRequest({
    title: 'テーマ', topicId: 'THEME-1', snapshotHash: 'hash-123456789',
    audit: { ok: true, status: 'PASS' }, publishDate: '2026-07-20', reviewUrl: 'https://review.example.test/item',
  })
  let committed = 0
  let released = 0
  let fetchCalls = 0
  const reservation = {
    shouldSend: true, key: 'fixture-key',
    commit: () => { committed += 1 },
    release: () => { released += 1 },
  }
  const success = await sendTelegramApprovalRequest({
    request, root: '/tmp/fixture-root', date: '2026-07-20', botToken: 'fixture-token', chatId: 'fixture-chat',
    reserveImpl: () => reservation,
    fetchImpl: async (url, init) => {
      fetchCalls += 1
      assert.match(url, /api\.telegram\.org/)
      assert.match(init.body, /THEME-1/)
      return { ok: true, json: async () => ({ ok: true }) }
    },
  })
  assert.equal(success.sent, true)
  assert.equal(fetchCalls, 1)
  assert.equal(committed, 1)

  const failedReservation = {
    shouldSend: true, key: 'failed-key',
    commit: () => { throw new Error('must not commit') },
    release: () => { released += 1 },
  }
  await assert.rejects(
    () => sendTelegramApprovalRequest({
      request, root: '/tmp/fixture-root', date: '2026-07-20', botToken: 'fixture-token', chatId: 'fixture-chat',
      reserveImpl: () => failedReservation,
      fetchImpl: async () => { throw new Error('fixture network failure') },
    }),
    /Telegram review request failed/,
  )
  assert.equal(released, 1)
})

test('flow contains no git or outward action subprocess path', () => {
  const source = readFileSync('scripts/theme-blog-flow.mjs', 'utf8')
  assert.doesNotMatch(source, /execFileSyncImpl\([^)]*\b(?:git|push|publish|approve)\b/i)
  assert.doesNotMatch(source, /(?:git\s+(?:add|commit|push)|auto-review-post|approve-post|publish-api)/i)
})

test('generate-draft supports temporary topics path and lineage frontmatter', () => {
  const source = readFileSync('scripts/generate-draft.mjs', 'utf8')
  assert.match(source, /args\.topics_path/)
  assert.match(source, /args\.posts_dir/)
  assert.match(source, /draft: true/)
  for (const field of ['source_theme_topic_id', 'source_theme_snapshot_id', 'source_theme_snapshot_hash', 'source_theme_row_version']) {
    assert.match(source, new RegExp(field))
  }
})

test('Telegram request requires an explicit PASS audit', () => {
  assert.throws(() => buildTelegramApprovalRequest({
    title: 'テーマ', topicId: 'THEME-1', snapshotHash: 'hash-123456789',
    audit: { ok: true }, publishDate: '2026-07-20', reviewUrl: 'https://review.example.test/item',
  }), /audit must be PASS/)
})

test('draft runner forwards the bounded posts directory', () => {
  let capturedArgs
  runGenerateDraft({
    topicId: 'topic_0123456789abcdef',
    topicsPath: '/tmp/topics.csv',
    postsDir: '/tmp/bounded-posts',
    execFileSyncImpl: (_node, args) => {
      capturedArgs = args
      return ''
    },
  })
  assert.deepEqual(capturedArgs.slice(-4), [
    '--topics-path', '/tmp/topics.csv', '--posts-dir', '/tmp/bounded-posts',
  ])
})
