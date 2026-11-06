// 指示書C 第2層 (証拠照合) と証拠記録のテスト。fixture はすべて架空データで、一時ディレクトリに置く。
// 本物の data/sns-review/ には書き込まない。
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { applySnsReviewDecision } from '../scripts/lib/sns-review.mjs'
import { parseChecks } from '../scripts/record-sns-review.mjs'
import {
  ALLOWED_REVIEW_PAIRS,
  EVIDENCE_FILE,
  HASH_ALGORITHM,
  REVIEW_CHECK_KEYS,
  appendEvidenceRecord,
  appendPostingAuditRecord,
  collectMediaHashes,
  computeSnsContentHash,
  loadLog,
  readCurrentPolicyVersion,
  recordSnsReview,
  verifySnsPublishable,
} from '../scripts/lib/sns-mutual-review.mjs'

const POLICY = readCurrentPolicyVersion()
const ALL_TRUE = Object.fromEntries(REVIEW_CHECK_KEYS.map((key) => [key, true]))
const NOW = Date.UTC(2026, 10, 10, 1, 0, 0)
const BODY = '## キャプション\n\n歯みがき習慣を見直しましょう。\n\n#歯みがき #予防歯科\n'

const roots = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function setup({ withMedia = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sns-mutual-review-'))
  roots.push(root)
  const draftsDir = join(root, 'content', 'sns-drafts')
  const evidenceDir = join(root, 'data', 'sns-review')
  mkdirSync(draftsDir, { recursive: true })
  mkdirSync(join(root, 'public', 'images', 'sns'), { recursive: true })
  writeFileSync(join(root, 'public', 'images', 'sns', 'example-01.png'), Buffer.from('fictional-image-bytes-01'))
  const file = '2026-11-10-instagram-sns-202611-001.md'
  const draftPath = join(draftsDir, file)
  const data = {
    channel: 'instagram',
    platform: 'instagram',
    title: '歯みがき習慣の見直し（架空）',
    date: '2026-11-10',
    status: 'pending_review',
    reviewed: false,
    approved_for_manual_post: false,
    ai_generated: true,
    medical_risk: 'low',
    source_topic_id: 'SNS-202611-001',
    publish_mode: 'ai_mutual_review',
    created_by: 'claude:run-20261110-001',
    ...(withMedia ? { media_files: ['public/images/sns/example-01.png'] } : {}),
    mutual_review: {
      state: 'pending', content_hash: null, evidence_id: null,
      reviewed_by: null, reviewed_at: null, exception_category: null,
    },
  }
  writeFileSync(draftPath, matter.stringify(BODY, data))
  return { root, draftsDir, evidenceDir, file, draftPath }
}

function record(ctx, overrides = {}) {
  return recordSnsReview({
    draftPath: ctx.draftPath,
    decision: 'pass',
    reviewedBy: 'chatgpt:run-20261110-101',
    checks: ALL_TRUE,
    evidenceDir: ctx.evidenceDir,
    rootDir: ctx.root,
    now: NOW,
    ...overrides,
  })
}

function verify(ctx, options = {}) {
  return verifySnsPublishable(ctx.draftPath, { evidenceDir: ctx.evidenceDir, rootDir: ctx.root, ...options })
}

// 記録 CLI を経由せずに任意の証拠を作る (改竄・同一系統などの異常系を模す)
function forgeReviewed(ctx, evidence = {}, frontmatter = {}) {
  const parsed = matter(readFileSync(ctx.draftPath, 'utf8'))
  const { contentHash, mediaHashes } = computeSnsContentHash({ data: parsed.data, content: parsed.content, rootDir: ctx.root })
  const reviewedBy = evidence.reviewed_by ?? 'chatgpt:run-20261110-101'
  const rec = appendEvidenceRecord({
    draft_file: ctx.file,
    content_hash: contentHash,
    hash_algorithm: HASH_ALGORITHM,
    media_hashes: mediaHashes,
    created_by: parsed.data.created_by,
    creator_system: 'claude',
    reviewed_by: reviewedBy,
    reviewer_system: 'chatgpt',
    decision: 'pass',
    checks: ALL_TRUE,
    exception_category: null,
    policy_version: POLICY,
    notes: null,
    ...evidence,
  }, { evidenceDir: ctx.evidenceDir, now: NOW })
  const decisionState = { pass: 'passed', changes_requested: 'changes_requested', escalate: 'escalated' }[rec.decision]
  const data = {
    ...parsed.data,
    status: decisionState === 'passed' ? 'approved' : 'pending_review',
    reviewed: true,
    reviewed_by: reviewedBy,
    reviewed_at: rec.recorded_at,
    mutual_review: {
      state: decisionState,
      content_hash: contentHash,
      evidence_id: rec.record_id,
      reviewed_by: reviewedBy,
      reviewed_at: rec.recorded_at,
      exception_category: rec.exception_category,
    },
    ...frontmatter,
  }
  writeFileSync(ctx.draftPath, matter.stringify(parsed.content, data))
  return rec
}

test('policy version は AGENTS.md の Policy record から読む', () => {
  assert.equal(POLICY, 'aisoukai-media-tiered-blog-sns-2026-11-06')
})

test('初期ペアは 作成 = claude / レビュー = chatgpt のみ', () => {
  assert.deepEqual(ALLOWED_REVIEW_PAIRS.map((p) => ({ ...p })), [{ creator: 'claude', reviewer: 'chatgpt' }])
})

test('C-3: state: pending は証拠ログが無くても第2層エラーにならない (投稿可能でもない)', () => {
  const ctx = setup()
  const result = verify(ctx)
  assert.deepEqual(result.errors, [])
  assert.equal(result.publishable, false)
})

test('C-4 / C-18: 証拠記録CLI で追記 → チェーンにつながり、検証を通る', () => {
  const ctx = setup()
  const first = record(ctx)
  assert.equal(first.record.prev_hash, null)
  assert.equal(first.data.status, 'approved')
  assert.equal(first.data.mutual_review.state, 'passed')
  assert.equal(first.data.approved_for_manual_post, false)
  assert.equal(first.data.reviewed, true)
  assert.equal(first.record.policy_version, POLICY)
  assert.equal(first.record.hash_algorithm, HASH_ALGORITHM)
  assert.equal(first.record.media_hashes.length, 1)

  const result = verify(ctx)
  assert.deepEqual(result.errors, [])
  assert.equal(result.publishable, true)

  // 2件目の証拠が直前レコードにつながる
  const ctx2 = { ...setup(), evidenceDir: ctx.evidenceDir }
  const second = record(ctx2)
  assert.equal(second.record.prev_hash, first.record.record_hash)
  const log = loadLog(ctx.evidenceDir, EVIDENCE_FILE, 'sns_review_evidence')
  assert.deepEqual(log.errors, [])
  assert.equal(log.records.length, 2)
  assert.deepEqual(verify(ctx2).errors, [])
})

test('C-4b: メディアなし (media_files 省略) でも記録・検証できる', () => {
  const ctx = setup({ withMedia: false })
  const { record: rec } = record(ctx)
  assert.deepEqual(rec.media_hashes, [])
  assert.deepEqual(verify(ctx).errors, [])
})

test('C-5: state: passed を主張するが証拠レコードが無い', () => {
  const ctx = setup()
  record(ctx)
  const parsed = matter(readFileSync(ctx.draftPath, 'utf8'))
  parsed.data.mutual_review.evidence_id = '00000000-0000-4000-8000-00000000dead'
  writeFileSync(ctx.draftPath, matter.stringify(parsed.content, parsed.data))
  assert.match(verify(ctx).errors.join('\n'), /証拠レコードがありません/)

  const noLog = setup()
  forgeReviewed(noLog)
  const moved = join(noLog.root, 'moved.jsonl')
  renameSync(join(noLog.evidenceDir, EVIDENCE_FILE), moved)
  assert.match(verify(noLog).errors.join('\n'), /証拠ログ evidence\.jsonl がありません/)
})

test('C-6: レビュー後に本文を変更すると hash 不一致でエラー', () => {
  const ctx = setup()
  record(ctx)
  const parsed = matter(readFileSync(ctx.draftPath, 'utf8'))
  writeFileSync(ctx.draftPath, matter.stringify(parsed.content + '\n追記された一文。\n', parsed.data))
  const result = verify(ctx)
  assert.match(result.errors.join('\n'), /hash/)
  assert.equal(result.publishable, false)
})

test('C-6b: タイトルの付け替え・メディアの差し替えも hash 不一致になる', () => {
  const ctx = setup()
  record(ctx)
  const parsed = matter(readFileSync(ctx.draftPath, 'utf8'))
  writeFileSync(ctx.draftPath, matter.stringify(parsed.content, { ...parsed.data, title: '別のタイトル' }))
  assert.match(verify(ctx).errors.join('\n'), /hash/)

  const ctx2 = setup()
  record(ctx2)
  writeFileSync(join(ctx2.root, 'public', 'images', 'sns', 'example-01.png'), Buffer.from('replaced-bytes'))
  assert.match(verify(ctx2).errors.join('\n'), /hash/)
})

test('C-6c: 改行コードと末尾改行の違いは hash に影響しない', () => {
  const ctx = setup()
  const parsed = matter(readFileSync(ctx.draftPath, 'utf8'))
  const a = computeSnsContentHash({ data: parsed.data, content: 'a\nb\n', rootDir: ctx.root })
  const b = computeSnsContentHash({ data: parsed.data, content: 'a\r\nb\n\n\n', rootDir: ctx.root })
  assert.equal(a.contentHash, b.contentHash)
})

test('C-7: 同一系統レビュー (creator も reviewer も claude) の証拠はエラー', () => {
  const ctx = setup()
  forgeReviewed(ctx, { reviewed_by: 'claude:run-20261110-102', reviewer_system: 'claude' })
  assert.match(verify(ctx).errors.join('\n'), /同一系統/)
  // 記録 CLI も同一系統を拒否する
  const ctx2 = setup()
  assert.throws(() => record(ctx2, { reviewedBy: 'claude:run-20261110-103' }), /同一系統/)
})

test('C-8: ペア外レビュー (reviewer が muse) の証拠はエラー', () => {
  const ctx = setup()
  forgeReviewed(ctx, { reviewed_by: 'muse:run-20261110-201', reviewer_system: 'muse' })
  assert.match(verify(ctx).errors.join('\n'), /許可されていない作成\/レビューの組み合わせ/)
  const ctx2 = setup()
  assert.throws(() => record(ctx2, { reviewedBy: 'muse:run-20261110-202' }), /許可されていない/)
})

test('C-8b: 証拠の reviewer_system が reviewed_by と食い違う証拠はエラー', () => {
  const ctx = setup()
  forgeReviewed(ctx, { reviewed_by: 'claude:run-x', reviewer_system: 'chatgpt' })
  assert.match(verify(ctx).errors.join('\n'), /reviewer_system が reviewed_by と一致しません/)
})

test('C-13: 証拠の policy_version が現行と不一致', () => {
  const ctx = setup()
  forgeReviewed(ctx, { policy_version: 'aisoukai-media-tiered-blog-2026-09-14' })
  assert.match(verify(ctx).errors.join('\n'), /policy_version/)
})

test('C-14: evidence.jsonl の行を書き換えるとチェーン検証でエラー', () => {
  const ctx = setup()
  record(ctx)
  const path = join(ctx.evidenceDir, EVIDENCE_FILE)
  const tampered = readFileSync(path, 'utf8').replace('"notes":null', '"notes":"後から書き換え"')
  writeFileSync(path, tampered)
  assert.match(verify(ctx).errors.join('\n'), /record_hash が内容と一致しません/)
  // 壊れたチェーンには追記しない
  const ctx2 = { ...setup(), evidenceDir: ctx.evidenceDir }
  assert.throws(() => record(ctx2), /チェーンが壊れている/)
})

test('C-14b: 行の欠落・挿入も prev_hash の不一致として検出する', () => {
  const ctx = setup()
  record(ctx)
  record({ ...setup(), evidenceDir: ctx.evidenceDir })
  const path = join(ctx.evidenceDir, EVIDENCE_FILE)
  const lines = readFileSync(path, 'utf8').trim().split('\n')
  writeFileSync(path, lines[1] + '\n')
  const log = loadLog(ctx.evidenceDir, EVIDENCE_FILE, 'sns_review_evidence')
  assert.match(log.errors.join('\n'), /prev_hash/)
})

test('C-15: decision: pass なのに checks に false を含む証拠はエラー', () => {
  const ctx = setup()
  forgeReviewed(ctx, { checks: { ...ALL_TRUE, media_rights: false } })
  assert.match(verify(ctx).errors.join('\n'), /checks に true でない項目/)
  const ctx2 = setup()
  assert.throws(() => record(ctx2, { checks: { ...ALL_TRUE, facts: false } }), /true でない項目/)
})

test('C-16: passed のドラフトで media_files の実ファイルが欠落するとエラー', () => {
  const ctx = setup()
  record(ctx)
  renameSync(join(ctx.root, 'public', 'images', 'sns', 'example-01.png'), join(ctx.root, 'moved.png'))
  const result = verify(ctx)
  assert.match(result.errors.join('\n'), /media_files のファイルが存在しません/)
  assert.equal(result.publishable, false)
})

test('C-17: status: posted なのに監査ログに対応レコードが無い', () => {
  const ctx = setup()
  const { record: rec } = record(ctx)
  const parsed = matter(readFileSync(ctx.draftPath, 'utf8'))
  writeFileSync(ctx.draftPath, matter.stringify(parsed.content, { ...parsed.data, status: 'posted' }))
  assert.match(verify(ctx).errors.join('\n'), /投稿監査ログ/)

  appendPostingAuditRecord({
    draft_file: ctx.file,
    evidence_id: rec.record_id,
    content_hash: rec.content_hash,
    platform: 'instagram',
    action: 'post',
    post_id: 'fictional-post-001',
    post_url: 'https://example.invalid/p/fictional-post-001',
    result: 'success',
    detail: null,
  }, { evidenceDir: ctx.evidenceDir, now: NOW })
  assert.deepEqual(verify(ctx).errors, [])
})

test('decision と state の対応: changes_requested / escalate を記録できる', () => {
  const ctx = setup()
  const { data } = record(ctx, {
    decision: 'changes_requested',
    checks: { ...ALL_TRUE, brand_tone: false },
    notes: '表現を柔らかく（架空）',
  })
  assert.equal(data.mutual_review.state, 'changes_requested')
  assert.equal(data.status, 'pending_review')
  assert.deepEqual(verify(ctx).errors, [])
  assert.equal(verify(ctx).publishable, false)

  const ctx2 = setup()
  assert.throws(() => record(ctx2, { decision: 'escalate' }), /exception_category が必須/)
  const { data: escalated } = record(ctx2, { decision: 'escalate', exceptionCategory: 'reviewer_disagreement' })
  assert.equal(escalated.mutual_review.state, 'escalated')
  assert.deepEqual(verify(ctx2).errors, [])
  assert.equal(verify(ctx2).publishable, false)
})

test('decision と state が対応しない証拠はエラー', () => {
  const ctx = setup()
  forgeReviewed(ctx, {}, {})
  const parsed = matter(readFileSync(ctx.draftPath, 'utf8'))
  parsed.data.mutual_review.state = 'changes_requested'
  parsed.data.status = 'pending_review'
  writeFileSync(ctx.draftPath, matter.stringify(parsed.content, parsed.data))
  assert.match(verify(ctx).errors.join('\n'), /decision \(pass\) と mutual_review\.state \(changes_requested\)/)
})

test('記録 CLI は passed / escalated のドラフトや manual_only には記録しない', () => {
  const ctx = setup()
  record(ctx)
  assert.throws(() => record(ctx), /記録できません/)

  const manual = setup()
  const parsed = matter(readFileSync(manual.draftPath, 'utf8'))
  const { created_by: _c, mutual_review: _m, media_files: _f, ...rest } = parsed.data
  writeFileSync(manual.draftPath, matter.stringify(parsed.content, { ...rest, publish_mode: 'manual_only' }))
  assert.throws(() => record(manual), /ai_mutual_review のドラフトのみ/)
})

test('parseChecks: 7項目すべての明示指定を要求する', () => {
  const full = REVIEW_CHECK_KEYS.map((k) => `${k}=true`).join(',')
  assert.deepEqual(parseChecks(full), ALL_TRUE)
  assert.throws(() => parseChecks('medical_ad=true'), /未指定/)
  assert.throws(() => parseChecks(`${full},unknown=true`), /無効/)
  assert.throws(() => parseChecks(full.replace('facts=true', 'facts=yes')), /true \/ false/)
})

test('Human 承認 CLI は ai_mutual_review のドラフトを対象外にする', () => {
  const ctx = setup()
  const { data } = matter(readFileSync(ctx.draftPath, 'utf8'))
  for (const decision of ['approve', 'reject']) {
    assert.throws(() => applySnsReviewDecision({
      data, decision, reviewedBy: '三谷院長', reason: '架空', timestamp: '2026-11-10T10:00:00+09:00',
    }), /対象外/)
  }
})

test('投稿監査: action: post では post_id / post_url が必須', () => {
  const ctx = setup()
  assert.throws(() => appendPostingAuditRecord({
    draft_file: ctx.file, evidence_id: null, content_hash: null, platform: 'instagram',
    action: 'post', post_id: null, post_url: null, result: 'success', detail: null,
  }, { evidenceDir: ctx.evidenceDir }), /post_id と post_url/)
})

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

test('レビュー指摘: media_files の symlink が repo 外を指す場合は読み込まずエラー', () => {
  const ctx = setup({ withMedia: false })
  const outside = mkdtempSync(join(tmpdir(), 'sns-outside-'))
  roots.push(outside)
  writeFileSync(join(outside, 'secret.txt'), 'fictional-outside')
  symlinkSync(join(outside, 'secret.txt'), join(ctx.root, 'public', 'images', 'sns', 'link.png'))
  const parsed = matter(readFileSync(ctx.draftPath, 'utf8'))
  writeFileSync(ctx.draftPath, matter.stringify(parsed.content, { ...parsed.data, media_files: ['public/images/sns/link.png'] }))
  assert.throws(() => record(ctx), /repo 外/)
  assert.match(
    collectErrors(() => computeSnsContentHash({ data: { media_files: ['public/images/sns/link.png'] }, content: '', rootDir: ctx.root })),
    /repo 外/,
  )
})

test('レビュー指摘: repo 内のドットファイルへの symlink も拒否する', () => {
  const ctx = setup({ withMedia: false })
  writeFileSync(join(ctx.root, '.env.fictional'), 'FICTIONAL=1')
  symlinkSync(join(ctx.root, '.env.fictional'), join(ctx.root, 'public', 'images', 'sns', 'env.png'))
  assert.match(
    collectErrors(() => computeSnsContentHash({ data: { media_files: ['public/images/sns/env.png'] }, content: '', rootDir: ctx.root })),
    /許可されないパス/,
  )
})

test('レビュー指摘: 証拠追記後に frontmatter 更新が失敗した状態 (pending のまま) を検出する', () => {
  const ctx = setup()
  const before = readFileSync(ctx.draftPath, 'utf8')
  record(ctx)
  writeFileSync(ctx.draftPath, before) // frontmatter 更新が失敗した状態を模す
  const result = verify(ctx)
  assert.match(result.errors.join('\n'), /未反映/)
  assert.equal(result.publishable, false)
})

test('レビュー指摘: 再レビューの証拠が frontmatter に反映されていない場合 (古い evidence_id のまま) を検出する', () => {
  const ctx = setup()
  record(ctx, { decision: 'changes_requested', checks: { ...ALL_TRUE, facts: false } })
  const afterFirst = readFileSync(ctx.draftPath, 'utf8')
  record(ctx)
  writeFileSync(ctx.draftPath, afterFirst)
  assert.match(verify(ctx).errors.join('\n'), /最新の証拠/)
  // 再記録で整合が取れる (changes_requested → pass)
  record(ctx)
  assert.deepEqual(verify(ctx).errors, [])
})

test('レビュー指摘: 証拠レコードに定義外キーを追加するとチェーン検証でエラー', () => {
  const ctx = setup()
  record(ctx)
  const path = join(ctx.evidenceDir, EVIDENCE_FILE)
  const line = JSON.parse(readFileSync(path, 'utf8').trim())
  line.approved_by_human = true
  writeFileSync(path, JSON.stringify(line) + '\n')
  assert.match(verify(ctx).errors.join('\n'), /定義外のキー/)
  const checksExtra = JSON.parse(readFileSync(path, 'utf8').trim())
  delete checksExtra.approved_by_human
  checksExtra.checks.extra = true
  writeFileSync(path, JSON.stringify(checksExtra) + '\n')
  assert.match(verify(ctx).errors.join('\n'), /checks に定義外の項目/)
})

test('CLI: record-sns-review の引数処理 → validate-sns-drafts が通る (C-18 CLI 経由)', () => {
  const ctx = setup({ withMedia: false })
  const checks = REVIEW_CHECK_KEYS.map((k) => `${k}=true`).join(',')
  const rec = spawnSync(process.execPath, [
    join(REPO, 'scripts', 'record-sns-review.mjs'), ctx.file,
    '--decision', 'pass', '--reviewed-by', 'chatgpt:run-cli-001', '--checks', checks,
    '--drafts-dir', ctx.draftsDir, '--evidence-dir', ctx.evidenceDir,
  ], { encoding: 'utf8' })
  assert.equal(rec.status, 0, rec.stderr)
  assert.match(rec.stdout, /レビュー証拠を記録しました/)

  const val = spawnSync(process.execPath, [
    join(REPO, 'scripts', 'validate-sns-drafts.mjs'), '--drafts-dir', ctx.draftsDir, '--evidence-dir', ctx.evidenceDir,
  ], { encoding: 'utf8' })
  assert.equal(val.status, 0, val.stderr)
  assert.match(val.stdout, /All SNS drafts valid \(1 件\)/)

  const bad = spawnSync(process.execPath, [
    join(REPO, 'scripts', 'record-sns-review.mjs'), ctx.file,
    '--decision', 'pass', '--reviewed-by', 'chatgpt:run-cli-002', '--checks', 'medical_ad=true',
    '--drafts-dir', ctx.draftsDir, '--evidence-dir', ctx.evidenceDir,
  ], { encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /未指定/)
})

test('CLI: 不正な YAML のドラフトもファイル単位のエラーとして報告し、他のドラフトの検証を続ける', () => {
  const ctx = setup({ withMedia: false })
  writeFileSync(join(ctx.draftsDir, '2026-11-11-instagram-broken.md'), '---\ntitle: [unclosed\n---\n本文\n')
  const val = spawnSync(process.execPath, [
    join(REPO, 'scripts', 'validate-sns-drafts.mjs'), '--drafts-dir', ctx.draftsDir, '--evidence-dir', ctx.evidenceDir,
  ], { encoding: 'utf8' })
  assert.equal(val.status, 1)
  assert.match(val.stderr, /2026-11-11-instagram-broken\.md/)
  assert.match(val.stderr, /読み込み・検証に失敗しました/)
  assert.doesNotMatch(val.stderr, /2026-11-10-instagram-sns-202611-001\.md/)
})

test('先生決定: media_files は public/images/ 配下のみ (指定パスと symlink 実体の両方)', () => {
  const ctx = setup({ withMedia: false })
  mkdirSync(join(ctx.root, 'config'), { recursive: true })
  writeFileSync(join(ctx.root, 'config', 'fictional.json'), '{"fictional":true}')
  // 指定パスが領域外
  assert.match(
    collectErrors(() => computeSnsContentHash({ data: { media_files: ['config/fictional.json'] }, content: '', rootDir: ctx.root })),
    /public\/images\/ 配下/,
  )
  // 指定パスは領域内だが、実体が repo 内の領域外
  symlinkSync(join(ctx.root, 'config', 'fictional.json'), join(ctx.root, 'public', 'images', 'sns', 'cfg.png'))
  assert.match(
    collectErrors(() => computeSnsContentHash({ data: { media_files: ['public/images/sns/cfg.png'] }, content: '', rootDir: ctx.root })),
    /実体が許可されないパス/,
  )
  // 領域内の実ファイルは読み込める
  assert.equal(
    computeSnsContentHash({ data: { media_files: ['public/images/sns/example-01.png'] }, content: '', rootDir: ctx.root }).mediaHashes.length,
    1,
  )
})

test('レビュー指摘 (TOCTOU): 検査後・open 前にファイルを領域外への symlink に差し替えると読み込まない', () => {
  const ctx = setup({ withMedia: false })
  const outside = mkdtempSync(join(tmpdir(), 'sns-toctou-'))
  roots.push(outside)
  writeFileSync(join(outside, 'secret.png'), 'fictional-outside')
  const target = join(ctx.root, 'public', 'images', 'sns', 'example-01.png')
  const { errors, mediaHashes } = collectMediaHashes(['public/images/sns/example-01.png'], ctx.root, {
    beforeOpen: () => {
      renameSync(target, join(ctx.root, 'moved-01.png'))
      symlinkSync(join(outside, 'secret.png'), target)
    },
  })
  assert.equal(mediaHashes, null)
  assert.match(errors.join('\n'), /安全に開けません|差し替え/)
})

test('レビュー指摘 (TOCTOU): 検査後・open 前に親ディレクトリを領域外への symlink に差し替えると読み込まない', () => {
  const ctx = setup({ withMedia: false })
  const outside = mkdtempSync(join(tmpdir(), 'sns-toctou-dir-'))
  roots.push(outside)
  writeFileSync(join(outside, 'example-01.png'), 'fictional-outside')
  const dir = join(ctx.root, 'public', 'images', 'sns')
  const { errors, mediaHashes } = collectMediaHashes(['public/images/sns/example-01.png'], ctx.root, {
    beforeOpen: () => {
      renameSync(dir, join(ctx.root, 'moved-sns'))
      symlinkSync(outside, dir)
    },
  })
  assert.equal(mediaHashes, null)
  assert.match(errors.join('\n'), /差し替え|許可されない|repo 外/)
})

test('補強: 経路上に symlink がある (repo 内・許可領域内を指していても) メディアは読み込まない', () => {
  const ctx = setup({ withMedia: false })
  symlinkSync(join(ctx.root, 'public', 'images', 'sns', 'example-01.png'), join(ctx.root, 'public', 'images', 'sns', 'alias.png'))
  const viaLink = collectMediaHashes(['public/images/sns/alias.png'], ctx.root)
  assert.equal(viaLink.mediaHashes, null)
  assert.match(viaLink.errors.join('\n'), /symlink は使えません/)
  mkdirSync(join(ctx.root, 'public', 'images', 'real-dir'), { recursive: true })
  writeFileSync(join(ctx.root, 'public', 'images', 'real-dir', 'a.png'), 'fictional')
  symlinkSync(join(ctx.root, 'public', 'images', 'real-dir'), join(ctx.root, 'public', 'images', 'dir-link'))
  const viaDirLink = collectMediaHashes(['public/images/dir-link/a.png'], ctx.root)
  assert.match(viaDirLink.errors.join('\n'), /symlink は使えません/)
})

test('補強: ハードリンクされたメディアは読み込まない', () => {
  const ctx = setup({ withMedia: false })
  const outside = mkdtempSync(join(tmpdir(), 'sns-hardlink-'))
  roots.push(outside)
  writeFileSync(join(outside, 'secret.png'), 'fictional-outside')
  let linked = true
  try {
    linkSync(join(outside, 'secret.png'), join(ctx.root, 'public', 'images', 'sns', 'hard.png'))
  } catch {
    linked = false // 別ボリュームでハードリンクを作れない環境では、同一ボリューム内で作る
    linkSync(join(ctx.root, 'public', 'images', 'sns', 'example-01.png'), join(ctx.root, 'public', 'images', 'sns', 'hard.png'))
  }
  const result = collectMediaHashes(['public/images/sns/hard.png'], ctx.root)
  assert.equal(result.mediaHashes, null, linked ? 'repo 外とのハードリンク' : 'repo 内のハードリンク')
  assert.match(result.errors.join('\n'), /ハードリンク/)
})

function collectErrors(fn) {
  try {
    fn()
  } catch (e) {
    return e.message
  }
  return ''
}
