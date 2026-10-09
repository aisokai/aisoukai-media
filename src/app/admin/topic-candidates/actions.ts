'use server'

import fs from 'fs'
import path from 'path'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/adminAuth'
import { commitGitHubFiles, readGitHubFile, readGitHubBranchHead } from '@/lib/githubContents'
import {
  getMonthlyTopicCandidates,
  getTopicCandidatePath,
  type TopicCandidateStatus,
  updateMonthlyTopicCandidateStatus,
} from '@/lib/monthlyTopicCandidates'

import { planSelectedTopicAdoptions, planTopicCandidateStatusChange, TOPIC_CSV_COLUMNS } from '@/lib/selectedTopicAdoptions.mjs'

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
async function loadTopicsCsv(ref?: string) {
  if (process.env.GITHUB_REVIEW_TOKEN) {
    return readGitHubFile(TOPICS_PATH, { ref }).then((file) => file.content)
  }

  const localPath = path.join(process.cwd(), TOPICS_PATH)
  if (!fs.existsSync(localPath)) return `${TOPIC_CSV_COLUMNS.join(',')}\n`
  return fs.readFileSync(localPath, 'utf8')
}

async function loadCandidateFile(month: string, ref?: string) {
  const filePath = getTopicCandidatePath(month)
  if (!process.env.GITHUB_REVIEW_TOKEN) {
    const local = await getMonthlyTopicCandidates(month)
    if (!local) throw new Error(`${filePath} が見つかりません`)
    return { file: local, raw: JSON.stringify(local, null, 2), filePath }
  }

  const githubFile = await readGitHubFile(filePath, { ref })
  return { file: JSON.parse(githubFile.content), raw: githubFile.content, filePath }
}


function localAdoptionPath(adoptionPath: string) {
  if (!/^data\/topic-adoptions\/[A-Za-z0-9_-]+\.json$/.test(adoptionPath)) throw new Error('採用記録のパスが不正です')
  return path.join(process.cwd(), 'data', 'topic-adoptions', adoptionPath.slice('data/topic-adoptions/'.length))
}

async function loadAdoption(adoptionPath: string, ref?: string) {
  if (!process.env.GITHUB_REVIEW_TOKEN) {
    const localPath = localAdoptionPath(adoptionPath)
    if (!fs.existsSync(localPath)) return null
    return JSON.parse(fs.readFileSync(localPath, 'utf8'))
  }
  try {
    return JSON.parse((await readGitHubFile(adoptionPath, { ref })).content)
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') return null
    throw new Error('採用記録を取得できません。再度確認してください')
  }
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

    // Candidate status, generation eligibility and the signed adoption must
    // become visible together. Do not report a local-only selection as saved.
    if (!process.env.GITHUB_REVIEW_TOKEN) throw new Error('採用の保存先が未設定です。管理者に確認してください')
    const expectedHeadSha = await readGitHubBranchHead()
    const { file, filePath } = await loadCandidateFile(month, expectedHeadSha)
    if (file.month !== month) throw new Error('候補一覧の月が一致しません')
    const nextFile = updateMonthlyTopicCandidateStatus(file, id, status, reviewerNote)
    const nextContent = `${JSON.stringify(nextFile, null, 2)}\n`
    const currentCsv = await loadTopicsCsv(expectedHeadSha)
    const { nextCsv, adoptions } = await planTopicCandidateStatusChange(nextFile, id, currentCsv, {
      loadAdoption: (adoptionPath: string) => loadAdoption(adoptionPath, expectedHeadSha),
    })
    const files = [
      ...(JSON.stringify(nextFile) !== JSON.stringify(file) ? [{ path: filePath, content: nextContent }] : []),
      ...(nextCsv !== currentCsv ? [{ path: TOPICS_PATH, content: nextCsv }] : []),
      ...adoptions,
    ]
    if (!files.length) return { ok: true, message: status === 'selected' ? '採用済みです。予定日以降の定期処理で記事生成の対象になります' : '変更はありません' }
    const commit = await commitGitHubFiles(`update topic candidate: ${id} ${status}`, files, { expectedHeadSha })

    revalidatePath('/admin/topic-candidates')
    return { ok: true, message: `${status === 'selected' ? '採用しました。予定日以降の定期処理で記事生成の対象になります' : '保存しました。この候補は新規記事生成の対象から外れます'}。GitHub commit: ${commit.sha.slice(0, 7)}` }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}

export async function finalizeSelectedTopicCandidatesAction(month: string): Promise<TopicCandidateActionResult> {
  try {
    await requireAdmin()

    const expectedHeadSha = process.env.GITHUB_REVIEW_TOKEN ? await readGitHubBranchHead() : undefined
    const { file } = await loadCandidateFile(month, expectedHeadSha)
    if (file.month !== month) throw new Error('候補一覧の月が一致しません')
    const currentCsv = await loadTopicsCsv(expectedHeadSha)
    const { selectedCount, lines, adoptions } = await planSelectedTopicAdoptions(file, currentCsv, {
      loadAdoption: (adoptionPath: string) => loadAdoption(adoptionPath, expectedHeadSha),
    })

    if (lines.length === 0 && adoptions.length === 0) {
      return { ok: true, message: `選択済み ${selectedCount} 件の採用記録を確認しました。変更はありません` }
    }

    let nextCsv = currentCsv
    if (nextCsv && !nextCsv.endsWith('\n')) nextCsv += '\n'
    if (lines.length) nextCsv += `${lines.join('\n')}\n`

    if (!process.env.GITHUB_REVIEW_TOKEN) {
      if (lines.length) fs.writeFileSync(path.join(process.cwd(), TOPICS_PATH), nextCsv, 'utf8')
      fs.mkdirSync(path.join(process.cwd(), 'data/topic-adoptions'), { recursive: true })
      for (const adoption of adoptions) fs.writeFileSync(localAdoptionPath(adoption.path), adoption.content, 'utf8')
      revalidatePath('/admin/topic-candidates')
      return { ok: true, message: `確定しました。CSV追加 ${lines.length} 件、採用記録の作成・更新 ${adoptions.length} 件` }
    }

    const commit = await commitGitHubFiles(`finalize topic candidates: ${month}`, [
      ...(lines.length ? [{ path: TOPICS_PATH, content: nextCsv }] : []), ...adoptions,
    ], { expectedHeadSha })

    revalidatePath('/admin/topic-candidates')
    return { ok: true, message: `確定しました。CSV追加 ${lines.length} 件、採用記録の作成・更新 ${adoptions.length} 件。GitHub commit: ${commit.sha.slice(0, 7)}` }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}
