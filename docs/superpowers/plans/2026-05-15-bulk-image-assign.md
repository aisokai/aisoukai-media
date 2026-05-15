# Bulk Image Assign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `image` / `image_alt` が未設定の既存記事13件に対して、image-library.json のスコアリングで最適画像を一括割当てするワンショット CLI スクリプトを作成・実行する。

**Architecture:** 独立した `scripts/image-assign-bulk.mjs` を新規作成する。スコアリングロジック（tokenize / scoreImage / findBestImage）は telegram-ops.mjs と同一のものをインライン実装する（既存パターンに従い各スクリプトは独立）。デフォルトは dry-run（変更なし）、`--apply` フラグ時のみ frontmatter を書き込む。reviewed / draft など image・image_alt 以外のフィールドは絶対に変更しない。

**Tech Stack:** Node.js ESM, gray-matter, `data/image-library.json`（読み取り専用）

---

## 現状データ（調査済み）

- image 未設定: **13件**
- image 設定済み: 12件
- image-library: 39件（preventive:21 / pediatric:7 / cavity:4 / general:3 / announcement:2 / implant:2）

| ファイル | カテゴリ | reviewed |
|---|---|---|
| 2026-01-15-ai-dental-diagnosis.md | その他 | false |
| 2026-05-14-cadcam.md | 虫歯治療 | false |
| 2026-05-14-req-145026175.md | 虫歯治療 | true |
| 2026-05-14-req-145026178.md | 歯周病治療 | true |
| 2026-05-14-req-145026181.md | その他 | true |
| 2026-05-14-req-145026183.md | その他 | false |
| 2026-05-15-req-145026184.md | その他 | false |
| 2026-05-15-req-145026186.md | その他 | false |
| 2026-05-15-req-145026187.md | その他 | false |
| 2026-05-15-req-145026188.md | 歯周病治療 | true |
| 2026-05-15-req-145026190.md | インプラント | false |
| 2026-05-15-req-145026191.md | その他 | true |
| 2026-06-13-topic-20260511-029.md | お知らせ | false |

カテゴリ fallback マッピング（`その他` は未定義 → `general`）:
- 虫歯治療 → cavity、歯周病治療 → general、インプラント → implant、お知らせ → announcement、その他 → general（fallback）

---

## ファイル構成

| ファイル | 変更 | 内容 |
|---|---|---|
| `scripts/image-assign-bulk.mjs` | 新規作成 | 一括割当 CLI スクリプト本体 |
| `package.json` | 修正 | `"image:assign-bulk"` スクリプトを追加 |
| `content/posts/*.md` | 修正（--apply 時） | image / image_alt フィールドを更新（13件） |

---

### Task 1: `scripts/image-assign-bulk.mjs` を作成する

**Files:**
- Create: `scripts/image-assign-bulk.mjs`

---

- [ ] **Step 1: スクリプトファイルを作成する**

`scripts/image-assign-bulk.mjs` を以下の内容で作成する：

```js
#!/usr/bin/env node
// image-assign-bulk.mjs
// image 未設定の全記事に対して image-library.json から最適画像を一括割当てする。
// デフォルト: dry-run（ファイル変更なし）
// --apply : frontmatter を書き込む
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

// 記事カテゴリ（日本語）→ image-library category（英語）
const ARTICLE_CAT_TO_LIB_CAT = {
  '虫歯治療':    'cavity',
  '歯周病治療':  'general',
  '根管治療':    'general',
  '親知らず':    'general',
  '予防歯科':    'preventive',
  'インプラント': 'implant',
  '小児歯科':    'pediatric',
  'お知らせ':    'announcement',
}

function tokenize(text) {
  const set = new Set()
  const str = String(text ?? '')
  for (const token of str.split(/[\s、。・「」【】（）()[\]：:,，！？!?]+/)) {
    if (token.length >= 2) set.add(token)
  }
  for (const w of (str.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])) {
    set.add(w)
  }
  return set
}

function scoreImage(image, articleTokens) {
  let score = 0
  for (const tag of image.tags ?? []) {
    if (articleTokens.has(tag)) { score += 2; continue }
    for (const token of articleTokens) {
      if (tag.includes(token) || token.includes(tag)) { score += 0.5; break }
    }
  }
  return score
}

function findBestImage({ images, title, category, excerpt, bodyContent }) {
  if (!images || images.length === 0) return null
  const articleText = [title, category, excerpt ?? '', bodyContent?.slice(0, 300) ?? ''].join(' ')
  const tokens = tokenize(articleText)
  const best = images
    .map((img) => ({ img, score: scoreImage(img, tokens) }))
    .sort((a, b) => b.score - a.score)[0]
  if (best && best.score > 0) return best.img
  const libCat = ARTICLE_CAT_TO_LIB_CAT[category] ?? 'general'
  return images.find((img) => img.category === libCat)
    ?? images.find((img) => img.category === 'general')
    ?? null
}

// gray-matter が Date に変換するフィールドを文字列に戻す
function normalizeDates(data) {
  const out = { ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
  }
  return out
}

function main() {
  const apply = process.argv.includes('--apply')

  const BAR = '━'.repeat(64)
  const DIV = '─'.repeat(64)
  console.log(BAR)
  console.log(`image 一括割当 ${apply ? '【APPLY モード】' : '【DRY-RUN モード（--apply で書き込み）】'}`)
  console.log(BAR)

  if (!existsSync(LIBRARY_PATH)) {
    console.error('エラー: data/image-library.json が見つかりません')
    process.exit(1)
  }
  const lib    = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
  const images = lib.images ?? []

  const files = readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()

  const results = { assigned: [], noCandidate: [], skipped: [] }

  for (const filename of files) {
    const filePath = join(POSTS_DIR, filename)
    const raw      = readFileSync(filePath, 'utf8')
    const parsed   = matter(raw)
    const data     = normalizeDates(parsed.data)

    // image 設定済みはスキップ
    if (data.image) {
      results.skipped.push({ filename, imageId: data.image })
      continue
    }

    const best = findBestImage({
      images,
      title:       data.title ?? '',
      category:    data.category ?? '',
      excerpt:     data.excerpt ?? data.description ?? '',
      bodyContent: parsed.content,
    })

    if (!best) {
      results.noCandidate.push({ filename, category: data.category ?? '', reviewed: data.reviewed })
      continue
    }

    results.assigned.push({
      filename,
      category:  data.category ?? '',
      reviewed:  data.reviewed,
      imageId:   best.id,
      imagePath: best.path,
      imageAlt:  best.alt,
    })

    if (apply) {
      // image / image_alt のみ更新。他フィールドは絶対に変更しない。
      data.image     = best.path
      data.image_alt = best.alt
      writeFileSync(filePath, matter.stringify(parsed.content, data), 'utf8')
    }
  }

  // ── 結果レポート ──────────────────────────────────────────────────────────

  console.log()
  console.log(`✅ 割当対象: ${results.assigned.length} 件`)
  console.log(DIV)
  for (const r of results.assigned) {
    const mark = apply ? '✏️' : '📋'
    console.log(`${mark} ${r.filename}`)
    console.log(`   category: ${r.category} / reviewed: ${r.reviewed}`)
    console.log(`   → image-id: ${r.imageId}`)
  }

  if (results.noCandidate.length > 0) {
    console.log()
    console.log(`⚠️  候補なし: ${results.noCandidate.length} 件（手動で設定してください）`)
    console.log(DIV)
    for (const r of results.noCandidate) {
      console.log(`   ${r.filename}  category: ${r.category} / reviewed: ${r.reviewed}`)
    }
  }

  console.log()
  console.log(`ℹ️  スキップ（設定済み）: ${results.skipped.length} 件`)
  console.log(BAR)

  if (!apply) {
    console.log()
    console.log('変更を適用するには: npm run image:assign-bulk -- --apply')
    console.log(BAR)
  }
}

main()
```

- [ ] **Step 2: 構文チェック**

```bash
cd ~/Desktop/aisoukai-media
node --check scripts/image-assign-bulk.mjs
```

期待: エラーなし（何も表示されなければOK）

---

### Task 2: `package.json` にスクリプトを追加する

**Files:**
- Modify: `package.json`

---

- [ ] **Step 1: `image:assign-bulk` スクリプトを追加する**

`package.json` の `"scripts"` ブロック内、`"image:assign": "node scripts/image-assign.mjs"` の直後に追加する：

```json
    "image:assign-bulk": "node scripts/image-assign-bulk.mjs",
```

- [ ] **Step 2: 確認**

```bash
cd ~/Desktop/aisoukai-media
npm run image:assign-bulk -- --help 2>&1 | head -5
```

期待: `DRY-RUN モード` のメッセージが表示される（--help は存在しないが dry-run で起動するため）

---

### Task 3: dry-run 実行・結果確認

**Files:**
- Run only（ファイル変更なし）

---

- [ ] **Step 1: dry-run で割当結果をプレビューする**

```bash
cd ~/Desktop/aisoukai-media
npm run image:assign-bulk 2>&1
```

期待:
- `✅ 割当対象: N 件` が表示される
- 各記事の割当予定 image-id が表示される
- `⚠️ 候補なし:` リストがあれば表示される（空でもOK）
- ファイルは変更されない

- [ ] **Step 2: 変更がないことを確認する**

```bash
cd ~/Desktop/aisoukai-media
git diff --name-only
```

期待: `content/posts/` のファイルが出力されない（dry-run のためファイル未変更）

---

### Task 4: --apply 実行・検証・コミット

**Files:**
- Modify: `content/posts/*.md`（image未設定の最大13件）
- Commit: `scripts/image-assign-bulk.mjs`, `package.json`, `content/posts/*.md`

---

- [ ] **Step 1: --apply で一括割当てを実行する**

```bash
cd ~/Desktop/aisoukai-media
npm run image:assign-bulk -- --apply 2>&1
```

期待: `✏️` マークで割当済み一覧が表示される

- [ ] **Step 2: `image:usage` を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run image:usage 2>&1 | tail -20
```

期待: 割当後の画像使用状況が表示される（エラーなし）

- [ ] **Step 3: `image:check` を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run image:check 2>&1 | tail -10
```

期待: エラーなし（既存の license 警告は許容）

- [ ] **Step 4: `validate:posts` を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run validate:posts 2>&1 | tail -5
```

期待: `✅ All posts valid (N 件)`

- [ ] **Step 5: `build` を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run build 2>&1 | tail -20
```

期待: ビルドエラーなし

- [ ] **Step 6: git status を確認してコミットする**

```bash
cd ~/Desktop/aisoukai-media && git status --short --branch
```

変更ファイルを確認したうえで、以下でコミットする：

```bash
cd ~/Desktop/aisoukai-media
git add scripts/image-assign-bulk.mjs package.json content/posts/
git commit -m "$(cat <<'EOF'
feat: image 未設定記事に一括画像割当

スコアリング（tokenize+scoreImage）でライブラリから最適画像を選択し、
image/image_alt を frontmatter に設定。候補なし時はカテゴリ fallback。
reviewed/draft 等の他フィールドは変更しない。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: コミット後の git status を確認する**

```bash
cd ~/Desktop/aisoukai-media && git status --short --branch
```

期待: `[ahead N]` のみ（未コミット変更なし）

---

## Self-Review チェック

**Spec coverage:**
- ✅ published / future / pending の全記事を対象 → `readdirSync(POSTS_DIR)` で全 `.md` を走査
- ✅ image 未設定記事を抽出 → `if (data.image)` でスキップ判定
- ✅ image-library から最適候補を選ぶ → `findBestImage()` でスコアリング
- ✅ 候補があれば image / image_alt を設定 → `apply` 時に `writeFileSync`
- ✅ 候補がなければカテゴリ fallback → `findBestImage` 内の `ARTICLE_CAT_TO_LIB_CAT` fallback
- ✅ fallback もなければ `results.noCandidate` に追加して一覧報告
- ✅ reviewed 状態は変更しない → `image` / `image_alt` のみ更新
- ✅ 本文・承認状態は変更しない → `matter.stringify(parsed.content, data)` で content 不変
- ✅ dry-run デフォルト → `--apply` フラグなしでは `writeFileSync` を呼ばない

**Placeholder scan:** なし

**Type consistency:** `findBestImage` の引数・返り値（`null` or image オブジェクト）は Task 1 の実装と一致。`normalizeDates` は gray-matter の Date 変換対策として image-assign.mjs と同一実装。
