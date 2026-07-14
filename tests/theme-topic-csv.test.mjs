import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  THEME_TOPIC_CSV_COLUMNS,
  buildBlogTopicRow,
  findExistingThemeSourceTopicIds,
  parseThemeTopicCsv,
  selectBlogThemeTopics,
} from '../scripts/lib/theme-topic-csv.mjs'

const HEADER = THEME_TOPIC_CSV_COLUMNS.join(',')

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function themeRow(overrides = {}) {
  return {
    schema_version: 'theme-topic-csv.v1',
    snapshot_id: 'notebook_event_01234567-89ab-4cde-8fab-0123456789ab',
    snapshot_hash: 'a'.repeat(64),
    topic_id: 'topic_0123456789abcdef',
    row_version: '3',
    topic: '子どもの定期検診とフッ素の考え方',
    patient_value: '子どもの予防ケアを知りたい',
    clinic_fit: '一般的な予防歯科の案内',
    safe_angle: '年齢や状態で異なるため、目安と相談時の確認点を整理する',
    avoid_claims: [],
    source_kind: 'local_hypothesis',
    source_summary_hash: 'b'.repeat(64),
    recommended_channels: ['blog'],
    channel_fit_reasons: { blog: '検索意図を説明しやすい' },
    required_asset_kinds: [],
    state: 'active',
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
    last_audited_at: '2026-07-14T00:00:00Z',
    audit_policy_version: 'audit-v1',
    ...overrides,
  }
}

function csvFor(rows) {
  return `${HEADER}\n${rows.map((row) => THEME_TOPIC_CSV_COLUMNS.map((column) => {
    const value = typeof row[column] === 'object' ? JSON.stringify(row[column]) : row[column]
    return csvCell(value)
  }).join(',')).join('\n')}\n`
}

test('parses the fixed contract and maps a safe Blog topic row', () => {
  const [parsed] = parseThemeTopicCsv(csvFor([themeRow()]))
  const mapped = buildBlogTopicRow(parsed, { publishDate: '2026-08-01' })

  assert.deepEqual(parsed.recommended_channels, ['blog'])
  assert.equal(mapped.id, 'topic_0123456789abcdef')
  assert.equal(mapped.source_topic_id, 'topic_0123456789abcdef')
  assert.equal(mapped.source_theme_topic_id, 'topic_0123456789abcdef')
  assert.match(mapped.source_theme_snapshot_id, /^notebook_event_/)
  assert.equal(mapped.source_theme_snapshot_hash, 'a'.repeat(64))
  assert.equal(mapped.source_theme_row_version, '3')
  assert.equal(mapped.topic, parsed.topic)
  assert.equal(mapped.title_candidate, parsed.topic)
  assert.equal(mapped.target_keyword, parsed.topic)
  assert.equal(mapped.patient_intent, parsed.patient_value)
  assert.equal(mapped.category, '小児歯科')
  assert.equal(mapped.medical_risk, 'medium')
  assert.equal(mapped.status, 'theme_ready')
  assert.equal(mapped.priority, 'medium')
  assert.equal(mapped.publish_date, '2026-08-01')
  assert.equal(mapped.source_url, '')
  assert.equal(mapped.source_snapshot_hash, 'a'.repeat(64))
  assert.equal(mapped.source_row_version, '3')
  assert.match(mapped.notes, /safe_angle/)
  assert.match(mapped.notes, /snapshot_id/)
  assert.match(mapped.notes, /source_summary_hash/)
})

test('selects only Blog channels and excludes existing source topic IDs', () => {
  const rows = parseThemeTopicCsv(csvFor([
    themeRow({ topic_id: 'topic_1111111111111111' }),
    themeRow({ topic_id: 'topic_2222222222222222', recommended_channels: ['instagram'], channel_fit_reasons: { instagram: '画像向け' } }),
    themeRow({ topic_id: 'topic_3333333333333333' }),
  ]))
  const selected = selectBlogThemeTopics(rows, { existingSourceTopicIds: new Set(['topic_3333333333333333']) })
  assert.deepEqual(selected.map((row) => row.topic_id), ['topic_1111111111111111'])
})

test('rejects mixed snapshots, unknown schema, and formula injection', () => {
  assert.throws(() => parseThemeTopicCsv(csvFor([
    themeRow(),
    themeRow({ topic_id: 'topic_1111111111111111', snapshot_hash: 'c'.repeat(64) }),
  ])), /snapshot_id\/hash/)
  assert.throws(() => parseThemeTopicCsv(csvFor([themeRow({ schema_version: 'theme-topic-csv.v2' })])), /未知のschema_version/)
  assert.throws(() => parseThemeTopicCsv(csvFor([themeRow({ topic: '=HYPERLINK("https://bad")' })])), /数式注入/)
})

test('rejects duplicate theme topic IDs', () => {
  assert.throws(() => parseThemeTopicCsv(csvFor([
    themeRow(),
    themeRow({ topic: '別のトピック' }),
  ])), /topic_id が重複/)
})

test('rejects non-active rows, malformed JSON, and unsafe/private markers', () => {
  assert.throws(() => parseThemeTopicCsv(csvFor([themeRow({ state: 'draft' })])), /state は active/)
  assert.throws(() => parseThemeTopicCsv(`${HEADER}\n${csvCell('theme-topic-csv.v1')},${csvCell('snap')},${csvCell('hash')},${csvCell('theme-001')},${csvCell('1')},${csvCell('topic')},${csvCell('value')},${csvCell('fit')},${csvCell('safe')},${csvCell('{bad-json')},${csvCell('trend')},${csvCell('sum')},${csvCell('["blog"]')},${csvCell('[]')},${csvCell('[]')},${csvCell('active')},${csvCell('2026-07-14')},${csvCell('2026-07-14')},${csvCell('2026-07-14')},${csvCell('v1')}\n`), /JSONが不正/)
  assert.throws(() => parseThemeTopicCsv(csvFor([themeRow({ safe_angle: 'private patient notes' })])), /安全でない/)
})

test('uses conservative risk and deterministic category fallback', () => {
  const [routine] = parseThemeTopicCsv(csvFor([themeRow({ topic: '歯科受診の準備', patient_value: '受診前の確認点' })]))
  const [highRisk] = parseThemeTopicCsv(csvFor([themeRow({ topic: '親知らずの抜歯', avoid_claims: ['必ず抜けると断定しない'] })]))
  const [other] = parseThemeTopicCsv(csvFor([themeRow({ topic: '歯科の相談', patient_value: '通院の流れ', safe_angle: '一般的な案内' })]))

  assert.equal(buildBlogTopicRow(routine, { publishDate: '2026-08-01' }).category, 'その他')
  assert.equal(buildBlogTopicRow(routine, { publishDate: '2026-08-01' }).medical_risk, 'medium')
  assert.equal(buildBlogTopicRow(highRisk, { publishDate: '2026-08-01' }).category, '親知らず')
  assert.equal(buildBlogTopicRow(highRisk, { publishDate: '2026-08-01' }).medical_risk, 'high')
  assert.equal(buildBlogTopicRow(other, { publishDate: '2026-08-01' }).medical_risk, 'medium')
  assert.notEqual(buildBlogTopicRow(other, { publishDate: '2026-08-01' }).medical_risk, 'low')
})

test('requires an explicit valid publish date', () => {
  const [row] = parseThemeTopicCsv(csvFor([themeRow()]))
  assert.throws(() => buildBlogTopicRow(row), /publishDate/)
  assert.throws(() => buildBlogTopicRow(row, { publishDate: '2026-02-30' }), /publishDate/)
  assert.throws(() => buildBlogTopicRow(row, { publishDate: '=2026-08-01' }), /publishDate/)
})

test('scans only temp post fixtures for existing source topic IDs', () => {
  const postsDir = join(mkdtempSync(join(tmpdir(), 'theme-topic-csv-')), 'posts')
  mkdirSync(postsDir, { recursive: true })
  writeFileSync(join(postsDir, 'existing.md'), `---\ntitle: Existing\nsource_theme_topic_id: topic_0123456789abcdef\n---\n\nbody\n`)
  writeFileSync(join(postsDir, 'unrelated.md'), `---\ntitle: Unrelated\n---\n\nbody\n`)
  writeFileSync(join(postsDir, 'ignore.txt'), 'source_topic_id: theme-ignored')

  assert.deepEqual([...findExistingThemeSourceTopicIds({ postsDir })], ['topic_0123456789abcdef'])
})
