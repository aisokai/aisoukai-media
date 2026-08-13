import fs from 'fs'
import path from 'path'

export type ArticleTopicStatus = 'idea' | 'approved' | 'drafting' | 'reviewed' | 'published' | 'hold' | string

export type ArticleTopicRow = {
  id: string
  discoveredAt: string
  sourceType: string
  sourceUrl: string
  topic: string
  titleCandidate: string
  category: string
  targetKeyword: string
  patientIntent: string
  priority: string
  medicalRisk: string
  status: ArticleTopicStatus
  publishDate: string
  notes: string
}

export type ArticleTopicSummary = {
  total: number
  approved: number
  idea: number
  highRisk: number
  monthly: number
}

export type ArticleTopicSource = 'github_main' | 'local' | 'local_fallback'
export type ArticleTopicLoadErrorCode = 'github_read_failed' | 'article_topics_unavailable' | 'article_topics_csv_invalid'

export type ParsedArticleTopicCsv = {
  rows: string[][]
  topics: ArticleTopicRow[]
  summary: ArticleTopicSummary
}

export type ArticleTopicLoadResult =
  | { ok: true; source: ArticleTopicSource; errorCode?: 'github_read_failed'; data: ParsedArticleTopicCsv }
  | { ok: false; errorCode: ArticleTopicLoadErrorCode }

export const ARTICLE_TOPICS_RELATIVE_PATH = 'data/article-topics.sample.csv'
export const ARTICLE_TOPIC_COLUMNS = [
  'id',
  'discovered_at',
  'source_type',
  'source_url',
  'topic',
  'title_candidate',
  'category',
  'target_keyword',
  'patient_intent',
  'priority',
  'medical_risk',
  'status',
  'publish_date',
  'notes',
] as const

const TOPICS_PATH = path.join(process.cwd(), ARTICLE_TOPICS_RELATIVE_PATH)

function asLoadError(error: unknown): ArticleTopicLoadErrorCode {
  return error instanceof ArticleTopicCsvError ? 'article_topics_csv_invalid' : 'article_topics_unavailable'
}

export class ArticleTopicCsvError extends Error {}

export function parseArticleTopicCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n') {
      row.push(cell.trim())
      cell = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }

  if (inQuotes) throw new ArticleTopicCsvError('CSV quotation is incomplete')
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function rowsToTopics(rows: string[][]): ArticleTopicRow[] {
  const [headers, ...body] = rows
  if (!headers) throw new ArticleTopicCsvError('CSV header is missing')
  if (headers.length !== ARTICLE_TOPIC_COLUMNS.length || headers.some((header, index) => header !== ARTICLE_TOPIC_COLUMNS[index])) {
    throw new ArticleTopicCsvError('CSV schema does not match article topic columns')
  }
  if (body.some((cells) => cells.length !== headers.length)) throw new ArticleTopicCsvError('CSV row schema does not match header')

  const index = new Map(headers.map((header, i) => [header, i]))
  const read = (cells: string[], key: string) => cells[index.get(key) ?? -1] ?? ''
  return body.map((cells) => ({
    id: read(cells, 'id'),
    discoveredAt: read(cells, 'discovered_at'),
    sourceType: read(cells, 'source_type'),
    sourceUrl: read(cells, 'source_url'),
    topic: read(cells, 'topic'),
    titleCandidate: read(cells, 'title_candidate'),
    category: read(cells, 'category'),
    targetKeyword: read(cells, 'target_keyword'),
    patientIntent: read(cells, 'patient_intent'),
    priority: read(cells, 'priority'),
    medicalRisk: read(cells, 'medical_risk'),
    status: read(cells, 'status'),
    publishDate: read(cells, 'publish_date'),
    notes: read(cells, 'notes'),
  }))
}

export function parseArticleTopicCsv(text: string): ParsedArticleTopicCsv {
  const rows = parseArticleTopicCsvRows(text)
  const topics = rowsToTopics(rows)
  return { rows, topics, summary: buildArticleTopicSummary(topics) }
}

type LoadArticleTopicsOptions = {
  hasGitHubSource?: boolean
  readGitHub?: () => Promise<string>
  readLocal?: () => string
}

export function loadAdminArticleTopics(readGitHub: () => Promise<string>, options: Omit<LoadArticleTopicsOptions, 'readGitHub'> = {}) {
  return loadArticleTopics({ ...options, readGitHub })
}

export async function loadArticleTopics(options: LoadArticleTopicsOptions = {}): Promise<ArticleTopicLoadResult> {
  const hasGitHubSource = options.hasGitHubSource ?? Boolean(process.env.GITHUB_REVIEW_TOKEN)
  const readLocal = options.readLocal ?? (() => fs.readFileSync(TOPICS_PATH, 'utf8'))
  const readGitHub = options.readGitHub ?? (async () => { throw new Error('GitHub article topic reader is unavailable') })

  if (hasGitHubSource) {
    try {
      return { ok: true, source: 'github_main', data: parseArticleTopicCsv(await readGitHub()) }
    } catch {
      try {
        return { ok: true, source: 'local_fallback', errorCode: 'github_read_failed', data: parseArticleTopicCsv(readLocal()) }
      } catch (error) {
        return { ok: false, errorCode: asLoadError(error) }
      }
    }
  }

  try {
    return { ok: true, source: 'local', data: parseArticleTopicCsv(readLocal()) }
  } catch (error) {
    return { ok: false, errorCode: asLoadError(error) }
  }
}

/** Legacy local-only callers. Admin article-topics uses loadArticleTopics instead. */
export function getArticleTopics(): ArticleTopicRow[] {
  try {
    return parseArticleTopicCsv(fs.readFileSync(TOPICS_PATH, 'utf8')).topics
  } catch {
    return []
  }
}

export function csvEscapeArticleTopic(value: unknown) {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

export function articleTopicRowsToCsv(rows: string[][]) {
  return `${rows.map((row) => row.map(csvEscapeArticleTopic).join(',')).join('\n')}\n`
}

export function buildArticleTopicSummary(rows: ArticleTopicRow[]): ArticleTopicSummary {
  return {
    total: rows.length,
    approved: rows.filter((row) => row.status === 'approved').length,
    idea: rows.filter((row) => row.status === 'idea').length,
    highRisk: rows.filter((row) => row.medicalRisk === 'high').length,
    monthly: rows.filter((row) => row.id.startsWith('MONTHLY-')).length,
  }
}
