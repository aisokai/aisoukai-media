// 指示書D: X / Threads (と Facebook) のチャンネル対応・短文フォーマット・queue 連携のテスト。
// fixture はすべて架空データで、一時ディレクトリに置く。本物の data/sns-review/ には書き込まない。
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'
import { buildSnsDrafts } from '../scripts/generate-sns-from-post.mjs'
import { VALID_PLATFORMS, checkShortFormFormat, validateSnsDraftData } from '../scripts/lib/sns-drafts.mjs'
import {
  REVIEW_CHECK_KEYS,
  recordSnsReview,
  verifySnsPublishable,
} from '../scripts/lib/sns-mutual-review.mjs'
import { TARGET_CHANNELS, effectiveGatePolicy, loadGateConfig, resolveGatePolicy } from '../scripts/lib/media-queue.mjs'

const ALL_TRUE = Object.fromEntries(REVIEW_CHECK_KEYS.map((key) => [key, true]))
const realConfig = loadGateConfig()
const withFlags = (flags) => ({ ...realConfig, flags: { ...realConfig.flags, ...flags } })
// 表引き (resolveGatePolicy) → 実効判定 (effectiveGatePolicy) の順で評価する。
// 表引きが auto_when_enabled のとき、bind されたフラグがすべて ON なら実効値は auto_after_notify、そうでなければ human_gate
const effective = ({ type, channel, config }) =>
  effectiveGatePolicy({ type, channel, policy: resolveGatePolicy({ type, channel, config }), config })

const roots = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function baseData(platform, extra = {}) {
  return {
    channel: platform,
    platform,
    title: '歯みがきのコツ（架空）',
    date: '2026-11-10',
    status: 'pending_review',
    reviewed: false,
    approved_for_manual_post: false,
    ai_generated: true,
    medical_risk: 'low',
    source_topic_id: 'SNS-202611-010',
    publish_mode: 'manual_only',
    ...extra,
  }
}

const SHORT_BODY = '## 本文\n\nこんにちは、藍想会です（架空）。歯みがきのコツをまとめました。\n\n#歯みがき #予防歯科\n'

function mutualData(platform, extra = {}) {
  return baseData(platform, {
    publish_mode: 'ai_mutual_review',
    created_by: 'claude:run-d-001',
    mutual_review: {
      state: 'pending', content_hash: null, evidence_id: null,
      reviewed_by: null, reviewed_at: null, exception_category: null,
    },
    ...extra,
  })
}

function setup(platform) {
  const root = mkdtempSync(join(tmpdir(), `sns-${platform}-`))
  roots.push(root)
  const draftsDir = join(root, 'content', 'sns-drafts')
  const evidenceDir = join(root, 'data', 'sns-review')
  mkdirSync(draftsDir, { recursive: true })
  const file = `2026-11-10-${platform}-sns-202611-010.md`
  const draftPath = join(draftsDir, file)
  writeFileSync(draftPath, matter.stringify(SHORT_BODY, mutualData(platform)))
  return { root, draftsDir, evidenceDir, file, draftPath }
}

function record(ctx) {
  return recordSnsReview({
    draftPath: ctx.draftPath, decision: 'pass', reviewedBy: 'chatgpt:run-d-101', checks: ALL_TRUE,
    evidenceDir: ctx.evidenceDir, rootDir: ctx.root,
  })
}

const verify = (ctx) => verifySnsPublishable(ctx.draftPath, { evidenceDir: ctx.evidenceDir, rootDir: ctx.root })

for (const platform of ['x', 'threads']) {
  const n = platform === 'x' ? [1, 2, 3, 4] : [5, 6, 7, 8]

  test(`D-${n[0]}: ${platform} の manual_only ドラフトは検証を通る`, () => {
    const result = validateSnsDraftData(`2026-11-10-${platform}-sns-202611-010.md`, baseData(platform), SHORT_BODY)
    assert.deepEqual(result.errors, [])
  })

  test(`D-${n[1]}: ${platform} の ai_mutual_review + state: pending (証拠なし) はエラーなし`, () => {
    const ctx = setup(platform)
    const result = verify(ctx)
    assert.deepEqual(result.errors, [])
    assert.equal(result.publishable, false)
  })

  test(`D-${n[2]}: ${platform} の ai_mutual_review + passed + 正しい証拠 + approved はエラーなし`, () => {
    const ctx = setup(platform)
    const { data, record: rec } = record(ctx)
    assert.equal(data.status, 'approved')
    assert.equal(rec.draft_file, ctx.file)
    const result = verify(ctx)
    assert.deepEqual(result.errors, [])
    assert.equal(result.publishable, true)
  })

  test(`D-${n[3]}: ${platform} で passed を主張するが証拠レコードが無いとエラー`, () => {
    const ctx = setup(platform)
    const parsed = matter(readFileSync(ctx.draftPath, 'utf8'))
    const forged = {
      ...parsed.data,
      status: 'approved',
      reviewed: true,
      reviewed_by: 'chatgpt:run-d-101',
      reviewed_at: '2026-11-10T10:00:00.000+09:00',
      mutual_review: {
        state: 'passed',
        content_hash: 'b'.repeat(64),
        evidence_id: '00000000-0000-4000-8000-0000000000d1',
        reviewed_by: 'chatgpt:run-d-101',
        reviewed_at: '2026-11-10T10:00:00.000+09:00',
        exception_category: null,
      },
    }
    writeFileSync(ctx.draftPath, matter.stringify(parsed.content, forged))
    const result = verify(ctx)
    assert.match(result.errors.join('\n'), /証拠ログ evidence\.jsonl がありません|証拠レコードがありません/)
    assert.equal(result.publishable, false)
  })
}

test('D-2b: x の manual_only と ai_mutual_review の共存ルール (混在はエラー)', () => {
  const file = '2026-11-10-x-sns-202611-010.md'
  const mixed = validateSnsDraftData(file, baseData('x', { created_by: 'claude:run-d-002' }), SHORT_BODY)
  assert.match(mixed.errors.join('\n'), /manual_only のドラフトに created_by/)
})

test('D-9: Threads / Facebook のファイル名 YYYY-MM-DD-<platform>-slug.md が検証を通る', () => {
  for (const platform of ['threads', 'facebook']) {
    const result = validateSnsDraftData(`2026-11-10-${platform}-sns-202611-010.md`, baseData(platform), SHORT_BODY)
    assert.deepEqual(result.errors, [], platform)
  }
  const bad = validateSnsDraftData('2026-11-10-threadz-sns-202611-010.md', baseData('threads'), SHORT_BODY)
  assert.match(bad.errors.join('\n'), /ファイル名/)
})

test('D-10: 許可されていない platform (tiktok) はエラー', () => {
  const result = validateSnsDraftData('2026-11-10-tiktok-sns-202611-010.md', baseData('tiktok'), SHORT_BODY)
  assert.match(result.errors.join('\n'), /platform が無効です/)
  assert.ok(!VALID_PLATFORMS.includes('tiktok'))
})

test('D 短文フォーマット: x / threads ではハッシュタグを本文の末尾にまとめる (途中はエラー)', () => {
  const body = '## 本文\n\n#歯みがき のコツをまとめました（架空）。\n\nご相談ください。\n'
  for (const platform of ['x', 'threads']) {
    const result = validateSnsDraftData(`2026-11-10-${platform}-a.md`, baseData(platform), body)
    assert.match(result.errors.join('\n'), /ハッシュタグは本文の末尾/, platform)
  }
  // instagram の振る舞いは変えない (短文フォーマットの対象外)
  const ig = validateSnsDraftData('2026-11-10-instagram-a.md', baseData('instagram'), body)
  assert.deepEqual(ig.errors, [])
  // 末尾にまとまっていれば通る
  assert.deepEqual(checkShortFormFormat(SHORT_BODY).errors, [])
})

test('D レビュー指摘: 日本語に隣接するハッシュタグも検出し、URL の fragment は誤検出しない', () => {
  assert.match(checkShortFormFormat('## 本文\n\n本文#予防歯科 の続きです（架空）。\n').errors.join('\n'), /ハッシュタグは本文の末尾/)
  assert.deepEqual(checkShortFormFormat('## 本文\n\n詳しくは https://example.invalid/page#section へ（架空）。\n\n#予防歯科\n').errors, [])
})

test('D レビュー指摘: 年付き日付は年を補完した別の日付として二重に抽出しない / 「半」は30分', () => {
  const file = '2026-11-10-threads-closure.md'
  const notice = baseData('threads', { notice_type: 'temporary_closure_notice' })
  const otherYear = validateSnsDraftData(file, notice, '## 本文\n\n2027年 11月10日（水）は臨時休診です（架空）。\n')
  assert.match(otherYear.errors.join('\n'), /frontmatter の date \(2026-11-10\) と一致しません/)
  const halfPast24 = validateSnsDraftData(file, notice, '## 本文\n\n11月10日（火）は24時半まで対応します（架空）。\n')
  assert.match(halfPast24.errors.join('\n'), /時刻が不正/)
  const ok = validateSnsDraftData(file, notice, '## 本文\n\n11月10日（火）は9時半から診療します（架空）。\n')
  assert.deepEqual(ok.errors, [])
})

test('D 短文フォーマット: リンクが2件以上なら警告 (エラーにしない)', () => {
  const body = '## 本文\n\n予約は https://example.invalid/a 、地図は https://example.invalid/b （架空）\n\n#予防歯科\n'
  const result = validateSnsDraftData('2026-11-10-threads-a.md', baseData('threads'), body)
  assert.deepEqual(result.errors, [])
  assert.match(result.warnings.join('\n'), /リンクが 2 件/)
})

// D-11 (文字数上限) は上限値が公式情報で未確認のため除外 (README に未確認と記録)

test('D-12: お知らせ投稿 (Threads) で日付・曜日・時刻が frontmatter の date と不一致ならエラー', () => {
  const file = '2026-11-10-threads-closure.md'
  const notice = baseData('threads', { notice_type: 'temporary_closure_notice' })
  // 2026-11-10 は火曜日
  const ok = validateSnsDraftData(file, notice, '## 本文\n\n11月10日（火）は臨時休診とさせていただきます（架空）。\n')
  assert.deepEqual(ok.errors, [])
  const wrongWeekday = validateSnsDraftData(file, notice, '## 本文\n\n11月10日（月）は臨時休診です（架空）。\n')
  assert.match(wrongWeekday.errors.join('\n'), /曜日が日付と一致しません/)
  const wrongDate = validateSnsDraftData(file, notice, '## 本文\n\n11月11日（水）は臨時休診です（架空）。\n')
  assert.match(wrongDate.errors.join('\n'), /frontmatter の date \(2026-11-10\) と一致しません/)
  const noDate = validateSnsDraftData(file, notice, '## 本文\n\n明日は臨時休診です（架空）。\n')
  assert.match(noDate.errors.join('\n'), /日付の記載がありません/)
  const badTime = validateSnsDraftData(file, baseData('threads', { notice_type: 'schedule_change_notice' }),
    '## 本文\n\n2026年11月10日（火）は 9:00〜25:30 の診療です（架空）。\n')
  assert.match(badTime.errors.join('\n'), /時刻が不正/)
  const badType = validateSnsDraftData(file, baseData('threads', { notice_type: 'campaign' }), SHORT_BODY)
  assert.match(badType.errors.join('\n'), /notice_type が無効です/)
})

test('D-13: TARGET_CHANNELS に threads が含まれ、threads_auto ON で sns_repurpose:threads が auto_when_enabled', () => {
  assert.ok(TARGET_CHANNELS.includes('threads'))
  const config = withFlags({ threads_auto: true })
  assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel: 'threads', config }), 'auto_when_enabled')
  assert.equal(effective({ type: 'sns_repurpose', channel: 'threads', config }), 'auto_after_notify')
  // フラグ OFF (実設定の既定) では実効 human_gate
  assert.equal(effective({ type: 'sns_repurpose', channel: 'threads', config: realConfig }), 'human_gate')
})

test('D-14: お知らせ投稿は threads_notice_auto に分離される (threads_auto だけでは解禁されない)', () => {
  assert.equal(resolveGatePolicy({ type: 'temporary_closure_notice', channel: 'threads', config: withFlags({ threads_notice_auto: true }) }), 'auto_when_enabled')
  assert.equal(effective({ type: 'temporary_closure_notice', channel: 'threads', config: withFlags({ threads_notice_auto: true }) }), 'auto_after_notify')
  assert.equal(effective({ type: 'temporary_closure_notice', channel: 'threads', config: withFlags({ threads_auto: true }) }), 'human_gate')
  assert.equal(effective({ type: 'schedule_change_notice', channel: 'x', config: withFlags({ x_auto: true }) }), 'human_gate')
  assert.equal(effective({ type: 'schedule_change_notice', channel: 'x', config: withFlags({ x_notice_auto: true }) }), 'auto_after_notify')
})

test('D-15: sns_auto_suspend ON では sns_repurpose:threads / facebook も human_gate', () => {
  const config = withFlags({ threads_auto: true, facebook_auto: true, sns_auto_suspend: true })
  for (const channel of ['threads', 'facebook', 'x']) {
    assert.equal(resolveGatePolicy({ type: 'sns_repurpose', channel, config }), 'human_gate', channel)
  }
})

test('D Facebook: TARGET_CHANNELS に facebook が含まれ、facebook_auto に bind される', () => {
  assert.ok(TARGET_CHANNELS.includes('facebook'))
  assert.equal(effective({ type: 'sns_repurpose', channel: 'facebook', config: withFlags({ facebook_auto: true }) }), 'auto_after_notify')
  assert.equal(effective({ type: 'sns_repurpose', channel: 'facebook', config: realConfig }), 'human_gate')
})

test('D-16: 生成系は明示指定で threads / facebook のドラフトを生成し、検証を通る (manual_only 固定)', () => {
  const postData = {
    title: '歯ぐきから血が出るときのセルフチェック（架空）',
    excerpt: '受診の目安を整理します。',
    tags: ['歯周病', 'セルフチェック'],
    medical_risk: 'low',
    source_topic_id: 'TOPIC-D-001',
  }
  const drafts = buildSnsDrafts({ postFile: '2026-11-01-sample.md', postData, platforms: ['threads', 'facebook'], date: '2026-11-10' })
  assert.deepEqual(drafts.map((d) => d.data.platform), ['threads', 'facebook'])
  for (const draft of drafts) {
    const result = validateSnsDraftData(draft.filename, draft.data, draft.content)
    assert.deepEqual(result.errors, [], `${draft.filename}: ${result.errors.join(' / ')}`)
    assert.equal(draft.data.publish_mode, 'manual_only')
    assert.equal(draft.data.status, 'pending_review')
    assert.equal(draft.data.approved_for_manual_post, false)
  }
  // 既定 (--platforms 省略) は従来どおり instagram / x / line の3件
  const defaults = buildSnsDrafts({ postFile: '2026-11-01-sample.md', postData, date: '2026-11-10' })
  assert.deepEqual(defaults.map((d) => d.data.platform), ['instagram', 'x', 'line'])
})
