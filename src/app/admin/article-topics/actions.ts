'use server'

import fs from 'fs'
import path from 'path'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/adminAuth'
import {
  ARTICLE_TOPICS_RELATIVE_PATH,
  articleTopicRowsToCsv,
  parseArticleTopicCsvRows,
} from '@/lib/articleTopics'
import { commitGitHubFiles, readGitHubFile } from '@/lib/githubContents'

export type ArticleTopicActionResult = {
  ok: boolean
  message: string
}

const VALID_STATUSES = new Set(['idea', 'approved', 'drafting', 'reviewed', 'published', 'hold'])
const VALID_PRIORITIES = new Set(['low', 'medium', 'high'])
const VALID_RISKS = new Set(['low', 'medium', 'high'])

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('GITHUB_REVIEW_TOKEN')) return 'GITHUB_REVIEW_TOKEN が未設定です'
  if (message.includes('Unauthorized')) return 'ログインが必要です'
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
}

function validateTopicId(id: string) {
  if (!/^(TOPIC|MONTHLY)-[A-Z0-9-]+$/.test(id)) throw new Error('topic ID の形式が不正です')
}

async function loadCsv() {
  if (process.env.GITHUB_REVIEW_TOKEN) return (await readGitHubFile(ARTICLE_TOPICS_RELATIVE_PATH)).content
  const localPath = path.join(process.cwd(), ARTICLE_TOPICS_RELATIVE_PATH)
  if (!fs.existsSync(localPath)) throw new Error('article-topics CSV が見つかりません')
  return fs.readFileSync(localPath, 'utf8')
}

async function saveCsv(content: string, id: string) {
  if (process.env.GITHUB_REVIEW_TOKEN) {
    const commit = await commitGitHubFiles(`update article topic: ${id}`, [
      { path: ARTICLE_TOPICS_RELATIVE_PATH, content },
    ])
    return `GitHub commit: ${commit.sha.slice(0, 7)}`
  }

  fs.writeFileSync(path.join(process.cwd(), ARTICLE_TOPICS_RELATIVE_PATH), content, 'utf8')
  return 'ローカルCSVを更新しました'
}

export async function updateArticleTopicAction({
  id,
  status,
  titleCandidate,
  category,
  targetKeyword,
  patientIntent,
  priority,
  medicalRisk,
  publishDate,
  notes,
}: {
  id: string
  status: string
  titleCandidate: string
  category: string
  targetKeyword: string
  patientIntent: string
  priority: string
  medicalRisk: string
  publishDate: string
  notes: string
}): Promise<ArticleTopicActionResult> {
  try {
    await requireAdmin()
    validateTopicId(id)
    if (!VALID_STATUSES.has(status)) throw new Error('status が不正です')
    if (!titleCandidate.trim()) throw new Error('title_candidate は必須です')
    if (!category.trim()) throw new Error('category は必須です')
    if (!targetKeyword.trim()) throw new Error('target_keyword は必須です')
    if (!patientIntent.trim()) throw new Error('patient_intent は必須です')
    if (!VALID_PRIORITIES.has(priority)) throw new Error('priority が不正です')
    if (!VALID_RISKS.has(medicalRisk)) throw new Error('medical_risk が不正です')
    if (publishDate && !/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
      throw new Error('publish_date は YYYY-MM-DD で入力してください')
    }

    const rows = parseArticleTopicCsvRows(await loadCsv())
    const headers = rows[0]
    if (!headers) throw new Error('CSV header がありません')

    const col = (name: string) => {
      const index = headers.indexOf(name)
      if (index < 0) throw new Error(`CSV列が見つかりません: ${name}`)
      return index
    }

    const idCol = col('id')
    const topicCol = col('topic')
    const titleCandidateCol = col('title_candidate')
    const categoryCol = col('category')
    const targetKeywordCol = col('target_keyword')
    const patientIntentCol = col('patient_intent')
    const priorityCol = col('priority')
    const medicalRiskCol = col('medical_risk')
    const statusCol = col('status')
    const publishDateCol = col('publish_date')
    const notesCol = col('notes')
    const target = rows.slice(1).find((row) => row[idCol] === id)
    if (!target) throw new Error(`CSV行が見つかりません: ${id}`)

    target[topicCol] = titleCandidate
    target[titleCandidateCol] = titleCandidate
    target[categoryCol] = category
    target[targetKeywordCol] = targetKeyword
    target[patientIntentCol] = patientIntent
    target[priorityCol] = priority
    target[medicalRiskCol] = medicalRisk
    target[statusCol] = status
    target[publishDateCol] = publishDate
    target[notesCol] = notes

    const result = await saveCsv(articleTopicRowsToCsv(rows), id)
    revalidatePath('/admin/article-topics')
    revalidatePath('/admin')
    return { ok: true, message: `保存しました。${result}` }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}
