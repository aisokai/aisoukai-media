# Search Console / Analytics 設定ガイド

Vercel デプロイ後の計測・インデックス登録手順。

---

## 1. Google Search Console 登録

### 前提
- Google アカウント（Search Console 管理者権限）
- Vercel デプロイ済み（本番 URL: `https://aisoukai-media.vercel.app`）

### 手順

1. [Google Search Console](https://search.google.com/search-console) にログイン
2. 「プロパティを追加」→「URL プレフィックス」を選択
3. URL に `https://aisoukai-media.vercel.app` を入力
4. 「HTML タグ」方式で確認コードを取得
5. `src/app/layout.tsx` の `<head>` に meta タグを追加する（下記参照）
6. 「確認」ボタンを押す

```tsx
// src/app/layout.tsx の metadata に追加（例）
export const metadata: Metadata = {
  // ...既存の設定...
  verification: {
    google: 'YOUR_VERIFICATION_CODE',  // Search Console から取得したコード
  },
}
```

### sitemap・robots.txt の登録

確認完了後、サイトマップを手動送信する。

| 項目 | URL |
|------|-----|
| sitemap | `https://aisoukai-media.vercel.app/sitemap.xml` |
| robots.txt | `https://aisoukai-media.vercel.app/robots.txt` |

手順:
1. Search Console 左メニュー「サイトマップ」を開く
2. `sitemap.xml` を入力して「送信」
3. ステータスが「成功しました」になることを確認

---

## 2. GA4 導入方針

### 現時点でコード実装しない理由

- 初期フェーズはページ数が少なく、Search Console の表示回数・クリック数で十分
- GA4 タグ追加はスクリプト読み込みによるパフォーマンス影響があり、コンテンツ蓄積後に判断する
- Vercel Analytics（ビルトイン）で基本的なトラフィック把握が可能（後述）

### 将来 GA4 を導入する場合の実装方針

環境変数でトラッキング ID を管理し、本番環境以外では読み込まない設計にする。

**1. 環境変数を追加**

```bash
# .env.local（ローカル確認用）
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Vercel ダッシュボード → Settings → Environment Variables に本番用 ID を登録
```

**2. GTM または next/script で読み込む**

```tsx
// src/app/layout.tsx に追加（概要）
import Script from 'next/script'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

// GA_ID が設定されている場合のみ読み込む
{GA_ID && (
  <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
    <Script id="ga-init" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_ID}');
    `}</Script>
  </>
)}
```

**3. 環境変数未設定 = 計測なし** の状態がデフォルトになるため、ローカルや staging に意図しない計測データが混入しない。

---

## 3. Vercel Analytics（推奨: 先行導入）

GA4 より導入コストが低く、Next.js との親和性が高い。

**導入手順:**

1. Vercel ダッシュボード → プロジェクト → 「Analytics」タブ → 有効化
2. `npm install @vercel/analytics` を実行
3. `src/app/layout.tsx` に `<Analytics />` を追加

```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

**注意**: Vercel Analytics は Vercel 上のデプロイでのみ計測される（ローカル開発では動作しない）。

---

## 4. 作業チェックリスト

| 作業 | 担当 | 状態 |
|------|------|------|
| Search Console プロパティ追加 | 運用担当者 | 未実施 |
| layout.tsx に検証メタタグ追加 | 開発者 | 未実施 |
| sitemap.xml の送信 | 運用担当者 | 未実施 |
| Vercel Analytics 有効化 | 開発者 | 未実施 |
| GA4 測定 ID 取得・設定判断 | 運用担当者 | 検討中 |
