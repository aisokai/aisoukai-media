import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')
const CORE_ROOT = join(homedir(), 'dmp-content-core')
const CORE_EXPORT_SCRIPT = join(CORE_ROOT, 'scripts', 'export-theme-topic-csv.js')
const THEME_BLOG_FLOW_SCRIPT = join(ROOT, 'scripts', 'theme-blog-flow.mjs')
const SAFE_POST_PATH = /^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/

function fail(message) {
  return { ok: false, generated: false, reason: message, reasons: [message] }
}

function parseResultJson(output) {
  const line = String(output ?? '').split(/\r?\n/).findLast((value) => value.startsWith('RESULT_JSON '))
  if (!line) throw new Error('theme blog flow did not return RESULT_JSON')
  return JSON.parse(line.slice('RESULT_JSON '.length))
}

function toScheduledResult(result) {
  if (!result?.generated || !result?.audited || result.audit?.status !== 'PASS') {
    throw new Error('theme blog flow did not produce an audited draft')
  }
  const absoluteDraftPath = resolve(String(result.draft_path ?? ''))
  const relativeDraftPath = relative(ROOT, absoluteDraftPath)
  if (!SAFE_POST_PATH.test(relativeDraftPath) || !absoluteDraftPath.startsWith(`${POSTS_DIR}/`)) {
    throw new Error('theme blog flow returned an unsafe draft path')
  }
  const frontmatter = result.audit?.frontmatter ?? {}
  const slug = relativeDraftPath.replace(/^content\/posts\//, '').replace(/\.md$/, '')
  return {
    ok: true,
    generated: true,
    published: false,
    topicId: String(frontmatter.source_theme_topic_id ?? result.selected?.source_theme_topic_id ?? ''),
    slug,
    path: relativeDraftPath,
    title: String(result.audit?.title ?? result.selected?.title_candidate ?? ''),
    publishAt: String(frontmatter.publish_at ?? result.selected?.publish_date ?? ''),
    image: {
      ok: Boolean(frontmatter.image && frontmatter.image_alt),
      assigned: false,
      image: String(frontmatter.image ?? ''),
      imageAlt: String(frontmatter.image_alt ?? ''),
      imageId: '',
    },
    reasons: ['テーマリサーチのcanonicalネタCSVから選定'],
  }
}

// This only creates a local canonical CSV and a draft. Git, Telegram, approval, and publication remain with ops:mwf.
export function runThemeOpsFallback({
  today,
  runProcess,
  coreExportScript = CORE_EXPORT_SCRIPT,
  themeBlogFlowScript = THEME_BLOG_FLOW_SCRIPT,
} = {}) {
  if (typeof runProcess !== 'function') throw new Error('runProcess is required')

  const exportResult = runProcess(process.execPath, [coreExportScript, '--write'], { cwd: CORE_ROOT })
  if (!exportResult?.ok) return fail('テーマCSVの更新に失敗したため記事生成を停止しました')

  const generationResult = runProcess(process.execPath, [
    themeBlogFlowScript,
    '--generate',
    '--publish-date',
    today,
  ], { cwd: ROOT })
  if (!generationResult?.ok) {
    try {
      const result = parseResultJson(generationResult?.output)
      return fail(result.error || 'テーマCSVからブログ下書きを生成できませんでした')
    } catch {
      return fail('テーマCSVからブログ下書きを生成できませんでした')
    }
  }

  try {
    return toScheduledResult(parseResultJson(generationResult.output))
  } catch (error) {
    return fail(`テーマCSVの生成結果を確認できませんでした: ${error.message}`)
  }
}

export { CORE_EXPORT_SCRIPT, THEME_BLOG_FLOW_SCRIPT, parseResultJson, toScheduledResult }
