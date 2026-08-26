import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { remark } from 'remark'
import remarkHtml from 'remark-html'

export const CANDIDATE_ONE_SLUG = '2026-08-23-oral-health-prevention'

type PreviewPost = {
  title: string
  date: string
  category: string
  excerpt: string
  tags: string[]
  image?: string
  imageAlt?: string
  contentHtml: string
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []
}

export function isLoopbackPreviewHost(host: string | null): boolean {
  return host !== null && /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)
}

export function isCandidateOneLocalPreviewAllowed({
  host,
  nodeEnv,
}: {
  host: string | null
  nodeEnv: string | undefined
}): boolean {
  return nodeEnv !== 'production' && isLoopbackPreviewHost(host)
}

export async function getCandidateOneLocalPreview(): Promise<PreviewPost> {
  const postPath = path.join(process.cwd(), 'content', 'posts', `${CANDIDATE_ONE_SLUG}.md`)
  const raw = fs.readFileSync(postPath, 'utf8')
  const { data, content } = matter(raw)
  const processed = await remark()
    .use(remarkHtml, { sanitize: true })
    .process(content)

  return {
    title: asText(data.title),
    date: asText(data.date),
    category: asText(data.category),
    excerpt: asText(data.excerpt ?? data.description),
    tags: asTags(data.tags),
    image: asText(data.image) || undefined,
    imageAlt: asText(data.image_alt) || undefined,
    contentHtml: processed.toString(),
  }
}
