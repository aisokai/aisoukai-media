# Image Deduplication — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自動画像割当で同じ画像が重複使用される問題を、`usedImages` ペナルティと `--reassign` フラグで修正し、既存重複記事を再割当てする。

**Architecture:** `findBestImage` に `usedImages: Set<string>` 引数を追加してペナルティを適用する（既使用 → スコア -1000、fallback でも未使用優先）。`image-assign-bulk.mjs` に `--reassign` フラグを追加して重複使用中の記事を再割当対象にする（2パス処理）。`image-suggest.mjs` では同様に既使用画像を後順表示。`image-usage.mjs` では重複3件以上を `❌` で警告し不足カテゴリを報告する。

**Tech Stack:** Node.js ESM, gray-matter, `data/image-library.json`（読み取りのみ）

---

## 現状データ（調査済み）

**重複画像:**
| image-id | 件数 | カテゴリ |
|---|---|---|
| general-34431025 | 7件 | cavity |
| general-34130816 | 5件 | preventive |
| general-33802476 | 2件 | preventive |
| general-33802469 | 2件 | preventive |

**不足カテゴリ（ライブラリに専用画像なし）:**
- 根管治療 → root-canal なし → preventive fallback
- 歯周病治療 → periodontal なし → general fallback
- 親知らず → wisdom-tooth なし → general fallback
- その他 → general 3件 < 記事8件（一部重複は不可避）

**ライブラリ画像数:**
- preventive: 21 / pediatric: 7 / cavity: 4 / general: 3 / announcement: 2 / implant: 2

---

## ファイル構成

| ファイル | 変更 | 内容 |
|---|---|---|
| `scripts/image-assign-bulk.mjs` | 修正 | `findBestImage` ペナルティ追加・`getImageId` 追加・`--reassign` フラグ追加・2パス処理 |
| `scripts/telegram-ops.mjs` | 修正 | `findBestImage` ペナルティ追加・`generateDraft` で既存記事の `usedImages` を渡す |
| `scripts/image-suggest.mjs` | 修正 | スコアリングに既使用ペナルティ追加・表示に「既に使用中」注記 |
| `scripts/image-usage.mjs` | 修正 | 重複3件以上を `❌` 警告・不足カテゴリ報告を追加 |
| `content/posts/*.md` | 修正 | `--reassign --apply` で重複記事を再割当 |

---

### Task 1: `image-assign-bulk.mjs` — `findBestImage` ペナルティ + `--reassign` フラグ

**Files:**
- Modify: `scripts/image-assign-bulk.mjs`

---

- [ ] **Step 1: `getImageId` ヘルパーを追加する**

`findBestImage` 関数の直前に挿入する：

```js
// 記事の image パスから image-library の ID を引く
function getImageId(imagePath, lib) {
  if (!imagePath) return null
  return (lib.images ?? []).find((img) => img.path === imagePath)?.id ?? null
}
```

- [ ] **Step 2: `findBestImage` に `usedImages` ペナルティを追加する**

既存の `findBestImage` 関数全体を以下に置き換える：

```js
function findBestImage({ images, title, category, excerpt, bodyContent, usedImages = new Set() }) {
  if (!images || images.length === 0) return null
  const articleText = [title, category, excerpt ?? '', bodyContent?.slice(0, 300) ?? ''].join(' ')
  const tokens = tokenize(articleText)
  const scored = images
    .map((img) => ({
      img,
      score: scoreImage(img, tokens) + (usedImages.has(img.id) ? -1000 : 0),
    }))
    .sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (best && best.score > 0) return best.img
  // カテゴリ fallback（未使用優先、不足時は使用済みも許容）
  const libCat = ARTICLE_CAT_TO_LIB_CAT[category] ?? 'general'
  return (
    images.find((img) => img.category === libCat   && !usedImages.has(img.id)) ??
    images.find((img) => img.category === 'general' && !usedImages.has(img.id)) ??
    images.find((img) => img.category === libCat) ??
    images.find((img) => img.category === 'general') ??
    null
  )
}
```

- [ ] **Step 3: `main()` に `--reassign` フラグと2パス処理を追加する**

`main()` 関数全体を以下に置き換える：

```js
function main() {
  const apply    = process.argv.includes('--apply')
  const reassign = process.argv.includes('--reassign')

  const BAR = '━'.repeat(64)
  const DIV = '─'.repeat(64)
  console.log(BAR)
  console.log(`image 一括割当 ${apply ? '【APPLY モード】' : '【DRY-RUN モード（--apply で書き込み）】'}${reassign ? ' + 重複再割当' : ''}`)
  console.log(BAR)

  if (!existsSync(LIBRARY_PATH)) {
    console.error('エラー: data/image-library.json が見つかりません')
    process.exit(1)
  }
  let lib
  try {
    lib = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
  } catch (e) {
    console.error(`エラー: data/image-library.json の読み込みに失敗しました: ${e.message}`)
    process.exit(1)
  }
  const images = lib.images ?? []

  const files = readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()

  // ── Pass 1: 重複画像IDを特定（--reassign 時のみ）────────────────────────
  const duplicateIds = new Set()
  if (reassign) {
    const imageCount = {}
    for (const filename of files) {
      try {
        const { data } = matter(readFileSync(join(POSTS_DIR, filename), 'utf8'))
        const imgId = getImageId(data.image, lib)
        if (imgId) imageCount[imgId] = (imageCount[imgId] ?? 0) + 1
      } catch {}
    }
    for (const [id, count] of Object.entries(imageCount)) {
      if (count > 1) duplicateIds.add(id)
    }
    console.log(`  重複画像: ${duplicateIds.size} 種類 → 使用記事を再割当対象にします`)
  }

  // ── Pass 2: 非重複画像を usedImages に確保 ───────────────────────────────
  const usedImages = new Set()
  for (const filename of files) {
    try {
      const { data } = matter(readFileSync(join(POSTS_DIR, filename), 'utf8'))
      const imgId = getImageId(data.image, lib)
      if (imgId && !duplicateIds.has(imgId)) usedImages.add(imgId)
    } catch {}
  }

  const results = { assigned: [], noCandidate: [], skipped: [] }

  // ── Pass 3: メイン処理 ───────────────────────────────────────────────────
  for (const filename of files) {
    const filePath = join(POSTS_DIR, filename)
    let parsed, data
    try {
      const raw = readFileSync(filePath, 'utf8')
      parsed    = matter(raw)
      data      = normalizeDates(parsed.data)
    } catch (e) {
      console.log(`  ⚠️ スキップ（読み込みエラー）: ${filename} — ${e.message}`)
      continue
    }

    if (data.image) {
      const imgId      = getImageId(data.image, lib)
      const isDuplicate = imgId && duplicateIds.has(imgId)
      if (!reassign || !isDuplicate) {
        results.skipped.push({ filename, imageId: imgId ?? data.image })
        continue
      }
      // reassign && isDuplicate → 再割当対象（usedImages には追加しない）
    }

    const best = findBestImage({
      images,
      title:       data.title ?? '',
      category:    data.category ?? '',
      excerpt:     data.excerpt ?? data.description ?? '',
      bodyContent: parsed.content,
      usedImages,
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
      wasSet:    !!data.image,
    })
    usedImages.add(best.id)

    if (apply) {
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
    const mark  = apply ? '✏️' : '📋'
    const label = r.wasSet ? ' [再割当]' : ''
    console.log(`${mark}${label} ${r.filename}`)
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
  console.log(`ℹ️  スキップ（設定済み・非重複）: ${results.skipped.length} 件`)
  console.log(BAR)

  if (!apply) {
    console.log()
    console.log('変更を適用するには: npm run image:assign-bulk -- --apply [--reassign]')
    console.log(BAR)
  }
}
```

- [ ] **Step 4: 構文チェック**

```bash
cd ~/Desktop/aisoukai-media
node --check scripts/image-assign-bulk.mjs
```

期待: エラーなし

---

### Task 2: `telegram-ops.mjs` — `findBestImage` ペナルティ + 既存 `usedImages` を渡す

**Files:**
- Modify: `scripts/telegram-ops.mjs`

---

- [ ] **Step 1: `findBestImage` 関数を置き換える**

`telegram-ops.mjs` 内の既存 `findBestImage` 関数（`// 最適な画像エントリを返す。候補なしなら null` コメントから始まる関数）を以下に置き換える：

```js
// 最適な画像エントリを返す。候補なしなら null
function findBestImage({ images, title, category, excerpt, bodyContent, usedImages = new Set() }) {
  if (!images || images.length === 0) return null
  const articleText = [title, category, excerpt ?? '', bodyContent?.slice(0, 300) ?? ''].join(' ')
  const tokens = tokenize(articleText)
  const scored = images
    .map((img) => ({
      img,
      score: scoreImage(img, tokens) + (usedImages.has(img.id) ? -1000 : 0),
    }))
    .sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (best && best.score > 0) return best.img
  const libCat = ARTICLE_CAT_TO_LIB_CAT[category] ?? 'general'
  return (
    images.find((img) => img.category === libCat   && !usedImages.has(img.id)) ??
    images.find((img) => img.category === 'general' && !usedImages.has(img.id)) ??
    images.find((img) => img.category === libCat) ??
    images.find((img) => img.category === 'general') ??
    null
  )
}
```

- [ ] **Step 2: `generateDraft` 内の画像割当ブロックを更新する**

`generateDraft` 内の `// ── 画像自動割当 ────` ブロック（`if (existsSync(LIBRARY_PATH))` の部分）を以下に置き換える：

```js
  // ── 画像自動割当 ─────────────────────────────────────────────────────────
  let assignedImageId   = ''
  let assignedImagePath = ''
  let assignedImageAlt  = ''

  if (existsSync(LIBRARY_PATH)) {
    try {
      const lib = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))

      // 既存記事で使用中の画像IDを収集（重複割当を避ける）
      const usedImages = new Set()
      for (const f of readdirSync(POSTS_DIR).filter((fn) => fn.endsWith('.md'))) {
        try {
          const { data: pd } = matter(readFileSync(join(POSTS_DIR, f), 'utf8'))
          const imgId = (lib.images ?? []).find((img) => img.path === pd.image)?.id
          if (imgId) usedImages.add(imgId)
        } catch {}
      }

      const best = findBestImage({
        images:      lib.images ?? [],
        title,
        category,
        excerpt,
        bodyContent,
        usedImages,
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

- [ ] **Step 3: 構文チェック**

```bash
cd ~/Desktop/aisoukai-media
node --check scripts/telegram-ops.mjs
```

期待: エラーなし

---

### Task 3: `image-suggest.mjs` — 既使用ペナルティ + 表示改善

**Files:**
- Modify: `scripts/image-suggest.mjs`

---

- [ ] **Step 1: `main()` に既使用画像の収集ロジックを追加する**

`image-suggest.mjs` の `main()` 内で `const articleTokens = tokenize(articleText)` を定義した行の直後に以下を挿入する：

```js
  // 他記事で使用中の画像IDを収集
  const usedImages = new Set()
  for (const pf of readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))) {
    if (pf === filename) continue  // 対象記事自身はスキップ
    try {
      const { data: pd } = matter(readFileSync(join(POSTS_DIR, pf), 'utf8'))
      const imgId = images.find((img) => img.path === pd.image)?.id
      if (imgId) usedImages.add(imgId)
    } catch {}
  }
```

`readdirSync` は `image-suggest.mjs` にまだインポートされていないので、ファイル先頭の import を更新する。現状：

```js
import { existsSync, readFileSync } from 'node:fs'
```

更新後：

```js
import { existsSync, readFileSync, readdirSync } from 'node:fs'
```

- [ ] **Step 2: スコアリングに既使用ペナルティと注記フラグを追加する**

既存の `scored` 計算部分を以下に置き換える：

```js
  // スコアリング・ソート・上位5件（既使用画像をペナルティで後順に）
  const scored = images
    .map((img) => ({
      img,
      score:       scoreImage(img, articleTokens),
      alreadyUsed: usedImages.has(img.id),
    }))
    .sort((a, b) => {
      if (a.alreadyUsed !== b.alreadyUsed) return a.alreadyUsed ? 1 : -1
      return b.score - a.score
    })
    .slice(0, 5)

  const candidates = scored.filter(({ score }) => score > 0 || alreadyUsed === false)
```

待って、これは誤り。`alreadyUsed` は `scored` 要素のプロパティ。以下が正しい：

```js
  const scored = images
    .map((img) => ({
      img,
      score:       scoreImage(img, articleTokens),
      alreadyUsed: usedImages.has(img.id),
    }))
    .sort((a, b) => {
      if (a.alreadyUsed !== b.alreadyUsed) return a.alreadyUsed ? 1 : -1
      return b.score - a.score
    })
    .slice(0, 5)

  const candidates = scored.filter(({ score }) => score > 0)
```

- [ ] **Step 3: 表示に「既に使用中」を追加する**

候補表示のループを以下に更新する（`割当` 行の前後に追記）：

```js
  for (const [i, { img, score, alreadyUsed }] of candidates.entries()) {
    console.log(`${i + 1}. [${img.id}]  スコア: ${score.toFixed(1)}${alreadyUsed ? '  ⚠️ 他記事で使用中' : ''}`)
    console.log(`   path    : ${img.path}`)
    console.log(`   alt     : ${img.alt}`)
    console.log(`   tags    : ${(img.tags ?? []).join(' / ')}`)
    console.log(`   source  : ${img.license_source ?? ''}`)
    console.log(`   割当    : npm run image:assign -- ${slugInput} --image ${img.id}`)
    if (i < candidates.length - 1) console.log()
  }
```

- [ ] **Step 4: 構文チェック**

```bash
cd ~/Desktop/aisoukai-media
node --check scripts/image-suggest.mjs
```

期待: エラーなし

---

### Task 4: `image-usage.mjs` — 重複警告強化 + 不足カテゴリ報告

**Files:**
- Modify: `scripts/image-usage.mjs`

---

- [ ] **Step 1: 共用画像の警告レベルを改善する**

`scripts/image-usage.mjs` を読み込み、共用画像セクションを確認する：

```bash
cd ~/Desktop/aisoukai-media && sed -n '160,190p' scripts/image-usage.mjs
```

共用画像を表示しているループ内（`for (const [imgPath, articles] of shared)` または類似の箇所）で、使用件数が3件以上の場合に `❌` を表示するよう変更する。

現状のセクション冒頭（`ℹ️  複数記事で共用されている画像:` の行）を以下に変更する：

```js
  // 重複件数 3件以上は ❌、それ以外は ℹ️
  const severeShared = shared.filter(([, arts]) => arts.length >= 3)
  const minorShared  = shared.filter(([, arts]) => arts.length < 3)

  if (severeShared.length > 0) {
    console.log()
    console.log('❌  重複過多（3件以上）— 再割当を推奨:')
    console.log(DIV)
    for (const [imgPath, arts] of severeShared) {
      const imgId = arts[0]?.imageId ?? imgPath
      console.log(`  ${imgId}`)
      console.log(`    path   : ${imgPath}`)
      console.log(`    使用記事: ${arts.length} 件`)
      for (const a of arts) console.log(`      - ${a.slug}`)
      console.log(`    再割当  : npm run image:assign-bulk -- --reassign --apply`)
    }
  }

  if (minorShared.length > 0) {
    console.log()
    console.log('ℹ️  共用画像（2件）— 許容範囲:')
    console.log(DIV)
    for (const [imgPath, arts] of minorShared) {
      const imgId = arts[0]?.imageId ?? imgPath
      console.log(`  ${imgId}`)
      console.log(`    path   : ${imgPath}`)
      console.log(`    使用記事: ${arts.length} 件`)
      for (const a of arts) console.log(`      - ${a.slug}`)
    }
  }
```

> **注意:** `image-usage.mjs` の `shared` 変数の型・キー名を確認してから実装する。まず `sed -n '80,185p' scripts/image-usage.mjs` で全体構造を把握すること。

- [ ] **Step 2: 不足カテゴリ報告セクションを追加する**

末尾の区切り線（`BAR`）の直前に以下を挿入する：

```js
  // ── 不足カテゴリ報告 ──────────────────────────────────────────────────────
  // 記事カテゴリ → 期待するライブラリカテゴリ
  const CAT_MAP = {
    '根管治療':    'root-canal',
    '歯周病治療':  'periodontal',
    '親知らず':    'wisdom-tooth',
    '虫歯治療':    'cavity',
    '予防歯科':    'preventive',
    'インプラント': 'implant',
    '小児歯科':    'pediatric',
    'お知らせ':    'announcement',
  }
  const libCategories = new Set((library.images ?? []).map((img) => img.category))
  const articleCatCount = {}
  for (const a of assignments) {
    articleCatCount[a.category] = (articleCatCount[a.category] ?? 0) + 1
  }
  const shortages = []
  for (const [artCat, libCat] of Object.entries(CAT_MAP)) {
    if (!libCategories.has(libCat)) {
      shortages.push({ artCat, libCat, count: articleCatCount[artCat] ?? 0, reason: '専用カテゴリ画像なし' })
    }
  }
  // 汎用カテゴリ（general）不足チェック
  const otherCount   = articleCatCount['その他'] ?? 0
  const generalCount = (library.images ?? []).filter((img) => img.category === 'general').length
  if (otherCount > generalCount) {
    shortages.push({ artCat: 'その他', libCat: 'general', count: otherCount, reason: `general 画像 ${generalCount} 件 < 記事 ${otherCount} 件（重複不可避）` })
  }

  if (shortages.length > 0) {
    console.log()
    console.log('⚠️  画像不足カテゴリ（購入推奨）:')
    console.log(DIV)
    for (const s of shortages) {
      if (s.count === 0) continue
      console.log(`  ${s.artCat}（${s.count} 件）→ ${s.reason}`)
    }
  }
```

> **注意:** `image-usage.mjs` の変数名（`library`, `assignments` など）を確認してから実装する。`sed -n '1,100p' scripts/image-usage.mjs` で確認すること。

- [ ] **Step 3: 構文チェック**

```bash
cd ~/Desktop/aisoukai-media
node --check scripts/image-usage.mjs
```

期待: エラーなし

---

### Task 5: 既存重複の再割当 + 検証 + コミット

**Files:**
- Run: 各検証コマンド
- Modify: `content/posts/*.md`（重複記事の再割当）
- Commit: 全変更ファイル

---

- [ ] **Step 1: dry-run で再割当予定を確認する**

```bash
cd ~/Desktop/aisoukai-media
npm run image:assign-bulk -- --reassign 2>&1
```

期待: 重複記事が `[再割当]` ラベルで表示される。ファイルは変更されない。

- [ ] **Step 2: --apply で再割当を実行する**

```bash
cd ~/Desktop/aisoukai-media
npm run image:assign-bulk -- --reassign --apply 2>&1
```

期待: `✏️ [再割当]` マークで割当済み一覧が表示される。

- [ ] **Step 3: validate:posts を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run validate:posts 2>&1 | tail -5
```

期待: `✅ All posts valid (N 件)`

- [ ] **Step 4: image:usage を実行して重複状況を確認する**

```bash
cd ~/Desktop/aisoukai-media && npm run image:usage 2>&1 | tail -40
```

期待: `general-34431025` の使用件数が大幅に減少している。不足カテゴリが表示される。

- [ ] **Step 5: image:check を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run image:check 2>&1 | tail -10
```

期待: エラーなし

- [ ] **Step 6: build を実行する**

```bash
cd ~/Desktop/aisoukai-media && npm run build 2>&1 | tail -15
```

期待: ビルドエラーなし

- [ ] **Step 7: コミットする**

```bash
cd ~/Desktop/aisoukai-media
git add scripts/image-assign-bulk.mjs scripts/telegram-ops.mjs scripts/image-suggest.mjs scripts/image-usage.mjs content/posts/
git commit -m "$(cat <<'EOF'
fix: 画像重複割当を抑制（usedImages ペナルティ + --reassign）

findBestImage に usedImages ペナルティ（-1000）を追加し既使用画像を後順化。
image-assign-bulk に --reassign フラグを追加して重複記事を再割当。
image-suggest に「他記事で使用中」注記を追加。
image-usage に重複3件以上の ❌ 警告と不足カテゴリ報告を追加。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: git status を確認する**

```bash
cd ~/Desktop/aisoukai-media && git status --short --branch
```

---

## Self-Review チェック

**Spec coverage:**
- ✅ image:suggest / auto-assign で既使用画像の優先度を下げる → Task 1–3 の `findBestImage` ペナルティ
- ✅ 同一カテゴリ内で連続使用しない → `usedImages` 蓄積により次の記事では別画像を優先
- ✅ image:usage で重複画像を警告 → Task 4（❌ で3件以上を強調）
- ✅ 既存記事の重複画像を再割当 → Task 5（`--reassign --apply`）
- ✅ 画像候補不足カテゴリを報告 → Task 4（不足カテゴリ報告セクション）
- ✅ 候補不足時はカテゴリfallback → `findBestImage` の fallback chain（未使用優先→使用済み許容）

**Placeholder scan:** Task 4 の `image-usage.mjs` 修正で「変数名を確認してから実装する」という注意書きを含む。これは確認必須の指示であり、TBD ではない。

**Type consistency:**
- `usedImages: Set<string>` — Task 1, 2, 3 すべてで `Set` として扱い `has(img.id)` でチェック。一致。
- `getImageId(imagePath, lib)` — Task 1 で定義。Task 1 の main() 内でのみ使用。一致。
- `alreadyUsed: boolean` — Task 3 の `scored` 配列要素のプロパティ。表示ループで `alreadyUsed` として参照。一致。
