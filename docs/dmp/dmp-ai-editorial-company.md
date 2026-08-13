# DMP AI編集部 — 組織・役割定義

> **DMP = Dental Media Project**（データ管理プラットフォームではない）
>
> 共通ルールは [../../CLAUDE.md](../../CLAUDE.md) / [../../AGENTS.md](../../AGENTS.md) を正本とする。
> Human Gate・自動公開禁止・AI自動承認禁止は絶対ルールとして本文書でも引き継ぐ。

---

## DMP の位置付け

```
MitaniOS（全体OS）
  └── AI Command Center（指揮・調整）
        ├── DMP — Dental Media Project（本文書）
        │     ├── Blog
        │     ├── SNS（Instagram / X / LINE）
        │     ├── Website（クリニックサイト・LP）
        │     ├── YouTube
        │     └── （将来メディアチャンネル）
        ├── Dental Apps（往診システム・O2システム・口腔機能管理など）
        └── Life Plan Apps（資産・移住・教育・家族計画など）
```

DMP は藍想会の **外向けコンテンツ全体** を管理する。
診療・院内システムは Dental Apps が担い、DMP はそれらの情報をメディア化する役割を持つ。

---

## AI編集部 組織マップ

```
ユーザー（三谷院長）
      │
      ▼
┌─────────────────────────────────────────┐
│              編集長（Editor-in-Chief）   │  ← 単一窓口
│  自然言語 → DMP タスクへ変換・振り分け  │
└─────────────────────────────────────────┘
      │
      ├──► 調査部（Research）
      ├──► ブログ部（Blog）
      ├──► SNS部（SNS）
      ├──► ウェブサイト部（Website）
      ├──► YouTube部（YouTube）
      ├──► クリエイティブ部（Creative）
      └──► レビュー部（Review）
                │
                ▼
        公開管理部（Publishing Control）
                │
                ▼
         Human Gate（必須）
                │
                ▼
          公開（手動実行）
```

---

## 部門別役割定義

### 編集長（Editor-in-Chief）

- **役割**: ユーザーとの単一インターフェース。自然言語の依頼を DMP タスクに変換し、適切な部門に割り振る
- **入力**: ユーザーの発話・テキスト指示（例: 「ホワイトニングの記事を書いて」「今月のInstagram投稿ネタを考えて」）
- **出力**: 部門別タスク定義 + コンテンツキューへの追加
- **制約**: 承認・公開の実行は行わない。タスク管理と調整のみ

### 調査部（Research）

- **役割**: 歯科トレンド調査、患者ニーズ分析、競合メディア調査、SEOキーワード収集
- **既存実装**: `npm run research:trends`（dry-run）、`data/research/` 出力
- **出力**: `data/research/YYYY-MM-DD-trends.json`, SEOキーワードリスト
- **制約**: 調査結果は必ず Human レビューを経てから次のステージに進む

### ブログ部（Blog）

- **役割**: 記事アイデア生成、アウトライン作成、本文ドラフト、SEOタイトル・メタディスクリプション
- **既存実装**: `npm run generate:draft`, `npm run article:manual`, `npm run article:scheduled`
- **出力**: `content/posts/YYYY-MM-DD-slug.md`（`reviewed: false`）
- **制約**: `reviewed: true` への書き換えは禁止。AI生成記事は必ず `ai_generated: true` フラグ付き
- **定期接続**: `npm run ops:mwf` は月水金にCSVの未使用ネタから1記事を生成し、永続ストック後に必ずTelegram通知処理へ進む。既存ストック数・Git同期・管理画面反映・医療リスクは停止条件にしない。`--no-generate` は生成を省略し、未送信通知の再試行だけを行う

### SNS部（SNS）

- **役割**: Instagram / X / LINE の投稿ドラフト、カルーセルアウトライン、短文キャプション
- **現状**: Phase 2 設計着手。ブログ自動更新システムを雛形として横展開する
- **出力**: `content/sns-drafts/` または `data/dmp/<channel>/drafts/` 配下の Markdown ドラフト
- **制約**: Meta Graph API / Twitter API による自動投稿禁止。Human がコピー&ペーストで手動投稿
- **設計資料**: [dmp-channel-template.md](./dmp-channel-template.md), [dmp-sns-expansion-plan.md](./dmp-sns-expansion-plan.md)

### ウェブサイト部（Website）

- **役割**: クリニックサイト・LP・サービスページのコピーライティング、CVR改善テキスト
- **現状**: 未実装（Phase 3 で着手）
- **出力**: テキストドラフト（Markdown）
- **制約**: CMS への自動投稿禁止。Human が確認・適用する

### YouTube部（YouTube）

- **役割**: 動画アイデア、スクリプト（本編・Shorts）、サムネイルテキスト案
- **現状**: 未実装（Phase 4 で着手）
- **出力**: `data/dmp/youtube-scripts/` 配下のスクリプトドラフト（将来）
- **制約**: YouTube Data API による自動アップロード禁止。Human が撮影・編集・投稿を実施

### クリエイティブ部（Creative）

- **役割**: 画像プロンプト生成、サムネイルコンセプト、ビジュアルディレクション
- **既存実装**: `data/image-library.json`、`scripts/image-*.mjs`
- **出力**: 画像プロンプト、ビジュアル仕様書
- **制約**: 最終的な画像の公開判断は Human。AI生成画像の医療行為写実的描写は禁止

### レビュー部（Review）

- **役割**: 医療広告表現リスク審査、事実確認、トーン確認、患者誤解リスク評価
- **チェック項目**:
  - 断定的表現（「必ず治る」「完全予防できる」）→ 禁止
  - 過度な不安煽り表現 → 禁止
  - 根拠のない比較・誇大表現 → 禁止
  - before/after 効果保証 → 禁止
  - FAQ schema の乱用 → 禁止
- **出力**: レビュー結果レポート（`logs/review-history.md` に append）
- **制約**: レビュー通過だけでは公開されない。Human 承認が別途必要

### 公開管理部（Publishing Control）

- **役割**: 承認キュー管理、公開ステータス追跡、監査ログ
- **既存実装**: `npm run status:content`, `npm run validate:publish-ready`, `logs/review-history.md`
- **出力**: 承認待ちリスト、公開ステータスレポート
- **制約**: 自動公開禁止。Human が `npm run approve:post` → `npm run build` → `git push` を明示的に実行
- **定期運用**: `npm run ops:mwf` は「生成 → ストック → Telegram通知」だけを担い、approve / publish は行わない。Human承認だけが既存の掲載経路へ進める唯一のgateである

---

## 将来拡張予定チャンネル

| チャンネル | 追加時期 | 主担当部門 | 実装方針 |
|-----------|---------|-----------|---------|
| Instagram | DMP Phase 2 | SNS部 + クリエイティブ部 | ドラフト生成のみ。Human が手動投稿 |
| X（旧Twitter） | DMP Phase 2 | SNS部 | 同上 |
| LINE（公式アカウント） | DMP Phase 2 | SNS部 | 同上 |
| Website LP | DMP Phase 3 | ウェブサイト部 | テキストドラフト生成のみ |
| YouTube | DMP Phase 4 | YouTube部 | スクリプト生成のみ |
| MitaniOS患者FAQ連携 | DMP Phase 5 | 調査部 | `docs/mitanios-integration-plan.md` 参照 |

---

*最終更新: 2026-05-31*
