#!/usr/bin/env node
// SNS repurpose generator。
// ブログ記事 Markdown から SNS 下書き (instagram / x / line) を生成し、
// 既存の content/sns-drafts/ 規約 (scripts/lib/sns-drafts.mjs) に従って保存する。
// publish_mode は manual_only のみ。外部投稿は一切しない。
//
// 使い方:
//   node scripts/generate-sns-from-post.mjs --post <slug または ファイル名> [--platforms instagram,x,line] [--dry-run]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { SNS_DRAFTS_DIR, validateSnsDraftData } from './lib/sns-drafts.mjs'
import {
  ROOT, createJob, detectMedicalAdWarnings, getTodayJst, saveJob, transitionJob,
} from './lib/media-queue.mjs'

const POSTS_DIR = join(ROOT, 'content', 'posts')

// 横展開先 platform (既存sns-drafts enumのサブセット)。
// GMBへの横展開は generate-gmb-draft.mjs --type blog_summary を使う。
export const REPURPOSE_PLATFORMS = Object.freeze(['instagram', 'x', 'line'])

// platform → media queue channel の固定対応表
export const PLATFORM_TO_CHANNEL = Object.freeze({
  instagram: 'instagram',
  x: 'x',
  line: 'line_official',
})

const X_LIMIT = 280

export function buildSnsDraftBody({ platform, title, excerpt, tags }) {
  const hashtags = (tags ?? []).slice(0, 5).map((t) => `#${String(t).replace(/\s+/g, '')}`).join(' ')
  if (platform === 'instagram') {
    return `## キャプション\n\n${title}\n\n${excerpt}\n\n詳しくはブログをご覧ください（プロフィールのリンクから）。\n\n${hashtags}\n`
  }
  if (platform === 'x') {
    let text = `${title}\n\nブログで詳しく解説しています。`
    if (text.length > X_LIMIT - 30) text = `${title.slice(0, X_LIMIT - 60)}…\n\nブログで詳しく解説しています。`
    return `## 本文\n\n${text}\n（記事URLは投稿時に添付）\n`
  }
  return `## メッセージ\n\n${title}\n\n${excerpt}\n\nブログに詳しい記事を掲載しました。ぜひご覧ください。\n`
}

export function buildSnsDrafts({ postFile, postData, platforms = REPURPOSE_PLATFORMS, date = getTodayJst() }) {
  const title = String(postData.title ?? '')
  const excerpt = String(postData.excerpt ?? '')
  const slugBase = postFile.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')
  const drafts = []
  for (const platform of platforms) {
    if (!REPURPOSE_PLATFORMS.includes(platform)) {
      throw new Error(`platform が固定enum外です: "${platform}"`)
    }
    const filename = `${date}-${platform}-${slugBase}.md`
    const data = {
      channel: platform,
      platform,
      title,
      date,
      status: 'pending_review',
      reviewed: false,
      approved_for_manual_post: false,
      ai_generated: true,
      medical_risk: postData.medical_risk ?? 'low',
      source_topic_id: String(postData.source_topic_id ?? slugBase),
      source_post: postFile,
      publish_mode: 'manual_only',
    }
    const content = buildSnsDraftBody({ platform, title, excerpt, tags: postData.tags })
    drafts.push({ filename, data, content })
  }
  return drafts
}

export function generateSnsFromPost({ postArg, platforms = REPURPOSE_PLATFORMS, dryRun = false }) {
  const postFile = postArg.endsWith('.md') ? postArg : `${postArg}.md`
  const postPath = join(POSTS_DIR, postFile)
  if (!existsSync(postPath)) throw new Error(`記事が見つかりません: ${postFile}`)

  const { data: postData } = matter(readFileSync(postPath, 'utf8'))
  const drafts = buildSnsDrafts({ postFile, postData, platforms })

  const warnings = []
  for (const draft of drafts) {
    const result = validateSnsDraftData(draft.filename, draft.data, draft.content)
    if (result.errors.length > 0) {
      throw new Error(`生成ドラフトが既存SNS規約に違反: ${draft.filename}: ${result.errors.join(' / ')}`)
    }
    warnings.push(...detectMedicalAdWarnings(draft.content).map((w) => `${draft.filename}: ${w}`))
  }

  let job = createJob({
    type: 'sns_repurpose',
    source: 'blog',
    sourceText: `repurpose: ${postFile}`,
    targetChannels: platforms.map((p) => PLATFORM_TO_CHANNEL[p]),
    riskLevel: postData.medical_risk === 'high' ? 'high' : 'low',
  })
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'review_pending')

  if (!dryRun) {
    mkdirSync(SNS_DRAFTS_DIR, { recursive: true })
    const outputPaths = []
    for (const draft of drafts) {
      const path = join(SNS_DRAFTS_DIR, draft.filename)
      const frontmatter = { ...draft.data, media_job_id: job.id }
      writeFileSync(path, matter.stringify(draft.content, frontmatter))
      outputPaths.push(relative(ROOT, path))
    }
    job = { ...job, output_paths: outputPaths }
    saveJob(job)
  }

  return { job, drafts, warnings }
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

function main() {
  const postArg = getArg('post')
  if (!postArg) {
    console.error('使い方: node scripts/generate-sns-from-post.mjs --post <slug> [--platforms instagram,x,line] [--dry-run]')
    process.exit(1)
  }
  const platforms = getArg('platforms')?.split(',') ?? [...REPURPOSE_PLATFORMS]
  const dryRun = process.argv.includes('--dry-run')
  try {
    const { job, drafts, warnings } = generateSnsFromPost({ postArg, platforms, dryRun })
    console.log(`✅ SNS下書きを生成しました (${drafts.length} 件 / ${dryRun ? 'dry-run・保存なし' : '保存済み'})`)
    console.log(`   job: ${job.id} [${job.status}] gate=${job.gate_policy}`)
    for (const draft of drafts) console.log(`   - ${draft.filename}`)
    for (const warning of warnings) console.warn(`   ⚠ ${warning}`)
    console.log('   投稿はHumanが手動で行います (publish_mode: manual_only)。')
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
