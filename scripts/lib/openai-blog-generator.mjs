import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import OpenAI from 'openai'

export const OPENAI_MODEL = 'gpt-5-nano'
export const BLOG_GENERATION_MAX_TOKENS = 4000

export class BlogGenerationError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// Keep the repo-local runtime bootstrap shared by every AI-backed draft path.
export function loadRepoEnv(root) {
  const envPath = join(root, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (match) process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '')
  }
}

export function createOpenAIClient({ clientConstructor = OpenAI } = {}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !apiKey.trim()) throw new BlogGenerationError('configuration_missing')
  return new clientConstructor({ apiKey, maxRetries: 0 })
}

export async function generateBlogArticleText({ prompt, client, maxTokens = BLOG_GENERATION_MAX_TOKENS } = {}) {
  const activeClient = client ?? createOpenAIClient()
  const response = await activeClient.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: maxTokens,
    reasoning_effort: 'minimal',
    messages: [{ role: 'user', content: prompt }],
  })
  const body = response.choices?.[0]?.message?.content?.trim() ?? ''
  if (!body) throw new BlogGenerationError('response_invalid')
  return { body, response }
}
