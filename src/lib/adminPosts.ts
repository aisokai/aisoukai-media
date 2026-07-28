import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { readGitHubDirectory, readGitHubFile } from './githubContents'

export type AdminPost = {
  slug: string
  fileName: string
  title: string
  date: string
  publishAt?: string
  category: string
  reviewed: boolean
  draft: boolean
  archived: boolean
  archiveReason?: string
  rejectionReason?: string
  aiGenerated: boolean
  generatedAt?: string
  stockStatus: 'ready' | 'hold' | 'rejected' | 'adopted'
  themeId?: string
  duplicateOf?: string
  excerpt: string
  raw: string
}

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts')

function toDateString(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

function postFromRaw(fileName: string, raw: string): AdminPost {
  const { data } = matter(raw)
  const stockStatus = data.stock_status === 'ready' || data.stock_status === 'hold' || data.stock_status === 'rejected' || data.stock_status === 'adopted'
    ? data.stock_status
    : data.rejection_reason ? 'rejected' : data.reviewed === true ? 'adopted' : 'ready'
  return {
    slug: fileName.replace(/\.md$/, ''),
    fileName,
    title: String(data.title ?? '（タイトル未設定）'),
    date: toDateString(data.date),
    publishAt: data.publish_at ? toDateString(data.publish_at) : undefined,
    category: String(data.category ?? '未分類'),
    reviewed: data.reviewed === true,
    draft: data.draft === true,
    archived: data.archived === true,
    archiveReason: data.archive_reason ? String(data.archive_reason) : undefined,
    rejectionReason: data.rejection_reason ? String(data.rejection_reason) : undefined,
    aiGenerated: data.ai_generated === true,
    generatedAt: data.generated_at ? String(data.generated_at) : undefined,
    stockStatus,
    themeId: data.theme_id ? String(data.theme_id) : data.source_theme_topic_id ? String(data.source_theme_topic_id) : undefined,
    duplicateOf: data.duplicate_of ? String(data.duplicate_of) : undefined,
    excerpt: String(data.excerpt ?? data.description ?? ''),
    raw,
  }
}

function sortPosts(posts: AdminPost[]) {
  return posts.sort((a, b) => {
    const ad = a.publishAt ?? a.date
    const bd = b.publishAt ?? b.date
    return ad < bd ? 1 : ad > bd ? -1 : a.slug < b.slug ? 1 : -1
  })
}

export async function getAdminPosts(): Promise<AdminPost[]> {
  if (!process.env.GITHUB_REVIEW_TOKEN) {
    if (!fs.existsSync(POSTS_DIR)) return []
    const posts = fs
      .readdirSync(POSTS_DIR)
      .filter((file) => file.endsWith('.md'))
      .map((file) => postFromRaw(file, fs.readFileSync(path.join(POSTS_DIR, file), 'utf8')))
    return sortPosts(posts)
  }

  try {
    const entries = await readGitHubDirectory('content/posts')
    const files = entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
    const posts = await Promise.all(
      files.map(async (entry) => {
        const file = await readGitHubFile(`content/posts/${entry.name}`)
        return postFromRaw(entry.name, file.content)
      }),
    )
    return sortPosts(posts)
  } catch (error) {
    console.error('GitHub admin posts read failed; falling back to local files', error)
    if (!fs.existsSync(POSTS_DIR)) return []
    return sortPosts(
      fs
        .readdirSync(POSTS_DIR)
        .filter((file) => file.endsWith('.md'))
        .map((file) => postFromRaw(file, fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'))),
    )
  }
}

export async function getAdminPost(slug: string): Promise<AdminPost | null> {
  const fileName = `${slug}.md`
  if (!process.env.GITHUB_REVIEW_TOKEN) {
    const filePath = path.join(POSTS_DIR, fileName)
    if (!fs.existsSync(filePath)) return null
    return postFromRaw(fileName, fs.readFileSync(filePath, 'utf8'))
  }

  try {
    const file = await readGitHubFile(`content/posts/${fileName}`)
    return postFromRaw(fileName, file.content)
  } catch {
    return null
  }
}
