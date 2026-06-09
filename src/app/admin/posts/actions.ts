'use server'

import matter from 'gray-matter'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/adminAuth'
import { commitGitHubFiles, readGitHubFile } from '@/lib/githubContents'

export type AdminPostActionResult = {
  ok: boolean
  message: string
}

const LOG_PATH = 'logs/admin-post-history.md'

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('GITHUB_REVIEW_TOKEN')) return 'GITHUB_REVIEW_TOKEN が未設定です'
  if (message.includes('Unauthorized')) return 'ログインが必要です'
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
}

function validateSlug(slug: string) {
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(slug)) throw new Error('slug の形式が不正です')
}

function jstTimestamp() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00')
}

function normalizeMatterDates(data: Record<string, unknown>) {
  const next = { ...data }
  for (const [key, value] of Object.entries(next)) {
    if (value instanceof Date) next[key] = value.toISOString().slice(0, 10)
  }
  return next
}

function appendLog(raw: string, action: string, slug: string, reason = '') {
  const now = jstTimestamp()
  const lines = [
    `## ${now}`,
    `datetime: ${now}`,
    `action: ${action}`,
    `slug: ${slug}`,
  ]
  if (reason) lines.push(`reason: ${reason}`)
  return `${raw}${raw && !raw.endsWith('\n') ? '\n' : ''}${lines.join('\n')}\n\n`
}

async function loadAdminLog() {
  if (process.env.GITHUB_REVIEW_TOKEN) {
    try {
      return (await readGitHubFile(LOG_PATH)).content
    } catch {
      return ''
    }
  }
  const fs = await import('node:fs')
  const path = await import('node:path')
  const logLocalPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'logs', 'admin-post-history.md')
  return fs.existsSync(logLocalPath) ? fs.readFileSync(logLocalPath, 'utf8') : ''
}

async function readPost(slug: string) {
  const postPath = `content/posts/${slug}.md`
  if (process.env.GITHUB_REVIEW_TOKEN) {
    return { postPath, raw: (await readGitHubFile(postPath)).content }
  }
  const fs = await import('node:fs')
  const path = await import('node:path')
  const localPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'content', 'posts', `${slug}.md`)
  if (!fs.existsSync(localPath)) throw new Error(`記事が見つかりません: ${slug}`)
  return { postPath, raw: fs.readFileSync(localPath, 'utf8') }
}

async function writeFiles(message: string, files: Array<{ path: string; content: string | null }>) {
  if (process.env.GITHUB_REVIEW_TOKEN) {
    const commit = await commitGitHubFiles(message, files)
    return `GitHub commit: ${commit.sha.slice(0, 7)}`
  }

  const fs = await import('node:fs')
  const path = await import('node:path')
  for (const file of files) {
    let localPath: string
    if (file.path.startsWith('content/posts/')) {
      localPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'content', 'posts', path.basename(file.path))
    } else if (file.path === LOG_PATH) {
      localPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'logs', 'admin-post-history.md')
    } else {
      throw new Error(`許可されていない書き込み先です: ${file.path}`)
    }

    if (file.content === null) {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath)
    } else {
      fs.mkdirSync(path.dirname(localPath), { recursive: true })
      fs.writeFileSync(localPath, file.content, 'utf8')
    }
  }
  return 'ローカルファイルを更新しました'
}

export async function savePostMarkdownAction(slug: string, rawMarkdown: string): Promise<AdminPostActionResult> {
  try {
    await requireAdmin()
    validateSlug(slug)
    if (!rawMarkdown.trim()) throw new Error('Markdown が空です')

    // gray-matter でパース可能な Markdown だけ保存する。
    matter(rawMarkdown)

    const { postPath } = await readPost(slug)
    const log = appendLog(await loadAdminLog(), 'edit', slug)
    const result = await writeFiles(`edit post: ${slug}`, [
      { path: postPath, content: rawMarkdown.endsWith('\n') ? rawMarkdown : `${rawMarkdown}\n` },
      { path: LOG_PATH, content: log },
    ])

    revalidatePath('/admin/posts')
    revalidatePath(`/admin/posts/${slug}/edit`)
    revalidatePath('/blog')
    revalidatePath(`/blog/${slug}`)
    return { ok: true, message: `保存しました。${result}` }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}

export async function archivePostAction(slug: string, reason: string): Promise<AdminPostActionResult> {
  try {
    await requireAdmin()
    validateSlug(slug)
    const archiveReason = reason.trim()
    if (!archiveReason) throw new Error('アーカイブ理由を入力してください')

    const { postPath, raw } = await readPost(slug)
    const parsed = matter(raw)
    const data = normalizeMatterDates(parsed.data)
    data.archived = true
    data.archive_reason = archiveReason
    data.archived_at = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    const nextPost = matter.stringify(parsed.content, data)
    const log = appendLog(await loadAdminLog(), 'archive', slug, archiveReason)
    const result = await writeFiles(`archive post: ${slug}`, [
      { path: postPath, content: nextPost },
      { path: LOG_PATH, content: log },
    ])

    revalidatePath('/admin/posts')
    revalidatePath('/blog')
    revalidatePath(`/blog/${slug}`)
    return { ok: true, message: `アーカイブしました。${result}` }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}

export async function restorePostAction(slug: string, reason: string): Promise<AdminPostActionResult> {
  try {
    await requireAdmin()
    validateSlug(slug)
    const restoreReason = reason.trim()
    if (!restoreReason) throw new Error('復帰理由を入力してください')

    const { postPath, raw } = await readPost(slug)
    const parsed = matter(raw)
    const data = normalizeMatterDates(parsed.data)
    delete data.archived
    delete data.archive_reason
    delete data.archived_at
    const nextPost = matter.stringify(parsed.content, data)
    const log = appendLog(await loadAdminLog(), 'restore', slug, restoreReason)
    const result = await writeFiles(`restore post: ${slug}`, [
      { path: postPath, content: nextPost },
      { path: LOG_PATH, content: log },
    ])

    revalidatePath('/admin/posts')
    revalidatePath('/blog')
    revalidatePath(`/blog/${slug}`)
    return { ok: true, message: `復帰しました。${result}` }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}

export async function deletePostAction(slug: string, confirmation: string): Promise<AdminPostActionResult> {
  try {
    await requireAdmin()
    validateSlug(slug)
    if (confirmation.trim() !== slug) throw new Error('削除確認として slug を正確に入力してください')

    const { postPath } = await readPost(slug)
    const log = appendLog(await loadAdminLog(), 'delete', slug, 'physical delete from admin posts')
    const result = await writeFiles(`delete post: ${slug}`, [
      { path: postPath, content: null },
      { path: LOG_PATH, content: log },
    ])

    revalidatePath('/admin/posts')
    revalidatePath('/blog')
    revalidatePath(`/blog/${slug}`)
    return { ok: true, message: `削除しました。${result}` }
  } catch (error) {
    return { ok: false, message: sanitizeError(error) }
  }
}
