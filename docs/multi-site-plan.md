# Multi-site 化 実装方針

複数クリニック向けにリポジトリ設定を外部化する際の設計方針。
現時点では実装せず、将来の拡張時に参照するドキュメント。

---

## 現状の課題

`SITE_NAME`・カテゴリ定義・Tailwind カラー等がソースコードに直書きされており、
別クリニック向けにデプロイするにはリポジトリをフォーク・全体修正が必要。

---

## 方針: 外部設定ファイル + 環境変数の組み合わせ

### 1. サイト設定ファイル（`config/site.ts`）

クリニックごとに異なる値を一箇所に集約する。

```ts
// config/site.ts（例）
export const siteConfig = {
  name: process.env.NEXT_PUBLIC_SITE_NAME ?? '三谷ファミリー歯科クリニック',
  url:  process.env.NEXT_PUBLIC_SITE_URL  ?? 'http://localhost:3000',
  description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION ?? '',
  author: process.env.NEXT_PUBLIC_AUTHOR_NAME ?? '藍想会メディア編集部',
}
```

### 2. カテゴリ定義（`config/categories.ts`）

現在 `src/lib/categories.ts` にハードコードされているカテゴリ一覧を、
`config/categories.ts` に移動して環境別 JSON で上書きできるようにする。

```ts
// config/categories.ts（例）
import customCategories from '../../categories.override.json' assert { type: 'json' }

export const CATEGORIES = customCategories.length > 0
  ? customCategories
  : DEFAULT_CATEGORIES
```

### 3. スタイル変数（Tailwind CSS）

`tailwind.config.ts` のブランドカラーを CSS 変数経由にし、
クリニックごとの `globals.css` で上書き可能にする。

```css
/* globals.css */
:root {
  --brand-primary: #2563eb;   /* 環境別に変更 */
  --brand-secondary: #1d4ed8;
}
```

---

## 環境変数一覧（追加予定）

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `NEXT_PUBLIC_SITE_NAME` | 本番必須 | クリニック名 |
| `NEXT_PUBLIC_SITE_URL` | 本番必須 | 公開 URL（既存） |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | 推奨 | サイト概要 |
| `NEXT_PUBLIC_AUTHOR_NAME` | 推奨 | 記事著者名 |
| `NEXT_PUBLIC_BRAND_COLOR` | 任意 | ブランドカラー（HEX） |

---

## 実装手順（将来）

1. `config/site.ts` を新規作成し、`src/lib/seo.ts` の定数を移行する
2. `src/lib/categories.ts` を `config/categories.ts` に移動する
3. 各ページ・コンポーネントの import を `config/` に向け直す
4. `tailwind.config.ts` をカスタム CSS 変数対応にする
5. Vercel 上に複数プロジェクトを作成し、それぞれ環境変数を設定する

---

## 留意事項

- `content/posts/` はクリニックごとに別リポジトリ（または git submodule）で管理するのが自然
- `ANTHROPIC_API_KEY` と `NEXT_PUBLIC_SITE_URL` は既存の必須変数として維持する
- カテゴリ定義を変更した場合は `validate:topics` / `validate:posts` の有効カテゴリも更新が必要
