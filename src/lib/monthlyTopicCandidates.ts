import fs from 'fs'
import path from 'path'
import { readGitHubFile } from './githubContents'

export type TopicCandidateStatus = 'pending' | 'selected' | 'backup' | 'hold' | 'rejected'
export type RiskLevel = 'low' | 'medium' | 'high'
export type PriorityLevel = 'low' | 'medium' | 'high'

export type MonthlyTopicCandidate = {
  id: string
  title: string
  category: string
  targetReader: string
  searchIntent: string
  patientConcern: string
  recommendedReason: string
  targetKeyword: string
  sourceType: 'trend' | 'news' | 'seasonal' | 'clinic' | 'seo' | 'patient_question'
  sourceUrl?: string
  medicalRisk: RiskLevel
  duplicateRisk: RiskLevel
  priority: PriorityLevel
  recommendedPublishDate: string
  status: TopicCandidateStatus
  reviewerNote?: string
}

export type MonthlyTopicCandidateFile = {
  month: string
  generatedAt: string
  targetPostCount: number
  candidateCount: number
  cadence: 'MWF'
  notes: string
  topics: MonthlyTopicCandidate[]
}

export type TopicCandidateSummary = {
  month: string
  targetPostCount: number
  candidateCount: number
  selectedCount: number
  backupCount: number
  holdCount: number
  rejectedCount: number
  pendingCount: number
  highRiskCount: number
  duplicateWarningCount: number
}

const CANDIDATE_DIR = path.join(process.cwd(), 'data', 'monthly-topic-candidates')

export function getTopicCandidatePath(month: string) {
  validateMonth(month)
  return `data/monthly-topic-candidates/${month}.json`
}

export function getDefaultTopicCandidateMonth(today = new Date()) {
  const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
  return next.toISOString().slice(0, 7)
}

export function validateMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month は YYYY-MM で指定してください')
}

export function buildTopicCandidateSummary(file: MonthlyTopicCandidateFile): TopicCandidateSummary {
  const count = (status: TopicCandidateStatus) => file.topics.filter((topic) => topic.status === status).length
  return {
    month: file.month,
    targetPostCount: file.targetPostCount,
    candidateCount: file.topics.length,
    selectedCount: count('selected'),
    backupCount: count('backup'),
    holdCount: count('hold'),
    rejectedCount: count('rejected'),
    pendingCount: count('pending'),
    highRiskCount: file.topics.filter((topic) => topic.medicalRisk === 'high').length,
    duplicateWarningCount: file.topics.filter((topic) => topic.duplicateRisk !== 'low').length,
  }
}

export async function getMonthlyTopicCandidates(month: string): Promise<MonthlyTopicCandidateFile | null> {
  validateMonth(month)
  const localPath = path.join(CANDIDATE_DIR, `${month}.json`)
  if (!fs.existsSync(localPath)) return null
  return JSON.parse(fs.readFileSync(localPath, 'utf8')) as MonthlyTopicCandidateFile
}

export async function getMonthlyTopicCandidatesForAdmin(month: string): Promise<MonthlyTopicCandidateFile | null> {
  validateMonth(month)
  if (!process.env.GITHUB_REVIEW_TOKEN) return getMonthlyTopicCandidates(month)

  try {
    const file = await readGitHubFile(getTopicCandidatePath(month))
    return JSON.parse(file.content) as MonthlyTopicCandidateFile
  } catch (error) {
    console.error('GitHub monthly topic candidate read failed; falling back to local file', error)
    return getMonthlyTopicCandidates(month)
  }
}

export function updateMonthlyTopicCandidateStatus(
  file: MonthlyTopicCandidateFile,
  id: string,
  status: TopicCandidateStatus,
  reviewerNote = '',
) {
  const next: MonthlyTopicCandidateFile = {
    ...file,
    topics: file.topics.map((topic) => ({ ...topic })),
  }
  const topic = next.topics.find((item) => item.id === id)
  if (!topic) throw new Error(`ネタ候補が見つかりません: ${id}`)

  if (status === 'selected') {
    const selectedCount = next.topics.filter((item) => item.status === 'selected' && item.id !== id).length
    if (selectedCount >= next.targetPostCount) {
      throw new Error(`今月採用は ${next.targetPostCount} 件までです。追加分は予備にしてください。`)
    }
  }

  topic.status = status
  topic.reviewerNote = reviewerNote.trim() || undefined
  return next
}

export function saveMonthlyTopicCandidatesLocal(file: MonthlyTopicCandidateFile) {
  validateMonth(file.month)
  fs.mkdirSync(CANDIDATE_DIR, { recursive: true })
  fs.writeFileSync(path.join(CANDIDATE_DIR, `${file.month}.json`), `${JSON.stringify(file, null, 2)}\n`, 'utf8')
}
