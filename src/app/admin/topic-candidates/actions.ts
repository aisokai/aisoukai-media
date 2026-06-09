'use server'

import fs from 'fs'
import path from 'path'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/adminAuth'
import { commitGitHubFiles, readGitHubFile } from '@/lib/githubContents'
import {
  getMonthlyTopicCandidates,
  getTopicCandidatePath,
  type MonthlyTopicCandidateFile,
  saveMonthlyTopicCandidatesLocal,
  type TopicCandidateStatus,
  updateMonthlyTopicCandidateStatus,
} from '@/lib/monthlyTopicCandidates'

export type TopicCandidateActionResult = {
  ok: boolean
  message: string
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('GITHUB_REVIEW_TOKEN')) return 'GITHUB_REVIEW_TOKEN が未設定です'
  if (message.includes('Unauthorized')) return 'ログインが必要です'
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
}

function validateId(id: string) {
  if (!/^\d{4}-\d{2}-topic-\d{3}$/.test(id)) throw new Error('ネタ候補IDの形式が不正です')
}

function validateStatus(status: string): asserts status is TopicCandidateStatus {
  if (!['pending', 'selected', 'backup', 'hold', 'rejected'].includes(status)) {
    throw new Error('ステータスが不正です')
  }
}

const TOPICS_PATH = 'data/article-topics.sample.csv'
const CSV_COLUMNS = [
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

function csvEscape(value: unknown) {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

function todayJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function firstCsvCell(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return ''
  if (!trimmed.startsWith('"')) return trimmed.split(',')[0]?.trim() ?? ''

  let cell = ''
  for (let i = 1; i < trimmed.length; i += 1) {
    const ch = trimmed[i]
    if (ch === '"') {
      if (trimmed[i + 1] === '"') {
        cell += '"'
        i += 1
      } else {
        break
      }
    } else {
      cell += ch
    }
  }
  return cell.trim()
}

function getExistingTopicIds(csv: string) {
  return new Set(
    csv
      .split(/\r?\n/)
      .slice(1)
      .map(firstCsvCell)
      .filter(Boolean),
  )
}

async function loadTopicsCsv() {
  if (process.env.GITHUB_REVIEW_TOKEN) {
    return readGitHubFile(TOPICS_PATH).then((file) => file.content)
  }

  const localPath = path.join(process.cwd(), TOPICS_PATH)
  if (!fs.existsSync(localPath)) return `${CSV_COLUMNS.join(',')}\n`
  return fs.readFileSync(localPath, 'utf8')
}

function buildSelectedTopicCsvLines(file: MonthlyTopicCandidateFile, existingCsv: string) {
  const selected = file.topics.filter((topic) => topic.status === 'selected')
  if (selected.length === 0) throw new Error('今月採用のネタ候補がありません')
  if (selected.length > file.targetPostCount) {
    throw new Error(`今月採用が多すぎます: ${selected.length}/${file.targetPostCount}`)
  }

  const existingIds = getExistingTopicIds(existingCsv)
  const discoveredAt = todayJst()
  const lines: string[] = []

  for (const topic of selected) {
    const id = `MONTHLY-${topic.id.replace(/-/g, '').toUpperCase()}`
    if (existingIds.has(id)) continue

    const row = {
      id,
      discovered_at: discoveredAt,
      source_type: topic.sourceType,
      source_url: topic.sourceUrl ?? '',
      topic: topic.title,
      title_candidate: topic.title,
      category: topic.category,
      target_keyword: topic.targetKeyword,
      patient_intent: topic.searchIntent,
      priority: topic.priority,
      medical_risk: topic.medicalRisk,
      status: 'approved',
      publish_date: topic.recommendedPublishDate,
      notes: `月次ネタ候補 ${file.month} / MWF 月曜・水曜・金曜の週3投稿枠`,
    } satisfies Record<(typeof CSV_COLUMNS)[number], string>

    lines.push(CSV_COLUMNS.map((key) => csvEscape(row[key])).join(','))
  }

  return { selectedCount: selected.length, lines }
}

async function loadCandidateFile(month: string) {
  const filePath = getTopicCandidatePath(month)
  if (!process.env.GITHUB_REVIEW_TOKEN) {
    const local = await getMonthlyTopicCandidates(month)
    if (!local) throw new Error(`${filePath} が見つかりません`)
    return { file: local, raw: JSON.stringify(local, null, 2), filePath }
  }

  const githubFile = await readGitHubFile(filePath)
  return { file: JSON.parse(githubFile.content), raw: githubFile.content, filePath }
}

export async function updateTopicCandidateStatusAction({
  month,
  id,
  status,
  reviewerNote = '',
}: {
  month: string
  id: string
  status: TopicCandidateStatus
  reviewerNote?: string
}): Promise<TopicCandidateActionResult> {
  try {
    await requireAdmin()
    validateId(id)
    validateStatus(status)

    const { file, raw, filePath } = await loadCandidateFile(month)
    const nextFile = updateMonthlyTopicCandidateStatus(file, id, status, reviewerNote)
    const nextContent = `${JSON.stringify(nextFile, null, 2)}\n`

    if (nextContent === raw || nextContent.trim() === raw.trim()) {
      return { ok: true, message: '変更はありません' }
    }

    if (!process.env.GITHUB_REVIEW_TOKEN) {
      saveMonthlyTopicCandidatesLocal(nextFile)
      revalidatePath('/admin/topic-candidates')
      return { ok: true, message: 'ローカルファイルを更新しました' }
    }

    const commit = await commitGitHubFiles(`update topic candidate: ${id} ${status}`, [
      { path: filePath, content: nextContent },
    ])

    revalidatePath('/admin/topic-candidates')
    return { ok: true, message: `更新しました。GitHub commit: ${commit.sha.slice(0, 7)}` }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}

export async function finalizeSelectedTopicCandidatesAction(month: string): Promise<TopicCandidateActionResult> {
  try {
    await requireAdmin()

    const { file } = await loadCandidateFile(month)
    const currentCsv = await loadTopicsCsv()
    const { selectedCount, lines } = buildSelectedTopicCsvLines(file, currentCsv)

    if (lines.length === 0) {
      return { ok: true, message: `選択済み ${selectedCount} 件はすでに記事ネタCSVへ追加済みです` }
    }

    let nextCsv = currentCsv
    if (nextCsv && !nextCsv.endsWith('\n')) nextCsv += '\n'
    nextCsv += `${lines.join('\n')}\n`

    if (!process.env.GITHUB_REVIEW_TOKEN) {
      fs.writeFileSync(path.join(process.cwd(), TOPICS_PATH), nextCsv, 'utf8')
      revalidatePath('/admin/topic-candidates')
      return { ok: true, message: `確定しました。記事ネタCSVへ ${lines.length} 件追加しました` }
    }

    const commit = await commitGitHubFiles(`finalize topic candidates: ${month}`, [
      { path: TOPICS_PATH, content: nextCsv },
    ])

    revalidatePath('/admin/topic-candidates')
    return { ok: true, message: `確定しました。記事ネタCSVへ ${lines.length} 件追加しました。GitHub commit: ${commit.sha.slice(0, 7)}` }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}
