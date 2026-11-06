# SNS Drafts

Instagram / X / LINE などの SNS ドラフト置き場。`publish_mode` によって経路が分かれる。

## manual_only（Human 手動投稿）

AIはここに `reviewed:false` のMarkdownドラフトを生成する。
投稿・承認・外部SNSへの反映はHumanが行う（`npm run sns:approve` / `sns:reject`）。

## ai_mutual_review（AI 相互監視）

policy `aisoukai-media-tiered-blog-sns-2026-11-06`（AGENTS.md の `sns-mutual-review-20261106` 節）による経路。対象チャンネルのフラグが先生の操作で ON になり、`sns_auto_suspend` が ON でない範囲でのみ投稿に進める。

1. **作成**: 作成AI（運用初期値は Claude 系統）が `publish_mode: ai_mutual_review`、`created_by: <system>:<run-id>`、`mutual_review.state: pending` でドラフトを作る。
2. **別系統レビュー**: 作成とは別系統のレビューAI（運用初期値は ChatGPT 系統）がチェックリストでレビューする。
3. **証拠記録**: `npm run sns:record-review -- <file> --decision pass|changes_requested|escalate --reviewed-by "chatgpt:<run-id>" --checks ...` で `data/sns-review/evidence.jsonl` に証拠を追記し、frontmatter の `mutual_review` を更新する（証拠追記 → frontmatter 更新の順）。
4. **投稿**: 実行主体が投稿直前に `scripts/lib/sns-mutual-review.mjs` の `verifySnsPublishable` で hash と証拠を再照合し、一致した場合のみ投稿する（このリポジトリは投稿を実行しない）。
5. **監査**: 投稿結果・事後巡回・削除／修正は `data/sns-review/posting-audit.jsonl` に追記する。

- `approved_for_manual_post` は常に `false`。Human 承認 CLI（`sns:approve` / `sns:reject`）の対象外。
- `mutual_review` / `created_by` を manual_only のドラフトに含めることはできない。
- 患者が特定され得る内容・個別相談・クレーム・判断が割れたものは `escalated`（`exception_category` 必須）とし、自動フローから外す。
- 検証: `npm run media:sns:validate`（構造検証 + 証拠照合。証拠なし・hash 不一致・同一系統・ペア外・policy_version 不一致・チェーン破損はすべてエラー）。
