# Auto Image Assign on Draft Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram 経由で下書き生成された記事に、image-library.json から最適な画像を自動割当て、frontmatter の `image` / `image_alt` を設定し、Telegram 通知に割当結果を含める。

**Architecture:** `telegram-ops.mjs` の `generateDraft()` 関数内に、`image-suggest.mjs` と同じスコアリングロジック（`tokenize` / `scoreImage`）をインライン実装する。スコア最大の画像を選択し、スコア 0 の場合はカテゴリ fallback（記事カテゴリ→ライブラリカテゴリのマッピング）で選ぶ。fallback も見つからなければ `image: ''` のまま維持する。

**Tech Stack:** Node.js ESM, gray-matter, `data/image-library.json`（既存ライブラリ）

---

## ファイル構成

| ファイル | 変更 | 内容 |
|---|---|---|
| `scripts/telegram-ops.mjs` | 修正 | 定数・関数追加・`generateDraft`修正・通知テキスト修正 |
| `data/image-library.json` | 読み取りのみ | 変更しない |

---

### Task 1: 定数・ユーティリティ関数を追加する

**Files:**
- Modify: `scripts/telegram-ops.mjs`（先頭定数ブロック + 定数直後）

---

- [ ] **Step 1: `LIBRARY_PATH` 定数を追加する**

`telegram-ops.mjs` の既存定数ブロック（`LOG_PATH` の直後）に追記する：

```js
const LIBRARY_PATH   = join(ROOT, 'data', 'image-library.json')
```

- [ ] **Step 2: 記事カテゴリ → ライブラリカテゴリのマッピングを追加する**

`LIBRARY_PATH` 定数の直後に挿入する：

```js
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
```

- [ ] **Step 3: `tokenize` / `scoreImage` / `findBestImage` を追加する**

`ARTICLE_CAT_TO_LIB_CAT` の直後に挿入する：

```js
// ── 画像自動割当ユーティリティ ────────────────────────────────────────────

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

// 最適な画像エントリを返す。候補なしなら null
function findBestImage({ images, title, category, excerpt, bodyContent }) {
  if (!images || images.length === 0) return null

  const articleText = [title, category, excerpt ?? '', bodyContent?.slice(0, 300) ?? ''].join(' ')
  const tokens = tokenize(articleText)

  const best = images
    .map((img) => ({ img, score: scoreImage(img, tokens) }))
    .sort((a, b) => b.score - a.score)[0]

  if (best && best.score > 0) return best.img

  // カテゴリ fallback
  const libCat = ARTICLE_CAT_TO_LIB_CAT[category] ?? 'general'
  return images.find((img) => img.category === libCat)
    ?? images.find((img) => img.category === 'general')
    ?? null
}
```

- [ ] **Step 4: 動作確認（ドライラン）**

```bash
cd ~/Desktop/aisoukai-media
node -e "
import('./scripts/telegram-ops.mjs').catch(e => console.error(e.message))
" 2>&1 | head -5
```

期待: エラーなし（mjs は import で読めないが、構文エラーがないことを node --check で確認する）

```bash
node --input-type=module <<'EOF'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const lib = JSON.parse(readFileSync(join(ROOT, 'data/image-library.json'), 'utf8'))
console.log('images:', lib.images.length)
EOF
```

期待: `images: <N>` が表示される（エラーなし）

---

### Task 2: `generateDraft` に画像自動割当を組み込む

**Files:**
- Modify: `scripts/telegram-ops.mjs` — `generateDraft` 関数（行 536〜551 付近の frontmatter 組み立て）

---

- [ ] **Step 1: ライブラリ読み込みと `findBestImage` 呼び出しを追加する**

`generateDraft` 関数内、`excerpt` を計算した直後・frontmatter オブジェクト組み立ての直前（行 535 付近）に挿入する：

```js
  // ── 画像自動割当 ─────────────────────────────────────────────────────────
  let assignedImageId  = ''
  let assignedImagePath = ''
  let assignedImageAlt  = ''

  if (existsSync(LIBRARY_PATH)) {
    try {
      const lib = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
      const best = findBestImage({
        images:      lib.images ?? [],
        title,
        category,
        excerpt,
        bodyContent,
      })
      if (best) {
        assignedImageId   = best.id
        assignedImagePath = best.path
        assignedImageAlt  = best.alt
      }
    } catch (e) {
      console.log(`    ⚠️ 画像自動割当スキップ（ライブラリ読込エラー）: ${e.message}`)
    }
  }
```

- [ ] **Step 2: frontmatter の `image` / `image_alt` を更新する**

同関数内、frontmatter オブジェクトの `image: ''` の行を以下に置き換える：

```js
    image:               assignedImagePath,
    image_alt:           assignedImageAlt,
```

（`image_alt` フィールドがなければ新規追加）

- [ ] **Step 3: 返り値に `assignedImageId` を追加する**

`generateDraft` 末尾の return 文を更新する：

```js
  return { ok: true, slug, category, filename, title, bodyContent, excerpt, aiUsed, assignedImageId }
```

---

### Task 3: Telegram 通知に割当画像 ID を表示する

**Files:**
- Modify: `scripts/telegram-ops.mjs` — 行 1192〜1212 付近の `replyText` 組み立て（build あり・なし両方）

---

- [ ] **Step 1: build あり（push 成功）の通知テキストを更新する**

```js
              // push 完了後に通知（本番 /admin/pending-review リンク）
              replyText = [
                `📝 ${result.title}`,
                ``,
                ...(result.assignedImageId ? [`🖼 割当画像: ${result.assignedImageId}`] : [`🖼 画像: 未割当（手動で設定してください）`]),
                ``,
                `下書きを確認する`,
                ...(reviewUrl ? [reviewUrl] : []),
                ``,
                `確認後「承認」で投稿できます`,
              ].join('\n')
```

- [ ] **Step 2: build なし（ローカル生成のみ）の通知テキストを更新する**

```js
            // --build なし: ローカル生成のみ、通知だけ送る
            replyText = [
              `📝 ${result.title}`,
              ``,
              ...(result.assignedImageId ? [`🖼 割当画像: ${result.assignedImageId}`] : [`🖼 画像: 未割当（手動で設定してください）`]),
              ``,
              `下書きを確認する`,
              ...(reviewUrl ? [reviewUrl] : []),
              ``,
              `確認後「承認」で投稿できます`,
            ].join('\n')
```

- [ ] **Step 3: push 失敗時の `replyText` は変更しない**

失敗時はエラーメッセージのみで良い。変更不要。

---

### Task 4: 検証・コミット

**Files:**
- Run: 各検証コマンド
- Modify: `scripts/telegram-ops.mjs`（git add 対象）

---

- [ ] **Step 1: `validate:posts` を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run validate:posts
```

期待: `✅ All posts valid (N 件)`

- [ ] **Step 2: `build` を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run build 2>&1 | tail -20
```

期待: `✓ Compiled successfully` または `Route` 一覧表示でエラーなし

- [ ] **Step 3: `image:check` を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run image:check
```

期待: エラーなし（既存の記事に影響がないことを確認）

- [ ] **Step 4: `telegram:ops --apply --build` のドライラン動作確認**

```bash
cd ~/Desktop/aisoukai-media && npm run telegram:ops -- --dry-run 2>&1 | head -30
```

期待: エラーなし

- [ ] **Step 5: git status を確認してコミットする**

```bash
cd ~/Desktop/aisoukai-media && git status --short --branch
git add scripts/telegram-ops.mjs
git commit -m "$(cat <<'EOF'
feat: draft 生成時に image-library から画像を自動割当

generateDraft() でスコアリング（tokenize+scoreImage）により最適画像を選択。
スコア 0 の場合はカテゴリ fallback を使用。候補なし時は image: '' を維持。
Telegram 通知に「割当画像: <id>」を追加。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review チェック

**Spec coverage:**
- ✅ image-library から候補画像を選ぶ → Task 1 (tokenize/scoreImage/findBestImage)
- ✅ title / category / excerpt / body を元に判定 → Task 2 Step 1
- ✅ 最上位候補を image / image_alt に設定 → Task 2 Step 2
- ✅ 候補なし時はカテゴリ fallback → Task 1 Step 3 (findBestImage 内)
- ✅ fallback もなければ `image: ''` を維持 → Task 1 Step 3 (return null → assignedImagePath = '')
- ✅ Telegram 通知に「割当画像: <id>」 → Task 3
- ✅ validate:posts / image:check / build が通ること → Task 4
- ✅ 自動approve/publishの挙動は変えない → `reviewed`/`draft` フィールドには一切触れない

**Placeholder scan:** なし

**Type consistency:** `assignedImageId` は Task 2 Step 3 の返り値に追加し、Task 3 で `result.assignedImageId` として参照。一致。
