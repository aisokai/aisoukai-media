# 画像運用 残タスク実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 画像購入後チェックリスト整備・bulk-template コマンド追加・image:usage 改善の 3 点を実施する。実画像購入・push・記事内容変更はしない。

**Architecture:** 既存スクリプト群（scripts/*.mjs）のパターンに合わせた最小追加。docs 更新 1 件、新規スクリプト 1 件、既存スクリプト改修 1 件、package.json 追記 1 件。

**Tech Stack:** Node.js ESM (`.mjs`)、gray-matter、JSON ファイル操作

---

## File Structure（変更対象）

| 操作 | パス | 内容 |
|------|------|------|
| 変更 | `docs/image-purchase-guide.md` | 「購入後チェックリスト」セクションを先頭に追加 |
| 新規作成 | `scripts/image-license-bulk-template.mjs` | TODO 画像を Markdown テーブルで出力するスクリプト |
| 変更 | `package.json` | `image:license:bulk-template` スクリプト追加 |
| 変更 | `scripts/image-usage.mjs` | ①代替画像警告 ②公開予定表示 ③共用画像の改善表示 |

**変更しないファイル:**
- 記事 (`content/posts/**`) — 本文・reviewed 状態変更禁止
- `data/image-library.json` — 実データ変更禁止（購入前）
- 他スクリプト（image-check, image-list など）

---

## Task 1: docs/image-purchase-guide.md に購入後チェックリストを追加する

**Files:**
- Modify: `docs/image-purchase-guide.md`

**背景:** 既存ファイルには「どの画像を買うか」のガイドはあるが、「買った後に何をするか」のフローがない。先頭に "購入後チェックリスト" セクションを追加する。

- [ ] **Step 1: ファイルの現在の先頭を確認する**

```bash
head -5 ~/Desktop/aisoukai-media/docs/image-purchase-guide.md
```

期待: `# 画像追加購入ガイド` で始まる

- [ ] **Step 2: 先頭に購入後チェックリストセクションを挿入する**

`docs/image-purchase-guide.md` の `# 画像追加購入ガイド` 見出しの直後（空行の後）に以下を挿入する:

```markdown
---

## ⚡ 購入後チェックリスト（Pixta 購入済み → 記事公開まで）

画像を Pixta で購入したら、以下の順番で作業する:

```
1. Pixta からダウンロードし、ファイルを保存する
   → public/images/library/inbox/ に配置

2. インポート確認（dry-run）
   npm run image:import-inbox -- --dry-run

3. インポート実行
   npm run image:import-inbox -- --apply

4. ライブラリ一覧を確認
   npm run image:list

5. カテゴリを整理する（general が残っている場合）
   npm run image:reclassify

6. ライセンス情報を入力する（購入日・プランを記入）
   npm run image:license:bulk-template   # → docs/license-bulk-template.md を確認し purchase_date と plan を埋める
   npm run image:license:update -- <image-id> --date YYYY-MM-DD --plan "シングルパック"

7. 画像候補を確認する
   npm run image:suggest -- <slug>

8. 記事に割り当てる
   npm run image:assign -- <slug> --image <image-id>

9. 整合性チェック
   npm run image:check

10. ビルド確認
    npm run build
```

> ライセンス情報を一括確認したい場合は `npm run image:license:bulk-template` を先に実行すると、
> 全 TODO 画像を Markdown テーブルで確認できます（`docs/license-bulk-template.md` に出力）。

---
```

- [ ] **Step 3: ファイルが正しく更新されたことを確認する**

```bash
grep -n "購入後チェックリスト" ~/Desktop/aisoukai-media/docs/image-purchase-guide.md
grep -n "image:import-inbox" ~/Desktop/aisoukai-media/docs/image-purchase-guide.md
```

期待: 両方がヒットする

---

## Task 2: image:license:bulk-template スクリプトを新規作成する

**Files:**
- Create: `scripts/image-license-bulk-template.mjs`
- Modify: `package.json`

**背景:** 39 件すべての license_note が TODO。1 件ずつ `image:license:update` を実行する前に、Human が一覧で購入日・プランを確認・記入しやすい Markdown テーブルを出力するコマンドを作る。

- [ ] **Step 4: scripts/image-license-bulk-template.mjs を作成する**

以下の内容で作成する:

```javascript
#!/usr/bin/env node
// image-license-bulk-template.mjs
// TODO が残る画像の license 情報を Markdown テーブルで出力する。
// Human が purchase_date と plan を埋めて image:license:update に使う。
// 読み取り専用 — data/ ファイルは変更しない。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')
const OUT_PATH     = join(ROOT, 'docs', 'license-bulk-template.md')

function isTodo(note) {
  if (!note || note.trim() === '') return true
  return note.includes('TODO')
}

function extractPixtaId(id) {
  const idx = id.indexOf('-')
  return idx >= 0 ? id.slice(idx + 1) : id
}

function main() {
  const argv    = process.argv.slice(2)
  const saveFile = !argv.includes('--stdout')
  const BAR = '═'.repeat(62)

  console.log(BAR)
  console.log('  image:license:bulk-template — TODO 画像一覧を出力')
  console.log(BAR)
  console.log()

  if (!existsSync(LIBRARY_PATH)) {
    console.error('エラー: data/image-library.json が見つかりません')
    process.exit(1)
  }

  let library
  try {
    library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
  } catch (e) {
    console.error(`パースエラー: ${e.message}`)
    process.exit(1)
  }

  const images = library.images ?? []
  const todos  = images.filter(img => isTodo(img.license_note))

  if (todos.length === 0) {
    console.log('  ✅ TODO の画像はありません（全件 license_note が入力済みです）')
    console.log(BAR)
    return
  }

  console.log(`  TODO 件数: ${todos.length} 件 / 全 ${images.length} 件`)
  console.log()

  // Markdown テーブル生成
  const today = new Date().toISOString().slice(0, 10)

  const lines = [
    `# license_note 一括入力テンプレート`,
    ``,
    `生成日: ${today}  `,
    `TODO 件数: ${todos.length} 件`,
    ``,
    `purchase_date と plan を埋めて、以下のコマンドで 1 件ずつ更新してください:`,
    `\`\`\``,
    `npm run image:license:update -- <image_id> --date YYYY-MM-DD --plan "シングルパック"`,
    `\`\`\``,
    ``,
    `---`,
    ``,
    `| image_id | pixta_id | category | path | current_note | purchase_date | plan |`,
    `|----------|----------|----------|------|--------------|---------------|------|`,
  ]

  for (const img of todos) {
    const pixtaId = extractPixtaId(img.id)
    const note    = (img.license_note ?? '').replace(/\|/g, '\\|')
    const path    = img.path.replace('/images/library/', '')
    lines.push(`| ${img.id} | ${pixtaId} | ${img.category} | ${path} | ${note} | （記入） | （記入） |`)
  }

  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`## plan 選択肢`)
  lines.push(``)
  lines.push(`- シングルパック`)
  lines.push(`- 定額プラン（月 XX 点）`)
  lines.push(`- 法人プラン`)
  lines.push(``)

  const content = lines.join('\n')

  if (saveFile) {
    writeFileSync(OUT_PATH, content, 'utf8')
    console.log(`  出力先: docs/license-bulk-template.md`)
    console.log()
    console.log('次のステップ:')
    console.log('  1. docs/license-bulk-template.md を開いて purchase_date と plan を記入する')
    console.log('  2. npm run image:license:update -- <image_id> --date YYYY-MM-DD --plan "プラン名"  # 1 件ずつ')
    console.log('  3. npm run image:license:list  — 残 TODO 件数を確認する')
  } else {
    console.log(content)
  }

  console.log()
  console.log(BAR)
}

main()
```

- [ ] **Step 5: package.json に image:license:bulk-template を追加する**

`package.json` の `"scripts"` 内の `"image:license:update"` 行の直後に以下を追加:

```json
    "image:license:bulk-template": "node scripts/image-license-bulk-template.mjs",
```

- [ ] **Step 6: 動作確認する**

```bash
cd ~/Desktop/aisoukai-media && node scripts/image-license-bulk-template.mjs 2>&1 | head -20
```

期待: `TODO 件数: 39 件` が表示され、`docs/license-bulk-template.md` が生成される

```bash
head -20 ~/Desktop/aisoukai-media/docs/license-bulk-template.md
```

期待: Markdown テーブルの先頭が確認できる（`| image_id | pixta_id |...` が含まれる）

---

## Task 3: image:usage を改善する

**Files:**
- Modify: `scripts/image-usage.mjs`

**改善 3 点:**

① **代替画像警告**: root-canal / periodontal / wisdom-tooth の記事が、そのカテゴリに対応しない画像（preventive など）を使っている場合に「⚠️ 代替画像使用中」を表示

② **公開予定ラベル**: 未割当記事・割当済み記事の両方で、今日以降の date を持つ記事に `[公開予定]` タグを表示

③ **共用画像のカテゴリ不一致表示改善**: 共用画像セクションで、代替使用中の記事に注記を追加

**カテゴリマッピング（定数として実装）:**
```javascript
const CATEGORY_MAP = {
  '根管治療': 'root-canal',
  '歯周病治療': 'periodontal',
  '親知らず': 'wisdom-tooth',
}
```

- [ ] **Step 7: image-usage.mjs を修正する**

現在のファイルを読み込み、以下の変更を加える:

**変更 1: カテゴリマッピング定数と isAltImage 関数を追加**（`const pathToId = ...` の前）:

```javascript
// 記事カテゴリ → 期待する画像カテゴリのマッピング
const CATEGORY_MAP = {
  '根管治療':  'root-canal',
  '歯周病治療': 'periodontal',
  '親知らず':  'wisdom-tooth',
}

// 記事の date と今日を比較して公開予定かどうかを判定する
const TODAY = new Date().toISOString().slice(0, 10)
function isUpcoming(dateStr) {
  return typeof dateStr === 'string' && dateStr > TODAY
}
```

**変更 2: images の path → category マップを追加**（`const pathToId = ...` の行の直後）:

```javascript
  const pathToCategory = new Map(images.map(img => [img.path, img.category]))
```

**変更 3: assigned.push の中に `altImage` フラグを追加**

```javascript
        assigned.push({
          slug,
          date:      data.date ?? '',
          title:     data.title ?? slug,
          category:  data.category ?? '',
          imagePath: imgPath,
          imageId,
          upcoming:  isUpcoming(data.date),
          altImage:  (() => {
            const expectedCat = CATEGORY_MAP[data.category ?? '']
            if (!expectedCat) return false
            const actualCat = pathToCategory.get(imgPath)
            return actualCat !== expectedCat
          })(),
        })
```

**変更 4: unassigned.push の中に `upcoming` フラグを追加**

```javascript
        unassigned.push({
          slug,
          date:     data.date ?? '',
          title:    data.title ?? slug,
          category: data.category ?? '',
          draft:    data.draft ?? false,
          reviewed: data.reviewed ?? false,
          upcoming: isUpcoming(data.date),
        })
```

**変更 5: altImage を集計して出力に追加**（`const shared = ...` の後）:

```javascript
  const altImages = assigned.filter(a => a.altImage)
```

**変更 6: サマリー行に altImage 件数を追加**

```javascript
  console.log(`  代替画像使用 : ${altImages.length} 件（専用カテゴリ画像なし）`)
```

**変更 7: assigned の各行に `[公開予定]` と `⚠️ 代替画像` バッジを追加**

```javascript
      const upcomingStr = a.upcoming ? '  [公開予定]' : ''
      const altStr      = a.altImage  ? '  ⚠️ 代替画像使用中' : ''
      console.log(`  [${a.date}] ${a.slug}${upcomingStr}${altStr}`)
      console.log(`    image-id: ${a.imageId}`)
      console.log(`    path    : ${shortPath}`)
      if (a.altImage) {
        const expectedCat = CATEGORY_MAP[a.category]
        console.log(`    ⚠️  category「${a.category}」の専用画像（${expectedCat}）がありません — 購入後に差し替えてください`)
      }
```

**変更 8: unassigned の各行に `[公開予定]` を追加**

```javascript
      const flags = []
      if (u.upcoming)  flags.push('公開予定')
      else if (u.reviewed) flags.push('reviewed')
      if (!u.draft)    flags.push('visible')
```

**変更 9: 代替画像サマリーセクションを追加**（`// ── 共用画像 ──` の前）:

```javascript
  // ── 代替画像使用中 ──
  if (altImages.length > 0) {
    console.log('⚠️  代替画像使用中の記事（専用カテゴリ画像購入後に差し替え推奨）:')
    console.log(DIV)
    for (const a of altImages) {
      const expectedCat = CATEGORY_MAP[a.category]
      const shortPath   = a.imagePath.replace('/images/library/', '')
      console.log(`  [${a.date}] ${a.slug}`)
      console.log(`    カテゴリ    : ${a.category}（専用: ${expectedCat}）`)
      console.log(`    使用中の画像: ${shortPath}（category: ${pathToCategory.get(a.imagePath) ?? '?'}）`)
      console.log(`    差し替え手順: npm run image:purchase:list → 購入 → npm run image:assign -- ${a.slug} --image <新image-id>`)
    }
    console.log(DIV)
    console.log()
  }
```

- [ ] **Step 8: node scripts/image-usage.mjs を実行して出力を確認する**

```bash
cd ~/Desktop/aisoukai-media && node scripts/image-usage.mjs 2>&1
```

期待（確認ポイント）:
- サマリーに `代替画像使用 : 3 件` が表示される
- `2026-02-05-root-canal` に `⚠️ 代替画像使用中` バッジが付く
- `2026-02-15-periodontal-disease` に `⚠️ 代替画像使用中` バッジが付く
- `2026-03-20-wisdom-tooth` に `⚠️ 代替画像使用中` バッジが付く
- 未割当記事に `公開予定` or `visible` フラグが表示される
- エラーなし

---

## Task 4: 最終検証・コミット

**Files:** なし（検証のみ）

- [ ] **Step 9: 各コマンドを実行して結果を確認する**

```bash
cd ~/Desktop/aisoukai-media
node scripts/image-list.mjs 2>&1 | tail -5
node scripts/image-license-list.mjs 2>&1 | head -15
node scripts/image-purchase-list.mjs 2>&1 | head -10
node scripts/image-usage.mjs 2>&1 | head -20
node scripts/image-check.mjs 2>&1 | tail -5
node scripts/validate-posts.mjs 2>&1 | tail -5
node scripts/status-content.mjs 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

期待: build が通る（`Compiled successfully` or `✓ Compiled`）

- [ ] **Step 10: 変更ファイルをコミットする（push しない）**

```bash
cd ~/Desktop/aisoukai-media && git add docs/image-purchase-guide.md scripts/image-license-bulk-template.mjs package.json scripts/image-usage.mjs docs/license-bulk-template.md docs/superpowers/plans/2026-05-13-image-ops-improvements.md && git commit -m "$(cat <<'EOF'
feat: 画像運用ツール改善（購入後チェックリスト・bulk-template・usage 警告）

- docs/image-purchase-guide.md: 購入後チェックリスト（10 ステップ）を先頭に追加
- scripts/image-license-bulk-template.mjs: TODO 画像を Markdown テーブルで出力する新規コマンド
- package.json: image:license:bulk-template スクリプト追加
- scripts/image-usage.mjs: ①代替画像使用警告 ②公開予定ラベル ③altImage 集計セクション追加

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: git status を確認する**

```bash
cd ~/Desktop/aisoukai-media && git status --short --branch
```

期待: `## main...origin/main [ahead 1]`

---

## Self-Review チェックリスト

### 1. Spec coverage

| 要件 | 対応タスク |
|------|-----------|
| 画像購入後チェックリスト（10 ステップ） | Task 1 |
| image:license:bulk-template コマンド追加 | Task 2 |
| CSV/Markdown で image_id/Pixta ID/category/path/note/date/plan 出力 | Task 2 |
| image:usage — 代替画像警告（root-canal/periodontal/wisdom-tooth） | Task 3 |
| image:usage — 公開予定記事の表示 | Task 3 |
| image:usage — 共用画像の表示改善 | Task 3（変更 9） |
| 最終検証（8 コマンド + build） | Task 4 |
| git commit（push なし） | Task 4 |

### 2. Placeholder なし

全ステップに具体的なコードと期待出力を記載済み。

### 3. 禁止事項の遵守

- 記事本文・reviewed 状態の変更なし
- git push なし
- data/image-library.json の実データ変更なし（bulk-template はファイル生成のみ）
- 自動 approve/publish なし
