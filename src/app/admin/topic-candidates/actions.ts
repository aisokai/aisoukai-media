'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/adminAuth'
import { commitGitHubFiles, readGitHubFile } from '@/lib/githubContents'
import {
  getMonthlyTopicCandidates,
  getTopicCandidatePath,
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
