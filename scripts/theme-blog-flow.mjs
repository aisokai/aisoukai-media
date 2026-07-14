#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { homedir } from 'node:os'
import {
  auditBlogDraftFile,
} from './lib/theme-blog-audit.mjs'
import {
  buildTelegramApprovalRequest,
  sendTelegramApprovalRequest,
  isExplicitHttpsReviewUrl,
} from './lib/theme-blog-review-request.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(__dirname, '..')
export const DEFAULT_THEME_TOPICS_PATH = join(homedir(), 'dmp-content-core', 'outputs', 'theme-topic-csv', 'theme-topics.csv')
export const DEFAULT_POSTS_DIR = join(ROOT, 'content', 'posts')

const BLOG_TOPIC_COLUMNS = Object.freeze([
  'id', 'discovered_at', 'source_type', 'source_url', 'topic',
  'title_candidate', 'category', 'target_keyword', 'patient_intent',
  'priority', 'medical_risk', 'status', 'publish_date', 'notes',
  'source_theme_topic_id', 'source_theme_snapshot_id',
  'source_theme_snapshot_hash', 'source_theme_row_version',
])

const FIELD_ALIASES = Object.freeze({
  id: ['id', 'topic_id', 'theme_topic_id', 'source_theme_topic_id', 'source_topic_id'],
  title: ['title_candidate', 'title'],
  publishDate: ['publish_date', 'publishDate'],
  sourceThemeTopicId: ['source_theme_topic_id', 'theme_topic_id', 'theme_id', 'source_topic_id', 'topic_id', 'id'],
  sourceThemeSnapshotId: ['source_theme_snapshot_id', 'theme_snapshot_id', 'snapshot_id'],
  sourceThemeSnapshotHash: ['source_theme_snapshot_hash', 'theme_snapshot_hash', 'snapshot_hash'],
  sourceThemeRowVersion: ['source_theme_row_version', 'theme_row_version', 'row_version'],
})

function pick(row, aliases) {
  for (const alias of aliases) {
    const result = String(row?.[alias] ?? '').trim()
    if (result) return result
  }
  return ''
}

function csvEscape(input) {
  return `"${String(input ?? '').replace(/"/g, '""')}"`
}

export function serializeBlogTopicCsv(row, themeTopicCsvApi = {}) {
  const supplied = Array.isArray(themeTopicCsvApi.THEME_TOPIC_CSV_COLUMNS)
    ? themeTopicCsvApi.THEME_TOPIC_CSV_COLUMNS
    : []
  const columns = [...new Set([...supplied, ...BLOG_TOPIC_COLUMNS])]
  const line = columns.map((column) => csvEscape(row[column])).join(',')
  return `${columns.join(',')}\n${line}\n`
}

function normalizeBlogTopicRow(row) {
  const id = pick(row, FIELD_ALIASES.id)
  const sourceThemeTopicId = pick(row, FIELD_ALIASES.sourceThemeTopicId) || id
  return {
    ...row,
    id,
    source_topic_id: sourceThemeTopicId,
    source_theme_topic_id: sourceThemeTopicId,
    source_theme_snapshot_id: pick(row, FIELD_ALIASES.sourceThemeSnapshotId),
    source_theme_snapshot_hash: pick(row, FIELD_ALIASES.sourceThemeSnapshotHash),
    source_theme_row_version: pick(row, FIELD_ALIASES.sourceThemeRowVersion),
  }
}

function lineageFromRow(row) {
  return {
    source_topic_id: pick(row, ['source_topic_id', 'source_theme_topic_id', 'id']),
    source_theme_topic_id: pick(row, ['source_theme_topic_id', 'source_topic_id', 'id']),
    source_theme_snapshot_id: pick(row, ['source_theme_snapshot_id']),
    source_theme_snapshot_hash: pick(row, ['source_theme_snapshot_hash']),
    source_theme_row_version: pick(row, ['source_theme_row_version']),
  }
}

function getTodayJst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
}

function slugify(id) {
  return String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function selectedRow(selection) {
  if (Array.isArray(selection)) return selection[0] ?? null
  if (selection && Array.isArray(selection.rows)) return selection.rows[0] ?? null
  if (selection && selection.selected) return selection.selected
  return selection ?? null
}

async function loadThemeTopicCsvApi() {
  try {
    return await import('./lib/theme-topic-csv.mjs')
  } catch (error) {
    throw new Error(`theme-topic-csv helper is unavailable: ${error.message}`)
  }
}

export function runGenerateDraft({
  topicId,
  topicsPath,
  publishDate,
  postsDir = DEFAULT_POSTS_DIR,
  generateScript = join(__dirname, 'generate-draft.mjs'),
  cwd = ROOT,
  execFileSyncImpl = execFileSync,
} = {}) {
  const args = [generateScript, '--topic-id', topicId, '--topics-path', topicsPath, '--posts-dir', postsDir]
  if (publishDate) args.push('--publish-date', publishDate)
  const output = execFileSyncImpl(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  return { output: String(output ?? '') }
}

export async function runThemeBlogFlow({
  topicsPath = DEFAULT_THEME_TOPICS_PATH,
  postsDir = DEFAULT_POSTS_DIR,
  publishDate,
  generate = false,
  notify = false,
  reviewUrl,
  root = ROOT,
  themeTopicCsv,
  generateDraft = runGenerateDraft,
  sendReviewRequest = sendTelegramApprovalRequest,
  auditDraft = auditBlogDraftFile,
  readFile = readFileSync,
  fileExists = existsSync,
  makeTempDir = () => mkdtempSync(join(tmpdir(), 'aisoukai-theme-blog-')),
  writeTempFile = writeFileSync,
  removeTempDir = (path) => rmSync(path, { recursive: true, force: true }),
  today = getTodayJst(),
  botToken,
  chatId,
  reserveImpl,
  fetchImpl,
} = {}) {
  if (notify && !generate) throw new Error('--notify requires explicit --generate')
  if (notify && !isExplicitHttpsReviewUrl(reviewUrl)) {
    throw new Error('--notify requires an explicit https review URL')
  }

  const api = themeTopicCsv ?? await loadThemeTopicCsvApi()
  const raw = readFile(topicsPath, 'utf8')
  const rows = api.parseThemeTopicCsv(raw)
  const existing = api.findExistingThemeSourceTopicIds({ postsDir })
  const candidates = api.selectBlogThemeTopics(rows, {
    existingSourceTopicIds: existing instanceof Set ? existing : new Set(existing ?? []),
  })
  const themeRow = selectedRow(candidates)
  if (!themeRow) throw new Error('no blog-ready theme topic was selected')
  const immutableThemeTopicId = pick(themeRow, FIELD_ALIASES.sourceThemeTopicId)
  if (!immutableThemeTopicId) throw new Error('selected theme topic has no immutable theme topic id')

  const selectedPublishDate = String(
    publishDate ?? pick(themeRow, FIELD_ALIASES.publishDate) ?? today,
  ).trim() || today
  const builtRow = api.buildBlogTopicRow(themeRow, { publishDate: selectedPublishDate })
  const normalizedRow = normalizeBlogTopicRow({
    ...builtRow,
    id: immutableThemeTopicId,
    source_topic_id: immutableThemeTopicId,
    source_theme_topic_id: immutableThemeTopicId,
  })
  const topicId = normalizedRow.id
  if (!topicId) throw new Error('selected blog topic has no immutable theme topic id')

  const dryRunResult = {
    ok: true,
    mode: 'dry-run',
    selected: normalizedRow,
    temporary_topic_csv: {
      written: false,
      content: serializeBlogTopicCsv(normalizedRow, api),
    },
    generated: false,
    audited: false,
    notified: false,
  }
  if (!generate) return dryRunResult

  let tempDir = null
  try {
    tempDir = makeTempDir()
    const tempTopicsPath = join(tempDir, 'topics.csv')
    writeTempFile(tempTopicsPath, serializeBlogTopicCsv(normalizedRow, api), 'utf8')
    const generation = await generateDraft({
      topicId,
      topicsPath: tempTopicsPath,
      publishDate: selectedPublishDate,
      postsDir,
    })
    const expectedDraftPath = join(postsDir, `${selectedPublishDate}-${slugify(topicId)}.md`)
    const draftPath = generation?.draftPath ?? expectedDraftPath
    if (!fileExists(draftPath)) throw new Error(`generated draft was not found: ${draftPath}`)

    const audit = await auditDraft(draftPath, { expectedLineage: lineageFromRow(normalizedRow) })
    if (!audit?.ok || audit.status !== 'PASS') {
      const details = Array.isArray(audit?.issues) ? audit.issues.join('; ') : 'audit failed'
      throw new Error(`generated draft audit failed: ${details}`)
    }

    let notification = { sent: false, reason: 'not requested' }
    let request = null
    if (notify) {
      request = buildTelegramApprovalRequest({
        title: audit.title || normalizedRow.title_candidate,
        topicId: normalizedRow.source_theme_topic_id,
        snapshotHash: normalizedRow.source_theme_snapshot_hash,
        audit,
        publishDate: selectedPublishDate,
        reviewUrl,
      })
      notification = await sendReviewRequest({
        request,
        root,
        date: selectedPublishDate,
        botToken,
        chatId,
        fetchImpl,
        reserveImpl,
      })
    }

    return {
      ...dryRunResult,
      mode: 'generate',
      temporary_topic_csv: { written: true, removed: true },
      generated: true,
      draft_path: draftPath,
      audit,
      audited: true,
      review_request: request,
      notification,
      notified: notification.sent === true,
    }
  } finally {
    if (tempDir) removeTempDir(tempDir)
  }
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) {
      args._.push(argv[i])
      continue
    }
    const key = argv[i].slice(2).replace(/-/g, '_')
    const next = argv[i + 1]
    args[key] = next && !next.startsWith('--') ? argv[++i] : true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const generate = args.generate === true
  if (generate && args.dry_run === true) throw new Error('--generate and --dry-run cannot be combined')
  const result = await runThemeBlogFlow({
    topicsPath: String(args.topics_path ?? DEFAULT_THEME_TOPICS_PATH),
    postsDir: String(args.posts_dir ?? DEFAULT_POSTS_DIR),
    publishDate: args.publish_date,
    generate,
    notify: args.notify === true,
    reviewUrl: args.review_url,
  })
  console.log(`RESULT_JSON ${JSON.stringify(result)}`)
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`エラー: ${error.message}`)
    console.log(`RESULT_JSON ${JSON.stringify({ ok: false, error: error.message })}`)
    process.exitCode = 1
  })
}

export { getTodayJst, parseArgs }
export const runBlogFlow = runThemeBlogFlow
