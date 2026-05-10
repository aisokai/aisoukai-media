# Validate Posts Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/validate-posts.mjs` を追加し、`content/posts/*.md` 全件の frontmatter 整合性を検査して CI/build 前のガードとして機能させる。

**Architecture:** Node.js ESM スクリプト。すでに依存関係に含まれる `gray-matter` を使って frontmatter をパース。ファイルごとにエラーを収集し、末尾でまとめて出力。エラー有りなら `process.exit(1)`。外部ライブラリは gray-matter のみ（既存依存、追加なし）。

**Tech Stack:** Node.js 20 ESM、`gray-matter`（既存依存）、`node:fs`、`node:path`、`node:url`

---

## 既存記事との整合性について（実装前の重要メモ）

現在の 7 記事はすべて **旧スキーマ** で書かれており、以下の不一致がある：

| フィールド | 旧記事の状態 | 新スキーマ |
|-----------|------------|---------|
| `excerpt` | なし（代わりに `description`）| 必須 |
| `author` | なし | 必須 |
| `reviewed` | なし | 必須（boolean）|
| `image` | なし | 必須 |
| `category: "AI歯科"` | 1件あり（無効カテゴリ）| 9カテゴリのみ |

**方針:** 仕様どおりに厳格実装する。既存記事は `validate:posts` を実行すると失敗を報告する。これは正しい動作であり、既存記事が新スキーマに未準拠であることを明示するのがバリデーターの役割。

---

## File Structure

| 操作 | ファイル |
|------|---------|
| Create | `scripts/validate-posts.mjs` |
| Modify | `package.json`（`validate:posts` 追加のみ）|

---

### Task 1: `scripts/validate-posts.mjs` 作成 + `package.json` 更新 + 動作確認

**Files:**
- Create: `scripts/validate-posts.mjs`
- Modify: `package.json:10`（`new:post` の後に1行追加）

#### 実装

- [ ] **Step 1: `scripts/validate-posts.mjs` を書く**

  ```javascript
  #!/usr/bin/env node
  import { readdirSync, readFileSync } from 'node:fs'
  import { join, dirname, basename } from 'node:path'
  import { fileURLToPath } from 'node:url'
  import matter from 'gray-matter'

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const ROOT = join(__dirname, '..')
  const POSTS_DIR = join(ROOT, 'content', 'posts')

  const VALID_CATEGORIES = [
    '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
    '親知らず', 'インプラント', 'その他', 'お知らせ',
  ]

  const REQUIRED_FIELDS = ['title', 'date', 'category', 'excerpt', 'tags', 'author', 'reviewed', 'image']
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const FILENAME_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/

  function toDateStr(val) {
    if (val instanceof Date) return val.toISOString().slice(0, 10)
    return String(val ?? '')
  }

  function validatePost(filename) {
    const errors = []
    const filePath = join(POSTS_DIR, filename)

    // ファイル名パターンチェック
    if (!FILENAME_RE.test(filename)) {
      errors.push('ファイル名が YYYY-MM-DD-slug.md 形式ではありません')
      return errors
    }

    let data, content
    try {
      const raw = readFileSync(filePath, 'utf8')
      const parsed = matter(raw)
      data = parsed.data
      content = parsed.content
    } catch (e) {
      errors.push(`frontmatter のパースに失敗しました: ${e.message}`)
      return errors
    }

    // 必須フィールド存在チェック
    for (const field of REQUIRED_FIELDS) {
      if (data[field] === undefined || data[field] === null) {
        errors.push(`${field} フィールドがありません`)
      }
    }

    // 以降は存在するフィールドのみ検査
    if (typeof data.title === 'string' && data.title.trim() === '') {
      errors.push('title が空です')
    }

    if (typeof data.excerpt === 'string' && data.excerpt.trim() === '') {
      errors.push('excerpt が空です')
    }

    if (data.category !== undefined && !VALID_CATEGORIES.includes(data.category)) {
      errors.push(`category が無効です: "${data.category}"`)
    }

    if (data.reviewed !== undefined && typeof data.reviewed !== 'boolean') {
      errors.push(`reviewed が boolean ではありません (実際の型: ${typeof data.reviewed})`)
    }

    if (data.tags !== undefined && !Array.isArray(data.tags)) {
      errors.push('tags が配列ではありません')
    }

    if (data.date !== undefined) {
      const dateStr = toDateStr(data.date)
      if (!DATE_RE.test(dateStr)) {
        errors.push(`date の形式が不正です: "${dateStr}" (YYYY-MM-DD が必要)`)
      } else {
        const filenameDate = filename.slice(0, 10)
        if (dateStr !== filenameDate) {
          errors.push(`date (${dateStr}) がファイル名の日付 (${filenameDate}) と一致しません`)
        }
      }
    }

    if (!content || content.trim() === '') {
      errors.push('本文が空です')
    }

    return errors
  }

  // ── Main ──
  let files
  try {
    files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort()
  } catch {
    console.error(`エラー: content/posts/ が見つかりません`)
    process.exit(1)
  }

  if (files.length === 0) {
    console.log('⚠️  記事が存在しません: content/posts/')
    process.exit(0)
  }

  let hasErrors = false
  const report = []

  for (const file of files) {
    const errors = validatePost(file)
    report.push({ file, errors })
    if (errors.length > 0) hasErrors = true
  }

  if (!hasErrors) {
    console.log(`✅ All posts valid (${files.length} 件)`)
    process.exit(0)
  }

  for (const { file, errors } of report) {
    if (errors.length > 0) {
      console.error(`❌ ${file}`)
      for (const err of errors) {
        console.error(`   - ${err}`)
      }
    }
  }
  process.exit(1)
  ```

- [ ] **Step 2: `package.json` に `validate:posts` を追加する**

  現在の scripts:
  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "new:post": "node scripts/new-post.mjs"
  },
  ```

  変更後:
  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "new:post": "node scripts/new-post.mjs",
    "validate:posts": "node scripts/validate-posts.mjs"
  },
  ```

#### 動作確認

- [ ] **Step 3: 既存記事に対して実行する（失敗が期待される）**

  ```bash
  cd /Users/mitaniFDC/Desktop/aisoukai-media
  npm run validate:posts
  ```

  Expected output: 既存 7 記事はすべて新スキーマ未対応（`excerpt`/`author`/`reviewed`/`image` なし、`category: "AI歯科"` の1件は無効カテゴリも）のため `❌` が表示され `exit code 1` となる。これは正しい動作。

  出力例:
  ```
  ❌ 2026-01-15-ai-dental-diagnosis.md
     - excerpt フィールドがありません
     - author フィールドがありません
     - reviewed フィールドがありません
     - category が無効です: "AI歯科"
  ❌ 2026-01-20-cavity-treatment.md
     - excerpt フィールドがありません
     ...
  ```

- [ ] **Step 4: 新スキーマに沿った記事を生成してバリデーションを通過させる**

  ```bash
  npm run new:post -- --title "インプラント治療の費用について" --category "インプラント" --excerpt "インプラントの費用は治療の内容によって異なります。" --tags "インプラント,費用"
  npm run validate:posts 2>&1 | grep -E "✅|❌ 2026-05"
  ```

  Expected: `✅` または生成した記事が通過することを確認。

  確認後、テスト用記事を削除:
  ```bash
  rm content/posts/2026-05-11-implant.md
  ```

- [ ] **Step 5: `npm run build` を実行する**

  ```bash
  cd /Users/mitaniFDC/Desktop/aisoukai-media && npm run build
  ```

  Expected: エラーなし。validate:posts はビルドとは独立したスクリプト。

#### コミット

- [ ] **Step 6: コミットする**

  ```bash
  cd /Users/mitaniFDC/Desktop/aisoukai-media
  git add scripts/validate-posts.mjs package.json
  git commit -m "feat: add validate:posts script for frontmatter integrity check"
  ```

---

## Self-Review チェック

| 要件 | 対応ステップ |
|------|------------|
| `scripts/validate-posts.mjs` 追加 | Step 1 |
| `validate:posts` npm script | Step 2 |
| content/posts/*.md 全件走査 | Step 1 (readdirSync) |
| title 空チェック | Step 1 |
| excerpt 空チェック | Step 1 |
| category 9種バリデーション | Step 1 (VALID_CATEGORIES) |
| reviewed が boolean | Step 1 |
| tags が array | Step 1 |
| date が YYYY-MM-DD | Step 1 (DATE_RE) |
| slug とファイル名一致（date prefix）| Step 1 |
| frontmatter 破損チェック | Step 1 (try/catch matter()) |
| 本文が空でない | Step 1 (content.trim()) |
| エラー有り → process.exit(1) | Step 1 |
| エラー無し → ✅ All posts valid | Step 1 |
| 外部ライブラリ最小限（gray-matter は既存依存）| ✅ |
| 既存記事の変更禁止 | ✅ |
| npm run build 通過 | Step 5 |
