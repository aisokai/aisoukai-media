# Human Approval フロー

## 目的

AI 生成記事の医療安全を担保するため、Human が承認するまで記事を公開しない。

## 承認前チェックリスト

記事本文を開き、以下を確認する:

- [ ] 医療情報として正確か（事実誤認がないか）
- [ ] 断定的表現・誇大表現がないか（「必ず治る」「絶対に」等）
- [ ] 過度な不安を煽る表現がないか
- [ ] 症状・診断への言及が適切か（「受診をご検討ください」等に留まっているか）
- [ ] 出典のない断言がないか
- [ ] `ai_generated: true` の記事は特に慎重に確認する

## コマンド

```bash
# レビュー待ち記事の一覧表示
npm run list:pending-review

# 承認（reviewed: true に設定）
npm run approve:post -- <slug>
npm run approve:post -- <slug> --reviewed-by "承認者名"

# 差し戻し（reviewed: false 維持、理由を記録）
npm run reject:post -- <slug>
npm run reject:post -- <slug> --reason "医療情報の根拠が不明確"

# 承認状態の確認
npm run validate:publish-ready

# ビルド（reviewed:true の記事のみ静的生成）
npm run build
```

## スケジュール公開

記事の frontmatter に `publish_at: YYYY-MM-DD` を設定すると、
その日付以降にビルドした場合のみ公開対象になる。

```markdown
---
reviewed: true
publish_at: "2026-06-01"
---
```

- `validate:publish-ready` では "scheduled: 2026-06-01" として ⛔ 表示
- 公開日当日以降に `npm run build` でデプロイすると公開される
- cron / GitHub Actions による自動公開は未実装（Human が手動でデプロイ）

## 承認後の公開フロー

```
approve:post → validate:publish-ready → build → (Human が deploy を判断)
```

deploy は Human が明示的に実行する。AIによる自動デプロイは行わない。
