# Phase 2A: AI Draft Article Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `npm run generate:draft -- TOPIC-ID` CLI that calls the Anthropic API (claude-haiku-4-5-20251001) to write a full Japanese medical article body, saving a `reviewed:false` Markdown draft to `content/posts/`.

**Architecture:** `scripts/generate-draft.mjs` reads a topic row from the CSV via the shared `scripts/csv-parser.mjs`, delegates prompt construction to `scripts/prompts/dental-article-prompt.mjs`, calls the Anthropic API, and writes a PostMeta-compatible Markdown file. The API key is read from `.env.local` via an inline parser (no extra npm package). Two extra frontmatter fields (`ai_generated: true`, `source_topic_id`) are added for traceability; they are ignored by `validate-posts.mjs` since it only checks REQUIRED_FIELDS.

**Tech Stack:** Node.js 20 ESM, `@anthropic-ai/sdk@latest`, `scripts/csv-parser.mjs` (existing), `.env.local`

---

### File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `scripts/prompts/dental-article-prompt.mjs` | Per-category section lists + medical writing prompt builder |
| Create | `scripts/generate-draft.mjs` | CLI entry: reads CSV → calls API → writes Markdown |
| Modify | `package.json` | Add `generate:draft` script + `@anthropic-ai/sdk` dependency |

---

### Task 1: Install @anthropic-ai/sdk

**Files:**
- Modify: `package.json` (dependencies section)

- [ ] **Step 1: Install the package**

```bash
cd ~/Desktop/aisoukai-media
npm install @anthropic-ai/sdk
```

Expected output:
```
added N packages, ...
```

- [ ] **Step 2: Verify it appears in package.json**

```bash
node -e "import('@anthropic-ai/sdk').then(m => console.log('OK', m.default.name ?? 'Anthropic'))"
```

Expected: `OK Anthropic`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk dependency"
```

---

### Task 2: Create prompt builder

**Files:**
- Create: `scripts/prompts/dental-article-prompt.mjs`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p ~/Desktop/aisoukai-media/scripts/prompts
```

- [ ] **Step 2: Write the prompt builder**

Create `scripts/prompts/dental-article-prompt.mjs` with the following content:

```javascript
/**
 * カテゴリ別セクション構成と医療ライティングガイドラインを組み合わせ、
 * Claude に渡すプロンプト文字列を生成する。
 */

const SECTION_MAP = {
  '虫歯治療': [
    'はじめに',
    'この記事でわかること',
    '虫歯が進む仕組み',
    '主な症状と気づきのサイン',
    '受診のタイミング',
    '歯科医院でできること',
    'まとめ',
    '注意書き',
  ],
  '根管治療': [
    'はじめに',
    'この記事でわかること',
    '根管治療が必要になるとき',
    '治療の大まかな流れ',
    '治療中・治療後の注意点',
    '受診のタイミング',
    'まとめ',
    '注意書き',
  ],
  '歯周病治療': [
    'はじめに',
    'この記事でわかること',
    '歯周病の進行と主なサイン',
    '生活習慣との関係',
    '受診のタイミング',
    '歯科医院でできること',
    'まとめ',
    '注意書き',
  ],
  '予防歯科': [
    'はじめに',
    'この記事でわかること',
    '予防歯科の考え方',
    '日常ケアのポイント',
    '定期検診の活用',
    'まとめ',
    '注意書き',
  ],
  '小児歯科': [
    'はじめに',
    'この記事でわかること',
    '成長段階と歯の変化',
    '保護者ができるケア',
    '受診のタイミング',
    'まとめ',
    '注意書き',
  ],
  '親知らず': [
    'はじめに',
    'この記事でわかること',
    '親知らずの生え方と影響',
    '抜歯が検討されるケース',
    '受診のタイミング',
    '歯科医院での確認内容',
    'まとめ',
    '注意書き',
  ],
  'インプラント': [
    'はじめに',
    'この記事でわかること',
    'インプラントとはどんな治療か',
    '治療の流れとポイント',
    '術後のケアと注意点',
    'まとめ',
    '注意書き',
  ],
  'お知らせ': [
    'お知らせの概要',
    '対象となる方',
    '実施日・変更内容',
    'ご確認いただきたいこと',
    'まとめ',
  ],
  'その他': [
    'はじめに',
    'この記事でわかること',
    '背景と現状',
    'よくある疑問',
    '歯科医院への相談のすすめ',
    'まとめ',
    '注意書き',
  ],
}

/**
 * @param {{ title: string, category: string, keyword: string, intent: string, medicalRisk: string, topic: string }} params
 * @returns {string} Claude に渡すプロンプト
 */
export function buildArticlePrompt({ title, category, keyword, intent, medicalRisk, topic }) {
  const sections = SECTION_MAP[category] ?? SECTION_MAP['その他']
  const sectionList = sections.map((s, i) => `${i + 1}. ## ${s}`).join('\n')

  const riskNote = medicalRisk === 'high'
    ? '医療リスクが高いテーマです。断定的な表現を極力避け、必ず「歯科医師への相談」を強調してください。'
    : '一般的な歯科情報として、わかりやすく・正確に執筆してください。'

  return `あなたは日本の歯科クリニックのウェブサイト向け医療情報ライターです。以下の条件で記事本文を執筆してください。

## 執筆条件
- タイトル: ${title}
- カテゴリ: ${category}
- 検索キーワード: ${keyword}
- 患者の検索意図: ${intent}
- テーマ: ${topic}

## 医療情報ガイドライン
- 診断・治療の断定はしない（「〜の可能性があります」「〜の場合があります」「〜ことがあります」を使う）
- 「必ず歯科医院に相談してください」の旨を必ず含める
- ${riskNote}
- 根拠なく特定の薬剤・製品・治療法を推奨しない
- 専門用語には補足説明を入れ、一般の患者が理解できる言葉を使う

## 記事構成
以下の順にセクションを記述してください（frontmatter・タイトル見出しは出力不要）：
${sectionList}

## 出力形式
- 合計800〜1200文字（日本語）
- 各セクションは ## 見出しを使用
- 注意書きがある場合は箇条書き（- ではじめる）
- 記事本文のみを出力すること（説明文・前置き・コメント不要）`
}
```

- [ ] **Step 3: Verify the file parses correctly**

```bash
node -e "import('./scripts/prompts/dental-article-prompt.mjs').then(m => console.log('OK', typeof m.buildArticlePrompt))"
```

Expected: `OK function`

---

### Task 3: Create generate-draft.mjs

**Files:**
- Create: `scripts/generate-draft.mjs`

- [ ] **Step 1: Write the main script**

Create `scripts/generate-draft.mjs`:

```javascript
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

// .env.local を読んで process.env に反映（既存の環境変数は上書きしない）
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
  const push = (v) => { const t = String(v ?? '').trim(); if (t && !tags.includes(t)) tags.push(t) }
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

  if (!topicId) {
    console.error('使い方: npm run generate:draft -- TOPIC-20260511-001')
    console.error('補足: --topic-id でも指定できます')
    process.exit(1)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('エラー: ANTHROPIC_API_KEY が未設定です')
    console.error('.env.local に以下を追加してください:')
    console.error('ANTHROPIC_API_KEY=sk-ant-...')
    process.exit(1)
  }

  const rows = parseCsv(readFileSync(TOPICS_PATH, 'utf8'))
  const matches = rows.filter((r) => getField(r, FIELD_ALIASES.id) === topicId)

  if (matches.length === 0) {
    console.error(`エラー: topic_id が見つかりません: ${topicId}`)
    console.error(`候補: ${rows.slice(0, 8).map((r) => getField(r, FIELD_ALIASES.id)).join(', ')}`)
    process.exit(1)
  }
  if (matches.length > 1) {
    console.error(`エラー: topic_id が ${matches.length} 件重複しています: ${topicId}`)
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

  const missing = []
  if (!title)                        missing.push('title_candidate')
  if (!VALID_CATEGORIES.has(category)) missing.push(`category (無効値: ${category || '空'})`)
  if (!isValidDate(publishDate))     missing.push('publish_date')
  if (!keyword)                      missing.push('target_keyword')
  if (!intent)                       missing.push('patient_intent')
  if (missing.length > 0) {
    console.error(`エラー: フィールド不足 — ${missing.join(', ')}`)
    console.error('npm run validate:topics を先に実行してください')
    process.exit(1)
  }

  const slug     = slugify(topicId)
  const filename = `${publishDate}-${slug}.md`
  const filePath = join(POSTS_DIR, filename)

  if (existsSync(filePath)) {
    console.error(`エラー: ファイルが既に存在します: content/posts/${filename}`)
    process.exit(1)
  }

  const prompt = buildArticlePrompt({ title, category, keyword, intent, medicalRisk, topic })

  console.log(`⏳ 記事生成中... (${category} / ${keyword})`)

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

  const excerpt = category === 'お知らせ'
    ? `${title}についてお知らせします。`
    : `${title}について、原因・受診目安・注意点を整理します。`

  const tags = buildTags(row)
  const tagsYaml = tags.map((t) => `  - "${esc(t)}"`).join('\n')

  const content = `---
title: "${esc(title)}"
date: "${publishDate}"
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

  mkdirSync(POSTS_DIR, { recursive: true })
  writeFileSync(filePath, content, 'utf8')

  console.log(`✅ 生成しました: content/posts/${filename}`)
  console.log(`   モデル: claude-haiku-4-5-20251001`)
  console.log(`   入力: ${response.usage.input_tokens} トークン / 出力: ${response.usage.output_tokens} トークン`)
  console.log(`   次のステップ: npm run validate:posts で確認後、内容をレビューしてください`)
}

main().catch((e) => {
  console.error('エラー:', e.message)
  process.exit(1)
})
```

- [ ] **Step 2: Verify the script loads without error (no API call yet)**

```bash
node --input-type=module <<'EOF'
import { createRequire } from 'module'
// Just check that the imports resolve
const { parseCsv } = await import('./scripts/csv-parser.mjs')
const { buildArticlePrompt } = await import('./scripts/prompts/dental-article-prompt.mjs')
console.log('imports OK')
EOF
```

Expected: `imports OK`

---

### Task 4: Add npm script and .env.local template

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add generate:draft to scripts in package.json**

In `package.json`, add the following to the `"scripts"` section:

```json
"generate:draft": "node scripts/generate-draft.mjs"
```

The scripts section should look like:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "new:post": "node scripts/new-post.mjs",
  "import:topic": "node scripts/import-topic.mjs",
  "generate:draft": "node scripts/generate-draft.mjs",
  "validate:posts": "node scripts/validate-posts.mjs",
  "validate:topics": "node scripts/validate-topics.mjs"
}
```

- [ ] **Step 2: Create .env.local (not committed)**

Create `.env.local` in the project root:

```
ANTHROPIC_API_KEY=sk-ant-ここにキーを貼り付けてください
NEXT_PUBLIC_SITE_URL=https://mitani-dental.jp
```

- [ ] **Step 3: Ensure .env.local is in .gitignore**

Check or create `.gitignore` in the project root:

```bash
grep -q '.env.local' .gitignore 2>/dev/null || echo '.env.local' >> .gitignore
```

- [ ] **Step 4: Verify no-arg error message works**

```bash
npm run generate:draft 2>&1
```

Expected:
```
使い方: npm run generate:draft -- TOPIC-20260511-001
補足: --topic-id でも指定できます
```

- [ ] **Step 5: Commit scripts (not .env.local)**

```bash
git add package.json scripts/generate-draft.mjs scripts/prompts/dental-article-prompt.mjs .gitignore
git commit -m "feat: add AI draft generation CLI (generate:draft)"
```

---

### Task 5: Live test with real topic ID

**Files:**
- Creates: `content/posts/2026-05-20-topic-20260511-001.md` (from CSV row 001)

- [ ] **Step 1: Confirm ANTHROPIC_API_KEY is set in .env.local**

```bash
grep ANTHROPIC_API_KEY .env.local
```

Expected: `ANTHROPIC_API_KEY=sk-ant-...`（実際のキー）

- [ ] **Step 2: Run generate:draft with topic 001**

```bash
npm run generate:draft -- TOPIC-20260511-001
```

Expected:
```
⏳ 記事生成中... (その他 / AI 歯科診断)
✅ 生成しました: content/posts/2026-05-20-topic-20260511-001.md
   モデル: claude-haiku-4-5-20251001
   入力: XXX トークン / 出力: XXX トークン
   次のステップ: npm run validate:posts で確認後、内容をレビューしてください
```

- [ ] **Step 3: Validate the generated post**

```bash
npm run validate:posts
```

Expected: `✅ All posts valid (N 件)`

- [ ] **Step 4: Inspect the generated file**

```bash
cat content/posts/2026-05-20-topic-20260511-001.md | head -20
```

確認ポイント:
- frontmatter の8フィールド（title/date/category/excerpt/tags/author/reviewed/image）が揃っているか
- `ai_generated: true` が含まれているか
- `reviewed: false` になっているか

- [ ] **Step 5: Run build to confirm SSG works**

```bash
npm run build 2>&1 | tail -10
```

Expected: `✅ Generating static pages using 9 workers (N/N) in ...`

- [ ] **Step 6: Commit the generated draft (optional — only if keeping it)**

```bash
git add content/posts/2026-05-20-topic-20260511-001.md
git commit -m "content: add AI-generated draft for TOPIC-20260511-001"
```

---

## 完了確認

以下がすべて通れば Phase 2A 完了:

```bash
npm run validate:topics  # ✅ All topics valid (30 件)
npm run validate:posts   # ✅ All posts valid (N 件)
npm run build            # ✅ 静的ページ生成完了
```

## 注意事項

- `.env.local` は `.gitignore` に含めること（API キーを commit しない）
- AI 生成記事は `reviewed: false` のまま — Phase 2C の approve-post.mjs で承認後に `reviewed: true` にする
- 生成コスト目安: claude-haiku-4-5 で約 1000 トークン入力 + 1500 トークン出力 ≒ $0.001/記事
