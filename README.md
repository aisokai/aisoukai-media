# aisoukai-media

藍想会が運営する歯科メディアサイト。AI運用前提で設計された Next.js + Markdown ベースのコンテンツ基盤。

## 技術スタック

| 技術 | 用途 |
|------|------|
| Next.js 15 (App Router) | フレームワーク |
| TypeScript strict | 型安全 |
| Tailwind CSS v4 | スタイリング |
| gray-matter | Markdown frontmatter パース |
| remark / remark-html | Markdown → HTML 変換（sanitize:true） |

## 記事ネタDB

記事ネタDB は、今後 AI が歯科メディアの記事候補を定期収集し、下書き作成へ接続するための企画・進行管理の正本です。

初期段階では Google Sheets API には接続せず、Google スプレッドシートに入力した内容を CSV でエクスポートまたは貼り付けして運用します。

### 使い方

1. `data/article-topics.sample.csv` をテンプレートとして使う
2. スプレッドシートで候補を管理する
3. `npm run validate:topics` で CSV の整合性を確認する
4. 公開記事の本文は `content/posts/*.md` を正本として管理する

### 記録する項目

- ネタの発見日
- 収集元の種別
- 記事テーマ
- 候補タイトル
- カテゴリ
- 検索キーワード
- 患者の検索意図
- 優先度
- 医療リスク
- 進捗ステータス

### status の使い分け

- `idea`: アイデア段階
- `approved`: 採用済み
- `drafting`: 下書き作成中
- `reviewed`: レビュー完了
- `published`: 公開済み
- `hold`: 保留

## 開発環境

```bash
npm install
npm run dev
```

→ http://localhost:3000

## ディレクトリ構成

```
aisoukai-media/
├── content/
│   └── posts/           # 記事置き場（AI自動生成記事もここへ）
├── src/
│   ├── app/             # App Router ページ
│   │   ├── page.tsx         # トップページ
│   │   └── blog/
│   │       ├── page.tsx         # 記事一覧
│   │       └── [slug]/page.tsx  # 記事詳細
│   ├── components/      # Header / Footer / ArticleCard
│   └── lib/
│       └── posts.ts     # Markdown読み取りユーティリティ
└── public/
```

## 記事の追加方法

`content/posts/` に Markdown ファイルを追加するだけで記事が公開されます。

ファイル名規則: `YYYY-MM-DD-slug.md`

frontmatter 必須フィールド:

```markdown
---
title: "記事タイトル"
date: "2026-01-15"
description: "記事の概要（OGP・一覧表示に使用）"
category: "カテゴリ名"
tags:
  - タグ1
  - タグ2
---
```

## AI自動記事生成の拡張ポイント

1. **記事ファイル生成**: `content/posts/` に frontmatter 付き Markdown を追加するだけで即時公開
2. **型参照**: `src/lib/posts.ts` の `PostMeta` 型を参照して frontmatter を構成
3. **デプロイ自動化**: `npm run build` → Vercel / GitHub Actions でデプロイ可能
4. **OGP画像生成**: `opengraph-image.tsx` を各ページに追加で SNS対応
5. **カテゴリ管理**: 記事数増加後は `content/categories.json` 等でマスタ管理を検討
6. **記事ネタDB連携**: Google スプレッドシート由来の CSV を `validate:topics` で検証し、採用ネタを `content/posts/` の下書きへ接続する

## コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 (http://localhost:3000) |
| `npm run build` | 本番ビルド |
| `npm run lint` | ESLint 実行 |
| `npm run validate:topics` | `data/article-topics.sample.csv` の整合性を検証する |
| `npm run import:topic -- TOPIC-XXXX` | CSVから指定 topic_id のテンプレート下書きを生成する |
| `npm run generate:draft -- TOPIC-XXXX` | CSVから指定 topic_id の AI 生成下書きを作成する（要 API キー） |
| `npm run new:post -- --title "..." --category "..." --excerpt "..." --tags "..."` | 空の記事ファイルを新規作成する |
| `npm run validate:posts` | `content/posts/` の全記事 frontmatter を検証する |

## generate:draft の使い方

AI（Claude）が記事本文を自動生成します。生成した記事は必ず `reviewed: false` のドラフト扱いです。

### セットアップ

```bash
# .env.local.example をコピーして API キーを設定する
cp .env.local.example .env.local
# .env.local を開いて ANTHROPIC_API_KEY=sk-ant-... を記入
# .env.local は絶対に commit しないこと（.gitignore で除外済み）
```

### 実行例

```bash
# 記事ネタ CSV の整合性確認
npm run validate:topics

# 指定した topic_id の AI 下書きを生成
npm run generate:draft -- TOPIC-20260511-007

# 生成された下書きを確認・修正する（本文は必ず手動レビュー）
npm run validate:posts
npm run build
```

生成先: `content/posts/YYYY-MM-DD-topic-id.md`

注意:
- 生成記事は `reviewed: false` のまま公開しないこと（Human approval が必須）
- 生成後は必ず本文を読み、医療情報の正確性を確認すること
- `ANTHROPIC_API_KEY` が未設定の場合はエラーで終了します（API は呼びません）
- 同名ファイルが既に存在する場合は上書きせずエラー終了します

## import:topic の使い方

`data/article-topics.sample.csv` に承認済みの記事ネタが登録されている場合、以下のコマンドで `content/posts/` に下書きを生成します。

```bash
# 記事ネタ CSV の整合性確認
npm run validate:topics

# 指定した topic_id の下書きを生成
npm run import:topic -- TOPIC-20260511-007

# 生成された下書きを確認
npm run validate:posts
```

生成先: `content/posts/YYYY-MM-DD-topic-id.md`

テンプレートは category に応じて自動選択されます:
- 医療系カテゴリ（虫歯治療・根管治療など）→ 受診目安・原因・対応の構成
- お知らせ → お知らせ概要・対象・実施日・まとめの構成

注意:
- `title_candidate`・`target_keyword`・`patient_intent`・`publish_date` が空の場合はエラー終了します
- 同一 topic_id が CSV に複数行ある場合はデータ不整合としてエラー終了します
- 同名ファイルが既に存在する場合は上書きせずエラー終了します
