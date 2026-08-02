#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv-parser.mjs'
import { buildArticlePrompt } from './prompts/dental-article-prompt.mjs'
import { pickArticleImage } from './lib/auto-post-image.mjs'
import { findStockDuplicateCandidates } from './lib/stock-duplicate-check.mjs'
import {
  OPENAI_MODEL,
  generateBlogArticleText,
  loadRepoEnv,
} from './lib/openai-blog-generator.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')
const DEFAULT_POSTS_DIR = join(ROOT, 'content', 'posts')

const VALID_CATEGORIES = new Set([
  '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
  '親知らず', 'インプラント', 'その他', 'お知らせ',
])

const FIELD_ALIASES = {
  id:          ['id', 'topic_id'],
  title:       ['title_candidate', 'title'],
  category:    ['category'],
  keyword:     ['target_keyword', 'keyword'],
  intent:      ['patient_intent', 'search_intent'],
  medicalRisk: ['medical_risk'],
  publishDate: ['publish_date'],
  topic:       ['topic'],
  notes:       ['notes'],
  sourceThemeTopicId:    ['source_theme_topic_id', 'theme_topic_id', 'theme_id', 'source_topic_id'],
  sourceThemeSnapshotId: ['source_theme_snapshot_id', 'theme_snapshot_id', 'snapshot_id'],
  sourceThemeSnapshotHash: ['source_theme_snapshot_hash', 'theme_snapshot_hash', 'snapshot_hash'],
  sourceThemeRowVersion: ['source_theme_row_version', 'theme_row_version', 'row_version'],
}

function getField(row, keys) {
  for (const key of keys) {
    const v = String(row[key] ?? '').trim()
    if (v) return v
  }
  return ''
}

function esc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function isValidDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())
}

function slugify(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function buildTags(row) {
  const tags = []
  const push = (v) => {
    const t = String(v ?? '').trim()
    if (t && !tags.includes(t)) tags.push(t)
  }
  push(getField(row, FIELD_ALIASES.category))
  for (const t of getField(row, FIELD_ALIASES.keyword).split(/[\s　,、・]+/)) push(t.trim())
  return tags.slice(0, 4).filter(Boolean)
}

function detectGeneratedDraftQualityIssues(body) {
  const text = String(body ?? '')
  const issues = []
  const checks = [
    { re: /\bbrief\b/i, reason: '本文にプロンプト断片 "brief" が混入しています' },
    { re: /\b(undefined|null|NaN)\b/, reason: '本文に生成崩れを示す値が混入しています' },
    { re: /\[[^\]]*(TODO|要確認|出典|引用|placeholder)[^\]]*\]/i, reason: '本文に未処理プレースホルダーが残っています' },
    { re: /<\s*(title|body|article|section|placeholder)\s*>/i, reason: '本文に未処理タグ風プレースホルダーが残っています' },
    { re: /[A-Za-z]{4,}(?:月|日|年|ヶ|か月|ヶ月)/, reason: '本文に英字断片と日付・期間表現が不自然に連結しています' },
  ]

  for (const check of checks) {
    if (check.re.test(text) && !issues.includes(check.reason)) issues.push(check.reason)
  }

  return issues
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key] = next && !next.startsWith('--') ? argv[++i] : true
    } else {
      args._.push(argv[i])
    }
  }
  return args
}

async function main() {
  loadRepoEnv(ROOT)

  const args = parseArgs(process.argv.slice(2))
  const topicId = String(args.topic_id ?? args._[0] ?? '').trim()
  const force = args.force === true
  const allowDuplicate = args.allow_duplicate === true
  const publish_date_override = String(args.publish_date ?? '').trim()
  const topicsPath = String(args.topics_path ?? TOPICS_PATH).trim() || TOPICS_PATH
  const postsDir = String(args.posts_dir ?? DEFAULT_POSTS_DIR).trim() || DEFAULT_POSTS_DIR

  if (!topicId) {
    console.error('使い方: npm run generate:draft -- TOPIC-20260511-001')
    console.error('補足: --topic-id でも指定できます')
    process.exit(1)
  }

  // API キー確認（値はログに出さない）
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('エラー: OPENAI_API_KEY が未設定です')
    console.error('  .env.local に以下を追加してください:')
    console.error('  OPENAI_API_KEY を設定してください')
    process.exit(1)
  }

  // CSV 読み込み
  let raw
  try {
    raw = readFileSync(topicsPath, 'utf8')
  } catch {
    console.error(`エラー: ${topicsPath} が見つかりません`)
    process.exit(1)
  }

  const rows = parseCsv(raw)

  if (rows.length === 0) {
    console.error('エラー: CSV にデータ行がありません')
    process.exit(1)
  }

  // topic_id で検索（重複チェック込み）
  const matches = rows.filter((r) => getField(r, FIELD_ALIASES.id) === topicId)

  if (matches.length === 0) {
    console.error(`エラー: topic_id が見つかりません: ${topicId}`)
    const candidates = rows.slice(0, 8).map((r) => getField(r, FIELD_ALIASES.id)).join(', ')
    console.error(`候補: ${candidates}`)
    process.exit(1)
  }

  if (matches.length > 1) {
    console.error(`エラー: topic_id が ${matches.length} 件重複しています: ${topicId}`)
    console.error('CSV を確認し、重複行を削除してください')
    process.exit(1)
  }

  const row = matches[0]
  const title       = getField(row, FIELD_ALIASES.title)
  const category    = getField(row, FIELD_ALIASES.category)
  const csvPublishDate = getField(row, FIELD_ALIASES.publishDate)
  const publishDate = publish_date_override || csvPublishDate
  const keyword     = getField(row, FIELD_ALIASES.keyword)
  const intent      = getField(row, FIELD_ALIASES.intent)
  const topic       = getField(row, FIELD_ALIASES.topic)
  const medicalRisk = getField(row, FIELD_ALIASES.medicalRisk)
  const notes       = getField(row, FIELD_ALIASES.notes)
  const sourceThemeTopicId = getField(row, FIELD_ALIASES.sourceThemeTopicId) || topicId
  const sourceThemeSnapshotId = getField(row, FIELD_ALIASES.sourceThemeSnapshotId)
  const sourceThemeSnapshotHash = getField(row, FIELD_ALIASES.sourceThemeSnapshotHash)
  const sourceThemeRowVersion = getField(row, FIELD_ALIASES.sourceThemeRowVersion)

  // 必須フィールド検証
  const missing = []
  if (!title)                          missing.push('title_candidate')
  if (!VALID_CATEGORIES.has(category)) missing.push(`category (値: "${category || '空'}")`)
  if (!isValidDate(csvPublishDate))    missing.push('publish_date')
  if (publish_date_override && !isValidDate(publish_date_override)) missing.push('--publish-date')
  if (!keyword)                        missing.push('target_keyword')
  if (!intent)                         missing.push('patient_intent')

  if (missing.length > 0) {
    console.error(`エラー: 必須フィールドが不足しています — ${missing.join(', ')}`)
    console.error('npm run validate:topics を先に実行してください')
    process.exit(1)
  }

  // 出力ファイルパス確定
  const slug     = slugify(topicId)
  const filename = `${publishDate}-${slug}.md`
  const filePath = join(postsDir, filename)

  // Deterministic duplicate signals are intentionally fail-closed. This does
  // not judge semantic similarity or reject anything; a Human may opt in with
  // --allow-duplicate after checking the named candidates.
  const duplicateCandidates = findStockDuplicateCandidates({
    postsDir,
    topicId,
    title,
    keyword,
    ignoreFilePath: filePath,
  })
  if (duplicateCandidates.length > 0 && !allowDuplicate) {
    console.error('エラー: 既存記事との重複候補を検出したため、生成前に安全停止しました。')
    for (const candidate of duplicateCandidates) {
      console.error(`  - ${candidate.slug} (${candidate.reasons.join(', ')})`)
    }
    console.error('内容を確認し、意図した重複なら Human が --allow-duplicate を明示してください。')
    process.exit(3)
  }

  // 既存ファイルチェック（--force なしは安全停止）
  if (existsSync(filePath)) {
    if (!force) {
      console.error(`エラー: ファイルが既に存在します: content/posts/${filename}`)
      console.error('既存の下書きを削除するか、--force を付けて再実行してください')
      process.exit(1)
    }
    console.warn(`⚠️  Overwriting existing draft because --force was specified: content/posts/${filename}`)
  }

  // 生成前にトピック要約を表示
  console.log('━'.repeat(50))
  console.log('対象トピック')
  console.log('━'.repeat(50))
  console.log(`  ID       : ${topicId}`)
  console.log(`  タイトル : ${title}`)
  console.log(`  カテゴリ : ${category}`)
  console.log(`  キーワード: ${keyword}`)
  console.log(`  公開予定 : ${publishDate}`)
  console.log(`  リスク   : ${medicalRisk}`)
  console.log('━'.repeat(50))
  console.log()
  console.log(`⏳ OpenAI に記事本文を生成中...`)

  // プロンプト生成と API 呼び出し
  const prompt = buildArticlePrompt({ title, category, keyword, intent, medicalRisk, topic })

  const { body, response } = await generateBlogArticleText({ prompt })

  const qualityIssues = detectGeneratedDraftQualityIssues(body)
  if (qualityIssues.length > 0) {
    console.error('エラー: 生成本文の品質チェックに失敗しました。記事は保存しません。')
    for (const issue of qualityIssues) console.error(`  - ${issue}`)
    process.exit(2)
  }

  // frontmatter 組み立て
  const excerpt = category === 'お知らせ'
    ? `${title}についてお知らせします。`
    : `${title}について、原因・受診目安・注意点を整理します。`

  const tags = buildTags(row)
  const tagsYaml = tags.map((t) => `  - "${esc(t)}"`).join('\n')
  let pickedImage
  try {
    pickedImage = pickArticleImage({
      title,
      category,
      excerpt,
      tags,
      sourceTopicId: topicId,
      bodyContent: body,
      filename,
    })
  } catch (e) {
    console.error(`エラー: 記事画像を自動選択できませんでした: ${e.message}`)
    process.exit(1)
  }

  const content = `---
title: "${esc(title)}"
date: "${publishDate}"
publish_at: "${publishDate}"
category: "${esc(category)}"
excerpt: "${esc(excerpt)}"
tags:
${tagsYaml}
author: 藍想会メディア編集部
reviewed: false
draft: true
generated_at: "${new Date().toISOString()}"
stock_status: ready
theme_id: "${esc(sourceThemeTopicId)}"
duplicate_of: "${esc(duplicateCandidates[0]?.slug ?? '')}"
review_mode: auto
auto_approved: false
publication_status: draft
legal_check_status: pending
image_check_status: pending
medical_risk: "${esc(medicalRisk || 'medium')}"
image: "${esc(pickedImage.image)}"
image_alt: "${esc(pickedImage.image_alt)}"
ai_generated: true
source_topic_id: "${esc(topicId)}"
source_theme_topic_id: "${esc(sourceThemeTopicId)}"
source_theme_snapshot_id: "${esc(sourceThemeSnapshotId)}"
source_theme_snapshot_hash: "${esc(sourceThemeSnapshotHash)}"
source_theme_row_version: "${esc(sourceThemeRowVersion)}"
source_notes: "${esc(notes)}"
target_keyword: "${esc(keyword)}"
---

${body}
`

  // ファイル書き込み
  mkdirSync(postsDir, { recursive: true })
  writeFileSync(filePath, content, 'utf8')

  // 完了メッセージ（パス表示）
  console.log()
  console.log(`✅ 生成完了`)
  console.log(`   出力先 : content/posts/${filename}`)
  console.log(`   モデル : ${OPENAI_MODEL}`)
  console.log(`   トークン: 入力 ${response.usage?.prompt_tokens ?? 0} / 出力 ${response.usage?.completion_tokens ?? 0}`)
  console.log(`   image  : ok (${pickedImage.image_id})`)
  console.log(`   image_alt: ok`)
  console.log()
  console.log('次のステップ:')
  console.log('  1. 生成Markdownを手動確認')
  console.log('  2. 必要なら本文を修正')
  console.log('  3. npm run validate:posts')
  console.log('  4. npm run build')
  console.log('  5. Human approval 後に公開フローへ進む')
}

main().catch((e) => {
  console.error('エラー:', e.message)
  process.exit(1)
})
