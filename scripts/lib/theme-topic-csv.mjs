import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'

export const THEME_TOPIC_CSV_COLUMNS = Object.freeze([
  'schema_version',
  'snapshot_id',
  'snapshot_hash',
  'topic_id',
  'row_version',
  'topic',
  'patient_value',
  'clinic_fit',
  'safe_angle',
  'avoid_claims',
  'source_kind',
  'source_summary_hash',
  'recommended_channels',
  'channel_fit_reasons',
  'required_asset_kinds',
  'state',
  'created_at',
  'updated_at',
  'last_audited_at',
  'audit_policy_version',
])

const THEME_TOPIC_SCHEMA = 'theme-topic-csv.v1'
const JSON_ARRAY_COLUMNS = new Set([
  'avoid_claims',
  'recommended_channels',
  'required_asset_kinds',
])
const JSON_OBJECT_COLUMNS = new Set(['channel_fit_reasons'])
const TOPIC_ID_RE = /^topic_[a-f0-9]{16}$/
const HASH_RE = /^[a-f0-9]{64}$/
const REQUIRED_TEXT_COLUMNS = [
  'schema_version',
  'snapshot_id',
  'snapshot_hash',
  'topic_id',
  'row_version',
  'topic',
  'patient_value',
  'clinic_fit',
  'safe_angle',
  'source_kind',
  'source_summary_hash',
  'state',
  'created_at',
  'updated_at',
  'last_audited_at',
  'audit_policy_version',
]
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const FORMULA_RE = /^[=+\-@]/
const UNSAFE_MARKER_RE = /(private|secret|confidential|credential|password|api[\s_-]*(?:key|token)|access[\s_-]*(?:key|token)|authorization|bearer|\.env|個人情報|患者(?:データ|情報)|診療(?:情報|録)|カルテ|認証情報|パスワード|秘密)/iu
const MAX_NOTE_LENGTH = 1800

const CATEGORY_RULES = [
  { category: 'インプラント', keywords: ['インプラント', 'implant'] },
  { category: '親知らず', keywords: ['親知らず', 'wisdom tooth', 'wisdom-tooth'] },
  { category: '小児歯科', keywords: ['小児', '子ども', '子供', '乳歯', '仕上げ磨き', 'pediatric', 'paediatric', 'children'] },
  { category: '根管治療', keywords: ['根管', '神経の治療', '根の治療', 'root canal', 'endodont'] },
  { category: '歯周病治療', keywords: ['歯周病', '歯ぐき', '歯肉', '歯石', '口臭', 'periodont', 'gingiv'] },
  { category: '虫歯治療', keywords: ['虫歯', 'むし歯', 'う蝕', 'caries', 'cavity', 'decay'] },
  { category: '予防歯科', keywords: ['予防', '定期検診', '定期健診', 'クリーニング', 'フッ素', '歯磨き', 'ブラッシング', 'メンテナンス', 'preventive', 'fluoride'] },
]
const HIGH_RISK_KEYWORDS = [
  'インプラント',
  'implant',
  '抜歯',
  '抜く',
  '手術',
  '外科',
  '麻酔',
  '骨造成',
  '再生療法',
  '根管治療',
  '神経の治療',
  '矯正',
  'orthodont',
  'surgery',
]

function fail(message) {
  throw new Error(`theme-topic-csv.v1: ${message}`)
}

function parseStrictCsv(raw) {
  if (typeof raw !== 'string') fail('raw は文字列で指定してください')

  const source = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!source) fail('CSV が空です')

  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  let afterQuote = false
  let fieldStarted = false

  const finishRow = () => {
    row.push(cell.trim())
    if (row.every((value) => value === '')) fail('空行は許可されません')
    rows.push(row)
    row = []
    cell = ''
    afterQuote = false
    fieldStarted = false
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
          afterQuote = true
        }
      } else {
        cell += character
      }
      continue
    }

    if (afterQuote) {
      if (character === ',') {
        row.push(cell.trim())
        cell = ''
        afterQuote = false
        fieldStarted = false
      } else if (character === '\n') {
        finishRow()
      } else if (character !== ' ' && character !== '\t') {
        fail('引用符の後に不正な文字があります')
      }
      continue
    }

    if (character === '"') {
      if (fieldStarted || cell !== '') fail('フィールド途中の引用符は許可されません')
      inQuotes = true
      fieldStarted = true
    } else if (character === ',') {
      row.push(cell.trim())
      cell = ''
      fieldStarted = false
    } else if (character === '\n') {
      finishRow()
    } else {
      cell += character
      fieldStarted = true
    }
  }

  if (inQuotes) fail('閉じられていない引用符があります')
  if (row.length > 0 || cell !== '' || afterQuote) finishRow()
  return rows
}

function assertSafeValue(value, label) {
  const text = String(value ?? '').trim()
  if (FORMULA_RE.test(text)) fail(`${label} に数式注入の恐れがあります`)
  if (UNSAFE_MARKER_RE.test(text)) fail(`${label} に安全でない/private/secret マーカーがあります`)
  if (/\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
    fail(`${label} に制御文字があります`)
  }
}

function parseJsonArray(value, column, lineNumber) {
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    fail(`行 ${lineNumber}: ${column} のJSONが不正です (${error.message})`)
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || item.trim() === '')) {
    fail(`行 ${lineNumber}: ${column} は空要素のない文字列配列で指定してください`)
  }
  const normalized = parsed.map((item) => item.trim())
  normalized.forEach((item, index) => assertSafeValue(item, `行 ${lineNumber}: ${column}[${index}]`))
  return normalized
}

function parseJsonObject(value, column, lineNumber) {
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    fail(`行 ${lineNumber}: ${column} のJSONが不正です (${error.message})`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`行 ${lineNumber}: ${column} はJSONオブジェクトで指定してください`)
  }
  const normalized = {}
  for (const [key, item] of Object.entries(parsed)) {
    if (!key.trim() || typeof item !== 'string' || !item.trim()) {
      fail(`行 ${lineNumber}: ${column} は空でない文字列の値を持つ必要があります`)
    }
    assertSafeValue(key, `行 ${lineNumber}: ${column} key`)
    assertSafeValue(item, `行 ${lineNumber}: ${column}.${key}`)
    normalized[key.trim()] = item.trim()
  }
  return normalized
}

function assertDateTime(value, label) {
  if (!DATE_TIME_RE.test(value)) fail(`${label} の日時形式が不正です`)
  const datePart = value.slice(0, 10)
  const calendarDate = new Date(`${datePart}T00:00:00Z`)
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart) {
    fail(`${label} の日付が不正です`)
  }
  const time = new Date(value.includes('T') ? value : `${value}T00:00:00Z`).getTime()
  if (Number.isNaN(time)) fail(`${label} の日時が不正です`)
}

function normalizeThemeRow(row, lineNumber = '?', { requireSchema = true } = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`行 ${lineNumber}: 行オブジェクトが不正です`)

  const normalized = {}
  for (const column of THEME_TOPIC_CSV_COLUMNS) {
    const value = row[column]
    if (JSON_ARRAY_COLUMNS.has(column)) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
        fail(`行 ${lineNumber}: ${column} は文字列配列で指定してください`)
      }
      normalized[column] = value.map((item) => item.trim())
    } else if (JSON_OBJECT_COLUMNS.has(column)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail(`行 ${lineNumber}: ${column} はオブジェクトで指定してください`)
      }
      normalized[column] = { ...value }
    } else {
      normalized[column] = String(value ?? '').trim()
    }
  }

  if (requireSchema && normalized.schema_version !== THEME_TOPIC_SCHEMA) {
    fail(`行 ${lineNumber}: 未知のschema_versionです`)
  }
  for (const column of REQUIRED_TEXT_COLUMNS) {
    if (!normalized[column]) fail(`行 ${lineNumber}: ${column} が空です`)
    assertSafeValue(normalized[column], `行 ${lineNumber}: ${column}`)
  }
  for (const column of JSON_ARRAY_COLUMNS) {
    normalized[column].forEach((value, index) => assertSafeValue(value, `行 ${lineNumber}: ${column}[${index}]`))
  }
  for (const [key, value] of Object.entries(normalized.channel_fit_reasons)) {
    assertSafeValue(key, `行 ${lineNumber}: channel_fit_reasons key`)
    assertSafeValue(value, `行 ${lineNumber}: channel_fit_reasons.${key}`)
  }
  if (!TOPIC_ID_RE.test(normalized.topic_id)) fail(`行 ${lineNumber}: topic_id の形式が不正です`)
  if (!HASH_RE.test(normalized.snapshot_hash)) fail(`行 ${lineNumber}: snapshot_hash の形式が不正です`)
  if (!HASH_RE.test(normalized.source_summary_hash)) fail(`行 ${lineNumber}: source_summary_hash の形式が不正です`)
  for (const column of ['created_at', 'updated_at', 'last_audited_at']) {
    assertDateTime(normalized[column], `行 ${lineNumber}: ${column}`)
  }
  if (normalized.state !== 'active') fail(`行 ${lineNumber}: state は active でなければなりません`)
  return normalized
}

export function parseThemeTopicCsv(raw) {
  const rows = parseStrictCsv(raw)
  const headers = rows.shift() ?? []
  if (headers.length !== THEME_TOPIC_CSV_COLUMNS.length || headers.some((header, index) => header !== THEME_TOPIC_CSV_COLUMNS[index])) {
    fail('ヘッダーが固定のtheme-topic-csv.v1列と一致しません')
  }
  if (rows.length === 0) return []

  const normalizedRows = []
  const topicIds = new Set()
  let snapshotId = ''
  let snapshotHash = ''

  rows.forEach((cells, index) => {
    const lineNumber = index + 2
    if (cells.length !== THEME_TOPIC_CSV_COLUMNS.length) {
      fail(`行 ${lineNumber}: 列数が固定列と一致しません`)
    }
    const rawRow = Object.fromEntries(THEME_TOPIC_CSV_COLUMNS.map((column, columnIndex) => [column, cells[columnIndex]]))
    for (const [column, value] of Object.entries(rawRow)) assertSafeValue(value, `行 ${lineNumber}: ${column}`)
    for (const column of JSON_ARRAY_COLUMNS) rawRow[column] = parseJsonArray(rawRow[column], column, lineNumber)
    for (const column of JSON_OBJECT_COLUMNS) rawRow[column] = parseJsonObject(rawRow[column], column, lineNumber)

    const normalized = normalizeThemeRow(rawRow, lineNumber)
    if (topicIds.has(normalized.topic_id)) fail(`行 ${lineNumber}: topic_id が重複しています: ${normalized.topic_id}`)
    topicIds.add(normalized.topic_id)
    if (!snapshotId) {
      snapshotId = normalized.snapshot_id
      snapshotHash = normalized.snapshot_hash
    } else if (normalized.snapshot_id !== snapshotId || normalized.snapshot_hash !== snapshotHash) {
      fail(`行 ${lineNumber}: snapshot_id/hash が混在しています`)
    }
    normalizedRows.push(normalized)
  })

  return normalizedRows
}

function asExistingIds(value) {
  if (value === undefined || value === null) return new Set()
  if (typeof value === 'string' || typeof value[Symbol.iterator] !== 'function') {
    fail('existingSourceTopicIds はSetまたは配列で指定してください')
  }
  return new Set([...value].map((item) => String(item).trim()).filter(Boolean))
}

export function selectBlogThemeTopics(rows, { existingSourceTopicIds } = {}) {
  if (!Array.isArray(rows)) fail('rows は配列で指定してください')
  const existingIds = asExistingIds(existingSourceTopicIds)
  const seenIds = new Set()
  return rows.filter((row, index) => {
    const normalized = normalizeThemeRow(row, index + 1)
    if (seenIds.has(normalized.topic_id)) fail(`行 ${index + 1}: topic_id が重複しています: ${normalized.topic_id}`)
    seenIds.add(normalized.topic_id)
    return normalized.state === 'active'
      && normalized.recommended_channels.includes('blog')
      && !existingIds.has(normalized.topic_id)
  })
}

function findCategory(themeRow) {
  const haystack = [themeRow.topic, themeRow.patient_value, themeRow.safe_angle].join(' ').toLocaleLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword.toLocaleLowerCase()))) return rule.category
  }
  return 'その他'
}

function hasHighRiskKeyword(themeRow) {
  const haystack = [themeRow.topic, themeRow.patient_value, themeRow.safe_angle].join(' ').toLocaleLowerCase()
  return HIGH_RISK_KEYWORDS.some((keyword) => haystack.includes(keyword.toLocaleLowerCase()))
}

function limitText(value, limit) {
  const text = String(value ?? '')
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}

function buildBoundedNotes(themeRow) {
  const note = {
    safe_angle: limitText(themeRow.safe_angle, 260),
    avoid_claims: themeRow.avoid_claims.slice(0, 8).map((claim) => limitText(claim, 150)),
    snapshot_id: limitText(themeRow.snapshot_id, 180),
    snapshot_hash: limitText(themeRow.snapshot_hash, 180),
    row_version: limitText(themeRow.row_version, 100),
    source_kind: limitText(themeRow.source_kind, 120),
    source_summary_hash: limitText(themeRow.source_summary_hash, 180),
  }
  const result = `theme-topic:${JSON.stringify(note)}`
  if (result.length > MAX_NOTE_LENGTH) fail(`notes が上限(${MAX_NOTE_LENGTH})を超えています`)
  return result
}

function isValidPublishDate(value) {
  if (typeof value !== 'string' || !DATE_ONLY_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function buildBlogTopicRow(themeRow, { publishDate } = {}) {
  const normalized = normalizeThemeRow(themeRow)
  if (!isValidPublishDate(publishDate)) fail('publishDate は有効なYYYY-MM-DD形式で明示してください')

  return {
    id: normalized.topic_id,
    source_topic_id: normalized.topic_id,
    source_theme_topic_id: normalized.topic_id,
    source_theme_snapshot_id: normalized.snapshot_id,
    source_theme_snapshot_hash: normalized.snapshot_hash,
    source_theme_row_version: normalized.row_version,
    topic: normalized.topic,
    title_candidate: normalized.topic,
    target_keyword: normalized.topic,
    patient_intent: normalized.patient_value,
    category: findCategory(normalized),
    medical_risk: normalized.avoid_claims.length > 0 || hasHighRiskKeyword(normalized) ? 'high' : 'medium',
    status: 'theme_ready',
    priority: 'medium',
    publish_date: publishDate,
    source_url: '',
    notes: buildBoundedNotes(normalized),
    source_snapshot_hash: normalized.snapshot_hash,
    source_row_version: normalized.row_version,
  }
}

export function findExistingThemeSourceTopicIds({ postsDir } = {}) {
  const ids = new Set()
  if (!postsDir || !existsSync(postsDir)) return ids

  for (const entry of readdirSync(postsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const filePath = join(postsDir, entry.name)
    let parsed
    try {
      parsed = matter(readFileSync(filePath, 'utf8'))
    } catch (error) {
      fail(`投稿frontmatterの読み込みに失敗しました: ${entry.name} (${error.message})`)
    }
    for (const field of ['source_topic_id', 'source_theme_topic_id']) {
      const sourceTopicId = String(parsed.data[field] ?? '').trim()
      if (sourceTopicId) ids.add(sourceTopicId)
    }
  }
  return ids
}
