# pending-review 本文プレビュー実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/pending-review` の各記事カードに Markdown → HTML 変換した本文プレビューを追加し、「本文を開く/閉じる」ボタンでトグルできるようにする。

**Architecture:** `getPendingReviewPosts()` を async 化して `contentHtml` を追加。新規 `PostBodyPreview.tsx`（Client Component）がトグルUIを担当。`page.tsx` は async Server Component として本文を各カードに組み込む。

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, remark + remark-html（既存依存）

**セキュリティ:** HTML レンダリングには既存の `remark().use(remarkHtml, { sanitize: true })` パターンを使用する。`content/posts/*.md` は管理者のみ編集可能。XSS リスクは既存の `blog/[slug]/page.tsx` と同等（既に同じ処理が存在）。

---

## ファイル構成

| 操作 | ファイル | 変更内容 |
|------|----------|----------|
| 修正 | `src/lib/posts.ts` | `PendingReviewPost` に `contentHtml` 追加、`getPendingReviewPosts()` を async 化 |
| 新規作成 | `src/app/admin/pending-review/PostBodyPreview.tsx` | 「本文を開く/閉じる」Client Component |
| 修正 | `src/app/admin/pending-review/page.tsx` | async 化 + PostBodyPreview 組み込み |

---

## Task 1: posts.ts — PendingReviewPost に contentHtml を追加して async 化

**Files:**
- Modify: `src/lib/posts.ts:90-133`

### 変更内容

`PendingReviewPost` 型の `rejectionReason?` の前に `contentHtml: string` フィールドを追加する。

`getPendingReviewPosts()` は以下のように変更する:
- `async function` にする
- 戻り型を `Promise<PendingReviewPost[]>` にする
- ファイルの二重読み込みを廃止して1回のパスで filter + map する
- `Promise.all` で各ファイルを並列処理する
- `remark().use(remarkHtml, { sanitize: true })` で本文を HTML に変換する（既存の `getPostBySlug` と同じ処理）

- [ ] **Step 1: `PendingReviewPost` 型に `contentHtml` を追加する**

`src/lib/posts.ts` の 90〜99 行目の型定義を読み、`rejectionReason?: string` の直前に `contentHtml: string;` を1行 Edit で追加する。

変更後の型:
```
export type PendingReviewPost = {
  slug: string;
  title: string;
  date: string;
  publishAt?: string;
  category: string;
  aiGenerated: boolean;
  excerpt: string;
  contentHtml: string;       ← ここを追加
  rejectionReason?: string;
};
```

- [ ] **Step 2: `getPendingReviewPosts()` 関数を async 化して contentHtml を含める**

`src/lib/posts.ts` の `getPendingReviewPosts()` 関数全体（107〜133行目）を以下の実装に置き換える:

関数シグネチャ: `export async function getPendingReviewPosts(): Promise<PendingReviewPost[]>`

処理内容:
1. `POSTS_DIR` が存在しなければ空配列を返す
2. `fs.readdirSync(POSTS_DIR)` で `.md` ファイル一覧を取得
3. `Promise.all` で各ファイルを並列処理:
   - `matter(fs.readFileSync(fullPath, 'utf8'))` で `{ data, content }` を取得
   - `data['reviewed'] === true` なら `null` を返す（フィルタ）
   - `remark().use(remarkHtml, { sanitize: true }).process(content)` で HTML 変換
   - `PendingReviewPost` オブジェクトを返す（contentHtml: processed.toString()）
4. `results.filter(Boolean)` で null を除去
5. `sort((a, b) => a.date < b.date ? 1 : -1)` で日付降順ソート

- [ ] **Step 3: TypeScript 型チェックで問題がないか確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

期待: `page.tsx` で `getPendingReviewPosts()` の await 忘れによるエラーが出る（Task 3 で修正）。`posts.ts` 自体のエラーは出ないことを確認する。

---

## Task 2: PostBodyPreview.tsx を新規作成

**Files:**
- Create: `src/app/admin/pending-review/PostBodyPreview.tsx`

実装要件:
- `'use client'` ディレクティブ（Client Component）
- Props: `{ contentHtml: string }`
- `useState(false)` でトグル状態を管理
- ボタン: `type="button"` で `onClick={() => setOpen((v) => !v)}`
- ボタンラベル: 閉じているとき「本文を開く ▼」、開いているとき「本文を閉じる ▲」
- 展開エリア: `max-h-[60vh] overflow-y-auto` でスクロール可能に制限（スマホ対応）
- HTML レンダリング: remark-html(sanitize:true) 処理済みの HTML を表示する（既存 blog ページと同じパターン）
- テキストスタイル: `text-sm leading-relaxed text-gray-700` をベースに、Tailwind v4 の `[&_h2]:` 構文でネスト要素にスタイルを適用する

Tailwind スタイル詳細（展開エリアの className に設定）:
- ベース: `mt-3 max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-700`
- h2: `[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-800`
- h3: `[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-700`
- p: `[&_p]:mb-3`
- ul/ol: `[&_ul]:mb-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:ml-5 [&_ol]:list-decimal`
- li: `[&_li]:mb-1`
- strong: `[&_strong]:font-semibold [&_strong]:text-gray-800`
- code: `[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:text-xs`

ボタンスタイル:
- `flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 active:bg-gray-100`

- [ ] **Step 1: `PostBodyPreview.tsx` を Write で作成する**

ファイルパス: `~/Desktop/aisoukai-media/src/app/admin/pending-review/PostBodyPreview.tsx`

上記の仕様に従って実装する。

- [ ] **Step 2: 構文チェック**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | grep PostBodyPreview
```

期待: `PostBodyPreview` に関するエラーなし

---

## Task 3: page.tsx を async 化して PostBodyPreview を組み込む

**Files:**
- Modify: `src/app/admin/pending-review/page.tsx`

3 箇所の変更を行う:

**変更1:** `import CopyButton from './CopyButton'` の後に `import PostBodyPreview from './PostBodyPreview'` を追加

**変更2:** `export default function PendingReviewPage()` を `export default async function PendingReviewPage()` に変更し、`const allPosts = getPendingReviewPosts()` を `const allPosts = await getPendingReviewPosts()` に変更

**変更3:** excerpt 表示ブロック（`{/* excerpt */}` コメントの直後）の閉じ括弧 `)}` の後ろに以下を追加:

```
                  {/* 本文プレビュー */}
                  {post.contentHtml && (
                    <PostBodyPreview contentHtml={post.contentHtml} />
                  )}
```

- [ ] **Step 1: 変更1（import追加）を Edit で適用**

- [ ] **Step 2: 変更2（async + await）を Edit で適用**

- [ ] **Step 3: 変更3（PostBodyPreview 追加）を Edit で適用**

- [ ] **Step 4: TypeScript 型チェックでエラーなしを確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1
```

期待: 出力なし（エラーなし）

---

## Task 4: 検証とコミット

- [ ] **Step 1: validate:posts を実行**

```bash
cd ~/Desktop/aisoukai-media && npm run validate:posts
```

- [ ] **Step 2: build を実行**

```bash
cd ~/Desktop/aisoukai-media && npm run build 2>&1 | tail -30
```

期待: ビルド成功

- [ ] **Step 3: コミットを作成**

変更対象:
- `src/lib/posts.ts`
- `src/app/admin/pending-review/PostBodyPreview.tsx`
- `src/app/admin/pending-review/page.tsx`

コミットメッセージ:
```
feat: add body preview to pending-review admin page
```

- [ ] **Step 4: git status --short --branch を確認**

---

## 自己レビュー

### Spec カバレッジチェック

| 要件 | 対応タスク |
|------|-----------|
| pending-review の各記事カードに本文プレビューを表示 | Task 3（PostBodyPreview 組み込み） |
| 本文冒頭 800〜1200字を表示 | Task 1（全文 contentHtml）+ Task 2（max-h-[60vh] スクロール） |
| 「本文を開く / 閉じる」ボタン | Task 2（useState toggle） |
| スマホ表示で読みやすい | Task 2（leading-relaxed, text-sm, max-h overflow-y-auto, スタイル） |
| approve/reject の仕組みは変えない | Task 3（コマンドエリアは無変更） |
| npm run validate:posts | Task 4 Step 1 |
| npm run build | Task 4 Step 2 |

### 注意点
- `getPendingReviewPosts()` を async 化することで呼び出し元の `page.tsx` も async 化が必要。Next.js App Router は async Server Component を完全サポートしている。
- HTML レンダリングは `remark-html(sanitize: true)` 処理済みのコンテンツのみ。既存 `blog/[slug]/page.tsx` で使われている同じパターン。
- Tailwind v4 の `[&_selector]:` 構文はこのプロジェクトで使用可能（tailwindcss v4 で対応）。
