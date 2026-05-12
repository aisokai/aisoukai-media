# 運用ログ

AI支援コンテンツワークフローの実施履歴。

---

## 2026-05-12 — 初回 AI 支援記事サイクル

### 概要

AIトレンド調査 → 記事下書き生成 → Human approval → validate/build → deploy を
初めて end-to-end で通したサイクル。

### 対象記事

| 項目 | 値 |
|------|----|
| topic_id | TOPIC-20260512-031 |
| タイトル | 歯科定期検診は何ヶ月ごとが目安？受診間隔の考え方 |
| カテゴリ | 予防歯科 |
| medical_risk | low |
| ファイル | `content/posts/2026-05-26-topic-20260512-031.md` |
| 公開 URL | https://aisoukai-media.vercel.app/blog/2026-05-26-topic-20260512-031 |

### 実施ステップ

```
[1] research:trends
    → data/research/2026-05-12-trends.json / .csv 生成（候補 5 件）

[2] Human によるトピック選定
    → 候補 1「歯科定期検診 頻度」を選定（medical_risk: low / priority: high）
    → data/article-topics.sample.csv に TOPIC-20260512-031 を手動追記
    → validate:topics ✅ 31 件

[3] generate:draft
    → content/posts/2026-05-26-topic-20260512-031.md 生成
    → reviewed: false / ai_generated: true
    → 使用モデル: claude-haiku-4-5-20251001
    → トークン: 入力 581 / 出力 1259

[4] Human review（記事内容確認）
    → 断定的表現なし / 誇大表現なし / 免責事項付き
    → 医療広告上の問題なし

[5] approve:post
    → npm run approve:post -- 2026-05-26-topic-20260512-031 --reviewed-by "mitani"
    → reviewed: true / reviewed_at: 2026-05-12 / reviewed_by: mitani

[6] validate:publish-ready
    → ✅ 1 件 publish-ready / 残 9 件 pending（想定通り）

[7] build
    → NEXT_PUBLIC_SITE_URL=https://example.com npm run build ✅
    → 22 ページ静的生成（記事 URL がルートに追加）

[8] commit / push / deploy
    → commit: 5c7352a  "Publish first AI-assisted dental article"
    → Vercel deploy 完了
```

### 発見した課題

| # | 課題 | 影響 |
|---|------|------|
| 1 | `import:topic` 後に `generate:draft` が「既存ファイルあり」エラー | 手順が二重 |
| 2 | `date` と `publish_at` が別フィールドで `date` 未来でも公開対象 | 誤解リスク |
| 3 | `research:trends` 出力を手動で CSV に追記する手順が冗長 | 運用コスト |

詳細は [docs/next-improvements.md](../next-improvements.md) を参照。
