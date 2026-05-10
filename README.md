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

## コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 (http://localhost:3000) |
| `npm run build` | 本番ビルド |
| `npm run lint` | ESLint 実行 |
