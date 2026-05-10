# ブログ自動更新 Phase 1 計画書

最終更新: 2026-05-11

---

## 概要

三谷ファミリー歯科クリニックの歯科メディアサイト（aisoukai-media）において、記事を継続的・半自動的に追加・公開できる仕組みを段階的に構築する。

---

## フェーズ構成

```
Phase 1（現在）  : 手動 Markdown 追加 + ローカルビルド確認
Phase 2（次期）  : AI 記事ドラフト生成 + Humanレビュー + push
Phase 3（将来）  : 予約投稿 + 定期更新 + CI/CD 連携
```

---

## Phase 1: 手動フロー（現在）

### 記事追加の標準手順

```
1. テーマ・カテゴリ決定
   └─ blog-article-schema.md のカテゴリ一覧を参照

2. slug を決定
   └─ YYYY-MM-DD-{topic}.md 形式
   └─ 重複チェック: ls content/posts/ | grep topic

3. Markdown ファイル作成
   └─ content/posts/{slug}.md に frontmatter + 本文を書く

4. ビルド前チェック（後述）

5. ローカル確認
   └─ npm run dev でブラウザ確認
   └─ /blog/{slug} が 200 で表示されること

6. npm run build 確認
   └─ エラーなし・全ルート静的生成を確認

7. デプロイ（将来: push → CI/CD）
```

### ビルド前チェックコマンド

```bash
# 1. frontmatter 必須フィールドが揃っているか
grep -L "^title:" content/posts/*.md
grep -L "^date:" content/posts/*.md
grep -L "^category:" content/posts/*.md

# 2. スラグ重複確認（ファイル名で確認）
ls content/posts/ | sort | uniq -d

# 3. 日付形式確認（YYYY-MM-DD でないものを検出）
grep -rn "^date:" content/posts/*.md | grep -v '"[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}"'

# 4. TypeScript 型チェック
npx tsc --noEmit

# 5. ビルド
npm run build
```

---

## Phase 2: AI 記事ドラフト生成フロー（次期）

### 構成イメージ

```
Human: テーマ・カテゴリ・キーワードを指定
  ↓
Claude: blog-article-schema.md に沿って Markdown ドラフト生成
  ↓
Human: レビュー・修正（Humanレビュー境界）
  ↓
Human: content/posts/ に配置 + ビルド確認
  ↓
デプロイ
```

### Claude へのプロンプトテンプレート（Phase 2 用）

```
以下の仕様に従い、歯科メディア記事の Markdown ドラフトを生成してください。

## 仕様
- schema: docs/blog-article-schema.md 参照
- category: {カテゴリ名}
- テーマ: {テーマのキーワード}
- 想定読者: {例: 虫歯治療を初めて受ける30代}
- 文字数目安: 800〜1200文字（本文のみ）
- 禁止表現: 医療効果の断定、「必ず」「完全に」「保証」

## 出力形式
frontmatter + 本文 Markdown をそのまま出力。説明不要。
```

### Human レビュー境界

AI が生成し、**Humanが必ず確認すること**:

| 確認項目 | 理由 |
|---------|------|
| 医療効果・断定表現の有無 | 薬機法・景品表示法リスク |
| 事実関係の正確さ | AI が古い情報・誤情報を生成する可能性 |
| クリニック固有情報の整合性 | 院名・所在地・診療科目 |
| slug の重複・命名 | 自動生成 slug は日付未設定になりやすい |
| excerpt の文字数と内容 | SEO 要件 |

**AI に委任してよい作業:**
- 本文の構成案・見出し
- 各段落のドラフト文
- tags の候補提示
- excerpt の候補文生成

---

## Phase 3: 予約投稿・定期更新フロー（将来）

### 実現に必要な要素

| 要素 | 方法案 |
|------|-------|
| 予約投稿 | `date` が未来日付の記事を build 対象から除外する仕組み（または Vercel の Cron + re-build） |
| 定期ビルド | GitHub Actions: schedule trigger で `npm run build` + deploy |
| 記事生成自動化 | Claude API を使った記事ドラフト自動生成スクリプト |
| 承認フロー | GitHub PR: ドラフト記事を PR で提出 → レビュー → merge = 公開 |

### 予約投稿の最小実装案

```typescript
// src/lib/posts.ts に追加（Phase 3 時）
export function getAllPosts(): PostMeta[] {
  const today = new Date().toISOString().slice(0, 10)
  return posts
    .filter((p) => p.date <= today)   // 未来日付を除外
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}
```

この1行で「date が今日以前の記事のみ公開」が実現できる。ビルド時に動的に絞り込まれるため、予約記事は frontmatter を書くだけでよい。ただし静的ビルド（SSG）の場合は毎日 re-build が必要。

---

## 次に実装すべき最小タスク（Phase 2 準備）

1. **記事ドラフト生成スクリプト** (`scripts/new-post.sh`):
   - テーマとカテゴリを引数に受け取り、slug を自動生成
   - frontmatter のテンプレートを `content/posts/{slug}.md` に出力
   - 重複チェックを含む

2. **ビルド前バリデーションスクリプト** (`scripts/validate-posts.sh`):
   - 必須フィールド・日付形式・カテゴリ名の正当性を確認
   - CI/CD に組み込み可能な exit code を返す

3. **カテゴリページ** (`src/app/category/[slug]/page.tsx`):
   - `/category/cavity` などが現状 404
   - `getAllPosts()` をカテゴリでフィルタして表示するだけで実現可能
