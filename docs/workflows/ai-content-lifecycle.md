# AI コンテンツライフサイクル

## 概要

AIが調査・下書きを生成し、Human が承認後に公開する半自動ワークフロー。
AIが単独でコンテンツを公開することはない。

## フロー

```
[1] AI Trend Research (dry-run)
    npm run research:trends
    → data/research/YYYY-MM-DD-trends.json / .csv を生成
    → 外部 API 不使用 / 既存 CSV を変更しない

[2] Human Review (調査候補)
    data/research/*.json を確認
    → 医療安全上問題のある候補を除外
    → 採用候補のみ data/article-topics.sample.csv に手動追記
    → npm run validate:topics で整合性確認

[3] Draft Generation
    npm run generate:draft -- TOPIC-XXXX
    → ANTHROPIC_API_KEY が必要
    → content/posts/YYYY-MM-DD-TOPIC-XXXX.md を生成
    → reviewed: false / ai_generated: true で出力

[4] Human Review (記事内容)
    npm run list:pending-review で一覧確認
    → 医療情報の正確性・表現の安全性を確認
    → 問題があれば本文を手動修正

[5] Approval
    npm run approve:post -- SLUG [--reviewed-by "氏名"]
    → reviewed: true / draft: false / reviewed_at: today を設定
    → AIが自動実行してはならない

    差し戻しの場合:
    npm run reject:post -- SLUG [--reason "理由"] [--reviewed-by "氏名"]
    → reviewed: false 維持 / rejection_reason と review log を記録
    → [4] に戻る

[6] Publish Check
    npm run validate:publish-ready
    → reviewed: true の記事のみ ✅
    → publish_at が未来なら ⛔ scheduled 表示

[7] Build & Deploy
    npm run build
    → reviewed: true の記事のみ静的生成
    → sitemap.xml に公開済み記事のみ含む
    → Human が deploy を判断・実行
```

## 状態管理フィールド

| フィールド | 初期値 | approve 後 | reject 後 |
|-----------|--------|-----------|----------|
| `reviewed` | false | true | false |
| `draft` | (なし) | false | (変更なし) |
| `ai_generated` | true | (変更なし) | (変更なし) |
| `reviewed_at` | (なし) | YYYY-MM-DD | (変更なし) |
| `reviewed_by` | (なし) | 承認者名 | (変更なし) |
| `rejection_reason` | (なし) | (変更なし) | 差し戻し理由 |

## 医療安全上の禁止事項

- 断定的表現（「必ず〜」「確実に〜」）
- 過度な不安を煽る表現
- 誇大表現（「最先端」「完全に治る」）
- 根拠のない断言
- review / aggregateRating schema（効果断定に繋がる）
- FAQ schema の乱用
