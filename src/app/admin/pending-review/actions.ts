'use server'

import { revalidatePath } from 'next/cache'
import matter from 'gray-matter'
import { requireAdmin } from '@/lib/adminAuth'
import { commitGitHubFiles, readGitHubBranchHead, readGitHubFile } from '@/lib/githubContents'
import { approvePostMarkdown, rejectPostMarkdown } from '@/lib/reviewActions'
import { assertExpectedContentVersion, getDmpArticleState } from '@/lib/dmpArticleState.mjs'
import { notifyPostApprovedTelegram } from '@/lib/reviewApprovalNotification.mjs'

export type ReviewActionResult = {
  ok: boolean
  message: string
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('GITHUB_REVIEW_TOKEN')) {
    return 'GITHUB_REVIEW_TOKEN が未設定です'
  }
  if (message.includes('ADMIN_REVIEW_COOKIE_SECRET')) {
    return 'ADMIN_REVIEW_COOKIE_SECRET が未設定です'
  }
  if (message.includes('Unauthorized')) {
    return 'ログインが必要です'
  }
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
}

function validateSlug(slug: string) {
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(slug)) {
    throw new Error('slug の形式が不正です')
  }
}

function extractFrontmatterValue(raw: string, key: string) {
  const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return match?.[1]?.trim().replace(/^["']|["']$/g, '')
}

function getTodayJst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function isReviewedPost(raw: string) {
  const { data, content } = matter(raw)
  return (
    data.reviewed === true &&
    Boolean(String(data.reviewed_at ?? '').trim()) &&
    Boolean(String(data.reviewed_by ?? '').trim()) &&
    getDmpArticleState({ data, content, adminDiscoverability: { status: 'confirmed', source: 'admin-review-source', contentVersion: '' } }).approvedExactVersion
  )
}

export async function approvePostAction({
  slug,
  reviewedBy,
  expectedContentVersion,
}: {
  slug: string
  reviewedBy: string
  expectedContentVersion: string
}): Promise<ReviewActionResult> {
  try {
    await requireAdmin()
    validateSlug(slug)
    const by = reviewedBy.trim()
    if (!by) throw new Error('承認者名を入力してください')

    const postPath = `content/posts/${slug}.md`
    const expectedHeadSha = await readGitHubBranchHead()
    const [postFile, reviewLog] = await Promise.all([
      readGitHubFile(postPath, { ref: expectedHeadSha }),
      readGitHubFile('logs/review-history.md', { ref: expectedHeadSha }).then((file) => file.content).catch(() => ''),
    ])

    const current = matter(postFile.content)
    assertExpectedContentVersion({
      data: current.data,
      content: current.content,
      expectedContentVersion,
    })

    if (isReviewedPost(postFile.content)) {
      revalidatePath('/admin/pending-review')
      revalidatePath('/blog')
      revalidatePath(`/blog/${slug}`)
      return {
        ok: true,
        message: 'この記事は既に承認済みです。画面を更新します。',
      }
    }

    const update = approvePostMarkdown(postFile.content, slug, by, expectedContentVersion)
    const commit = await commitGitHubFiles(`approve post: ${slug}`, [
      { path: postPath, content: update.nextPostMarkdown },
      { path: 'logs/review-history.md', content: `${reviewLog}${update.logEntry}` },
    ], { expectedHeadSha })

    revalidatePath('/admin/pending-review')
    revalidatePath('/blog')
    revalidatePath(`/blog/${slug}`)

    const notificationSent = await notifyPostApprovedTelegram({
      title: extractFrontmatterValue(postFile.content, 'title') ?? '（タイトル未設定）',
      slug,
      reviewedBy: by,
      commitSha: commit.sha,
      publishDate:
        extractFrontmatterValue(postFile.content, 'publish_at') ??
        extractFrontmatterValue(postFile.content, 'date'),
      date: extractFrontmatterValue(postFile.content, 'date'),
      today: getTodayJst(),
    })

    const notificationNote = notificationSent ? 'Telegram通知済み。' : 'Telegram通知は未送信です。'

    return {
      ok: true,
      message: `承認しました。GitHub commit: ${commit.sha.slice(0, 7)}。${notificationNote}`,
    }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}

export async function rejectPostAction({
  slug,
  reviewedBy,
  reason,
  expectedContentVersion,
}: {
  slug: string
  reviewedBy: string
  reason: string
  expectedContentVersion: string
}): Promise<ReviewActionResult> {
  try {
    await requireAdmin()
    validateSlug(slug)
    const by = reviewedBy.trim()
    const rejectReason = reason.trim()
    if (!by) throw new Error('承認者名を入力してください')
    if (!rejectReason) throw new Error('却下理由を入力してください')

    const postPath = `content/posts/${slug}.md`
    const expectedHeadSha = await readGitHubBranchHead()
    const [postFile, reviewLog] = await Promise.all([
      readGitHubFile(postPath, { ref: expectedHeadSha }),
      readGitHubFile('logs/review-history.md', { ref: expectedHeadSha }).then((file) => file.content).catch(() => ''),
    ])

    const update = rejectPostMarkdown(postFile.content, slug, by, rejectReason, expectedContentVersion)
    const commit = await commitGitHubFiles(`reject post: ${slug}`, [
      { path: postPath, content: update.nextPostMarkdown },
      { path: 'logs/review-history.md', content: `${reviewLog}${update.logEntry}` },
    ], { expectedHeadSha })

    revalidatePath('/admin/pending-review')

    return {
      ok: true,
      message: `却下しました。GitHub commit: ${commit.sha.slice(0, 7)}`,
    }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}
