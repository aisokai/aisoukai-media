#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { parseCsv } from './csv-parser.mjs'
import { buildArticlePrompt } from './prompts/dental-article-prompt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')
const POSTS_DIR = join(ROOT, 'content', 'posts')

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
}

// .env.local を読み、process.env に反映する（既存の環境変数は上書きしない）
function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
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
  loadEnv()

  const args = parseArgs(process.argv.slice(2))
  const topicId = String(args.topic_id ?? args._[0] ?? '').trim()
  const force = args.force === true

  if (!topicId) {
    console.error('使い方: npm run generate:draft -- TOPIC-20260511-001')
    console.error('補足: --topic-id でも指定できます')
    process.exit(1)
  }

  // API キー確認（値はログに出さない）
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('エラー: ANTHROPIC_API_KEY が未設定です')
    console.error('  .env.local に以下を追加してください:')
    console.error('  ANTHROPIC_API_KEY=sk-ant-...')
    process.exit(1)
  }

  // CSV 読み込み
  let raw
  try {
    raw = readFileSync(TOPICS_PATH, 'utf8')
  } catch {
    console.error(`エラー: ${TOPICS_PATH} が見つかりません`)
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
  const publishDate = getField(row, FIELD_ALIASES.publishDate)
  const keyword     = getField(row, FIELD_ALIASES.keyword)
  const intent      = getField(row, FIELD_ALIASES.intent)
  const topic       = getField(row, FIELD_ALIASES.topic)
  const medicalRisk = getField(row, FIELD_ALIASES.medicalRisk)
  const notes       = getField(row, FIELD_ALIASES.notes)

  // 必須フィールド検証
  const missing = []
  if (!title)                          missing.push('title_candidate')
  if (!VALID_CATEGORIES.has(category)) missing.push(`category (値: "${category || '空'}")`)
  if (!isValidDate(publishDate))       missing.push('publish_date')
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
  const filePath = join(POSTS_DIR, filename)

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
  console.log(`⏳ Claude に記事本文を生成中...`)

  // プロンプト生成と API 呼び出し
  const prompt = buildArticlePrompt({ title, category, keyword, intent, medicalRisk, topic })

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const body = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
  if (!body) {
    console.error('エラー: API からの応答が空でした')
    process.exit(1)
  }

  // frontmatter 組み立て
  const excerpt = category === 'お知らせ'
    ? `${title}についてお知らせします。`
    : `${title}について、原因・受診目安・注意点を整理します。`

  const tags = buildTags(row)
  const tagsYaml = tags.map((t) => `  - "${esc(t)}"`).join('\n')

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
image: ""
ai_generated: true
source_topic_id: "${esc(topicId)}"
source_notes: "${esc(notes)}"
---

${body}
`

  // ファイル書き込み
  mkdirSync(POSTS_DIR, { recursive: true })
  writeFileSync(filePath, content, 'utf8')

  // 完了メッセージ（パス表示）
  console.log()
  console.log(`✅ 生成完了`)
  console.log(`   出力先 : content/posts/${filename}`)
  console.log(`   モデル : claude-haiku-4-5-20251001`)
  console.log(`   トークン: 入力 ${response.usage.input_tokens} / 出力 ${response.usage.output_tokens}`)
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
