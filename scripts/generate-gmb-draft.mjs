#!/usr/bin/env node
// GMB Post Draft Generator。
// GMB投稿用の下書きを content/gmb-drafts/ に JSON + Markdown で保存する。
// GMB APIは呼ばない。投稿IDは発行しない。external_result は常に null。
//
// 使い方:
//   node scripts/generate-gmb-draft.mjs --type update --input "お知らせ本文の元ネタ"
//   node scripts/generate-gmb-draft.mjs --type blog_summary --post <slug>

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import {
  ROOT, createJob, detectMedicalAdWarnings, getJstTimestamp, redactSecrets, saveJob, transitionJob,
} from './lib/media-queue.mjs'

export const GMB_DRAFTS_DIR = join(ROOT, 'content', 'gmb-drafts')
const POSTS_DIR = join(ROOT, 'content', 'posts')
// TODO: 本番公開時に実ドメインへ差し替える (先生確認のうえ変更)
const SITE_URL = 'https://aisoukai-media.example'
const GMB_LIMIT = 1500

// GMB投稿タイプ (固定enum) → media queue job type の固定対応表
export const GMB_POST_TYPES = Object.freeze({
  update: 'gmb_update',
  emergency_notice: 'gmb_emergency_notice',
  schedule_change: 'gmb_emergency_notice',
  campaign: 'gmb_campaign',
  blog_summary: 'gmb_update',
  oral_care_tip: 'gmb_update',
})

const TEMPLATES = Object.freeze({
  update: (body) => `【お知らせ】${body}\n\n今後とも医療法人藍想会をよろしくお願いいたします。`,
  emergency_notice: (body) => `【お知らせ】${body}とさせていただきます。ご迷惑をおかけいたしますが、ご理解のほどお願い申し上げます。詳細はお電話にてお問い合わせください。`,
  schedule_change: (body) => `【診療時間変更のお知らせ】${body}。お間違えのないようご来院ください。詳細はお電話にてお問い合わせください。`,
  campaign: (body) => `【ご案内】${body}\n\n詳しくは受付またはお電話にてお気軽にお問い合わせください。`,
  blog_summary: (body, { title, url }) => `【ブログ更新】${title}\n\n${body}\n\n続きはこちら: ${url}`,
  oral_care_tip: (body) => `【お口の健康メモ】${body}\n\n気になる症状がある場合は、お早めにご相談ください。`,
})

export function buildGmbDraft({ postType, inputText, postFile = null }) {
  if (!(postType in GMB_POST_TYPES)) {
    throw new Error(`post_type が固定enum外です: "${postType}"`)
  }

  // 入力経由の秘密値混入を遮断 (JSON / Markdown の全保存経路がこの値を使う)
  let body = redactSecrets(String(inputText ?? '').trim())
  let title = null
  let ctaUrl = null

  if (postType === 'blog_summary') {
    if (!postFile) throw new Error('blog_summary には --post <slug> が必要です')
    const path = join(POSTS_DIR, postFile.endsWith('.md') ? postFile : `${postFile}.md`)
    if (!existsSync(path)) throw new Error(`記事が見つかりません: ${postFile}`)
    const { data } = matter(readFileSync(path, 'utf8'))
    title = redactSecrets(String(data.title ?? ''))
    body = redactSecrets(String(data.excerpt ?? ''))
    ctaUrl = `${SITE_URL}/blog/${postFile.replace(/\.md$/, '')}`
  }
  if (!body) throw new Error('--input (または記事のexcerpt) が空です')

  const draftText = redactSecrets(postType === 'blog_summary'
    ? TEMPLATES.blog_summary(body, { title, url: ctaUrl })
    : TEMPLATES[postType](body))

  const warnings = detectMedicalAdWarnings(draftText)
  if (draftText.length > GMB_LIMIT) warnings.push(`文字数上限 (${GMB_LIMIT}) を超えています`)

  return { draftText, ctaUrl, warnings }
}

export function generateGmbDraft({ postType, inputText, postFile = null, dryRun = false }) {
  const { draftText, ctaUrl, warnings } = buildGmbDraft({ postType, inputText, postFile })
  const jobType = GMB_POST_TYPES[postType]

  let job = createJob({
    type: jobType,
    source: postFile ? 'blog' : 'manual',
    sourceText: inputText ?? `blog_summary: ${postFile}`,
    targetChannels: ['gmb'],
    riskLevel: postType === 'campaign' ? 'medium' : 'low',
  })
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'review_pending')

  const draft = {
    id: job.id,
    job_id: job.id,
    post_type: postType,
    draft_text: draftText,
    cta_url: ctaUrl,
    source_post: postFile,
    warnings,
    gate_policy: job.gate_policy,
    external_result: null,
    created_at: getJstTimestamp(),
  }

  if (!dryRun) {
    mkdirSync(GMB_DRAFTS_DIR, { recursive: true })
    const jsonPath = join(GMB_DRAFTS_DIR, `${job.id}.json`)
    const mdPath = join(GMB_DRAFTS_DIR, `${job.id}.md`)
    writeFileSync(jsonPath, `${JSON.stringify(draft, null, 2)}\n`)
    writeFileSync(mdPath, `# GMB投稿下書き (${postType})\n\n${draftText}\n`)
    job = { ...job, output_paths: [relative(ROOT, jsonPath), relative(ROOT, mdPath)] }
    saveJob(job)
  }

  return { job, draft }
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

function main() {
  const postType = getArg('type')
  const inputText = getArg('input')
  const postFile = getArg('post')
  const dryRun = process.argv.includes('--dry-run')
  if (!postType || (!inputText && !postFile)) {
    console.error('使い方: node scripts/generate-gmb-draft.mjs --type <update|emergency_notice|schedule_change|campaign|blog_summary|oral_care_tip> (--input "本文" | --post <slug>) [--dry-run]')
    process.exit(1)
  }
  try {
    const { job, draft } = generateGmbDraft({ postType, inputText, postFile, dryRun })
    console.log(`✅ GMB投稿下書きを生成しました (${dryRun ? 'dry-run・保存なし' : '保存済み'})`)
    console.log(`   job: ${job.id} [${job.status}] gate=${job.gate_policy}`)
    for (const warning of draft.warnings) console.warn(`   ⚠ ${warning}`)
    console.log('   GMB APIは呼びません。投稿はHuman Gateです。')
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
