# New Post Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/new-post.mjs` を追加し、CLI から frontmatter + 見出しテンプレート付き Markdown 記事ファイルを安全に生成できるようにする。

**Architecture:** Node.js ESM スクリプト（外部ライブラリなし、Node.js built-ins のみ）。`process.argv` でオプション解析、`fs.existsSync` で重複チェック、`fs.writeFileSync` でファイル生成。package.json に `new:post` スクリプトを追加。

**Tech Stack:** Node.js 20 ESM (`.mjs`)、`node:fs`、`node:path`、`node:url`

---

## File Structure

| 操作 | ファイル |
|------|---------|
| Create | `scripts/new-post.mjs` |
| Modify | `package.json`（scripts に `new:post` 追加のみ） |

---

### Task 1: `scripts/new-post.mjs` 作成 + `package.json` 更新 + 動作確認

**Files:**
- Create: `scripts/new-post.mjs`
- Modify: `package.json:7`（`"scripts"` ブロックに1行追加）

#### 実装

- [ ] **Step 1: `scripts/` ディレクトリを作成する**

  ```bash
  mkdir -p /Users/mitaniFDC/Desktop/aisoukai-media/scripts
  ```

- [ ] **Step 2: `scripts/new-post.mjs` を書く**

  以下の内容でファイルを作成する（外部ライブラリ不使用・Node.js built-ins のみ）:

  ```javascript
  #!/usr/bin/env node
  import { existsSync, writeFileSync } from 'node:fs'
  import { join, dirname } from 'node:path'
  import { fileURLToPath } from 'node:url'

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const ROOT = join(__dirname, '..')
  const POSTS_DIR = join(ROOT, 'content', 'posts')

  const VALID_CATEGORIES = [
    '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
    '親知らず', 'インプラント', 'その他', 'お知らせ',
  ]

  const CATEGORY_SLUG_FALLBACK = {
    '虫歯治療': 'cavity',
    '根管治療': 'root-canal',
    '歯周病治療': 'periodontal',
    '予防歯科': 'preventive',
    '小児歯科': 'pediatric',
    '親知らず': 'wisdom-tooth',
    'インプラント': 'implant',
    'その他': 'other',
    'お知らせ': 'news',
  }

  function parseArgs(argv) {
    const args = {}
    for (let i = 0; i < argv.length; i++) {
      if (argv[i].startsWith('--')) {
        const key = argv[i].slice(2)
        const value = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true
        args[key] = value
      }
    }
    return args
  }

  function titleToSlug(title, category) {
    const slug = title
      .toLowerCase()
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)

    if (slug.length >= 3) return slug

    const fallback = CATEGORY_SLUG_FALLBACK[category] ?? 'post'
    return slug.length > 0 ? `${fallback}-${slug}` : fallback
  }

  function buildFrontmatter({ title, date, category, excerpt, tags }) {
    const tagsYaml = tags.map((t) => `  - ${t}`).join('\n')
    return `---
  title: "${title}"
  date: "${date}"
  category: "${category}"
  excerpt: "${excerpt}"
  tags:
  ${tagsYaml}
  author: 藍想会メディア編集部
  reviewed: false
  image: ""
  ---`
  }

  function buildBody() {
    return `
  ## はじめに

  （導入文：患者が抱える疑問・背景を共感的に述べる。2〜3文）

  ## メインテーマ1

  （本論1：原因・仕組み・特徴などを解説。断定表現を避ける）

  ## メインテーマ2

  （本論2：治療・対処・予防など）

  ## まとめ

  （要点を2〜3文でまとめる。受診を促す場合も断定しない）
  `
  }

  // ── Main ──
  const args = parseArgs(process.argv.slice(2))
  const { title, category, excerpt, tags: tagsRaw } = args

  const missing = ['title', 'category', 'excerpt', 'tags'].filter((k) => !args[k])
  if (missing.length > 0) {
    console.error(`エラー: 必須引数が不足しています: ${missing.map((k) => `--${k}`).join(', ')}`)
    process.exit(1)
  }

  if (!VALID_CATEGORIES.includes(category)) {
    console.error(`エラー: 無効なカテゴリ "${category}"`)
    console.error(`有効なカテゴリ: ${VALID_CATEGORIES.join(' / ')}`)
    process.exit(1)
  }

  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
  const date = new Date().toISOString().slice(0, 10)
  const slug = titleToSlug(title, category)
  const filename = `${date}-${slug}.md`
  const filePath = join(POSTS_DIR, filename)

  if (existsSync(filePath)) {
    console.error(`エラー: ファイルが既に存在します: content/posts/${filename}`)
    process.exit(1)
  }

  const content = buildFrontmatter({ title, date, category, excerpt, tags }) + '\n' + buildBody()
  writeFileSync(filePath, content, 'utf8')
  console.log(`✅ 作成しました: content/posts/${filename}`)
  ```

  > **注意:** frontmatter の インデント は `  ` (2スペース) ではなく 0スペース（行頭から書く）で書くこと。上のコードブロックはテンプレート文字列内のインデント除去が必要。実際に書く内容は下の「正しい frontmatter 出力形式」を参照。

  **正しい frontmatter 出力形式:**
  ```
  ---
  title: "タイトル"
  date: "2026-05-11"
  category: "お知らせ"
  excerpt: "..."
  tags:
    - タグ1
    - タグ2
  author: 藍想会メディア編集部
  reviewed: false
  image: ""
  ---
  ```

  `buildFrontmatter` 内でテンプレート文字列のインデントが入らないよう、関数内の文字列は行頭から書く（上の実装コードの `buildFrontmatter` 関数を参照 — インデントなしで書かれている）。

- [ ] **Step 3: `package.json` の `scripts` に `new:post` を追加する**

  `package.json` の `"scripts"` ブロックを以下に変更する（lint の後に1行追加）:

  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "new:post": "node scripts/new-post.mjs"
  },
  ```

#### 動作確認

- [ ] **Step 4: 正常系テスト — 記事生成**

  ```bash
  cd /Users/mitaniFDC/Desktop/aisoukai-media
  npm run new:post -- --title "医院からのお知らせ" --category "お知らせ" --excerpt "医院からのお知らせを掲載します。" --tags "お知らせ,医院情報"
  ```

  Expected output:
  ```
  ✅ 作成しました: content/posts/2026-05-11-news.md
  ```

  次に生成されたファイルの内容を確認する:
  ```bash
  cat content/posts/2026-05-11-news.md
  ```

  Expected: frontmatter が正しく出力されていること（インデントずれなし）

- [ ] **Step 5: エラー系テスト — 重複チェック**

  同じコマンドをもう一度実行する:
  ```bash
  npm run new:post -- --title "医院からのお知らせ" --category "お知らせ" --excerpt "医院からのお知らせを掲載します。" --tags "お知らせ,医院情報"
  ```

  Expected: `エラー: ファイルが既に存在します: content/posts/2026-05-11-news.md` でプロセス終了コード 1

- [ ] **Step 6: エラー系テスト — 無効カテゴリ**

  ```bash
  npm run new:post -- --title "テスト" --category "無効カテゴリ" --excerpt "テスト" --tags "テスト"
  ```

  Expected: `エラー: 無効なカテゴリ "無効カテゴリ"` + 有効カテゴリ一覧が表示される

- [ ] **Step 7: エラー系テスト — 必須引数欠落**

  ```bash
  npm run new:post -- --title "テスト"
  ```

  Expected: `エラー: 必須引数が不足しています: --category, --excerpt, --tags` でプロセス終了コード 1

- [ ] **Step 8: テスト用に生成した記事を削除する**

  ```bash
  rm content/posts/2026-05-11-news.md
  ```

  > 動作確認のためだけに生成したファイルなので削除する。既存の7記事は絶対に削除しないこと。

#### ビルド確認

- [ ] **Step 9: `npm run build` を実行する**

  ```bash
  cd /Users/mitaniFDC/Desktop/aisoukai-media && npm run build
  ```

  Expected: エラーなし（テスト用記事を削除済みなので既存7記事のみがビルド対象）

#### コミット

- [ ] **Step 10: コミットする**

  ```bash
  cd /Users/mitaniFDC/Desktop/aisoukai-media
  git add scripts/new-post.mjs package.json
  git commit -m "feat: add new:post script for article generation"
  ```

---

## Self-Review チェック

| 要件 | 対応ステップ |
|------|------------|
| `scripts/new-post.mjs` 追加 | Step 2 |
| `new:post` npm script 追加 | Step 3 |
| CLI 引数 --title/--category/--excerpt/--tags | Step 2 (parseArgs) |
| slug は title から自動生成 | Step 2 (titleToSlug) |
| 保存先 `content/posts/YYYY-MM-DD-slug.md` | Step 2 |
| frontmatter: title/date/category/excerpt/tags/author/reviewed/image | Step 2 (buildFrontmatter) |
| 本文に見出しテンプレート | Step 2 (buildBody) |
| 同名ファイル上書き禁止 → エラー | Step 2 (existsSync) + Step 5 |
| 9カテゴリのみ許可 | Step 2 (VALID_CATEGORIES) + Step 6 |
| npm run build 通過 | Step 9 |
| 既存記事の変更禁止 | ✅ 新規ファイルのみ作成 |
| 不要ライブラリ追加禁止 | ✅ Node.js built-ins のみ |
