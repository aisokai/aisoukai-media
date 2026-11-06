# SNS 相互監視の証拠・投稿監査ログ

policy `aisoukai-media-tiered-blog-sns-2026-11-06`（AGENTS.md の `sns-mutual-review-20261106` 節）に基づく、SNS ドラフト（`publish_mode: ai_mutual_review`）のレビュー証拠と投稿監査の置き場。

| ファイル | 用途 | 追記する経路 |
|---|---|---|
| `evidence.jsonl` | レビュー証拠（作成とは別系統の AI によるレビュー結果） | `npm run sns:record-review`（`scripts/record-sns-review.mjs`） |
| `posting-audit.jsonl` | 投稿実行・事後巡回・削除／修正・エスカレーションの監査 | `scripts/lib/sns-mutual-review.mjs` の `appendPostingAuditRecord` |

どちらも最初のレコードが追記されるまで存在しない。ログが無い状態は「レビュー実績なし」を意味する。

## 形式

- JSON Lines。1行が1レコード。キー順を固定した canonical JSON（空白なし）に末尾改行を付ける。
- 時刻は JST ISO 8601（例 `2026-11-10T09:00:00.000+09:00`）。
- 各レコードは直前レコードの `record_hash` を `prev_hash` に持つ（先頭は `null`）。`record_hash` は、`record_hash` 自身を除くレコード全体の canonical JSON の SHA-256 hex。

**レビュー証拠**（`record_type: "sns_review_evidence"`）:
`record_id`, `record_type`, `version`, `recorded_at`, `draft_file`, `content_hash`, `hash_algorithm`（`sns-content-hash/v1`）, `media_hashes`, `created_by`, `creator_system`, `reviewed_by`, `reviewer_system`, `decision`（`pass` / `changes_requested` / `escalate`）, `checks`（`medical_ad` / `facts` / `exception_category` / `brand_tone` / `media_rights` / `mixup_prevention` / `flag_alignment`）, `exception_category`, `policy_version`, `notes`, `prev_hash`, `record_hash`

**投稿監査**（`record_type: "sns_posting_audit"`）:
`record_id`, `record_type`, `version`, `recorded_at`, `draft_file`, `evidence_id`, `content_hash`, `platform`, `action`（`post` / `patrol_check` / `delete` / `edit` / `escalate`）, `post_id`, `post_url`, `result`, `detail`, `prev_hash`, `record_hash`

## ルール

- **append-only。** 既存行を書き換え・削除・並べ替えしない。行の改竄・途中の欠落・挿入・並べ替え・定義外キーの追加は `npm run media:sns:validate` のチェーン検証で検出される。**末尾の行の切り詰め（最後のレコードの削除）はチェーン単体では検出できない**ため、git 履歴との比較で担保する。
- 証拠の追記後に frontmatter の更新が失敗した場合（未反映の証拠）は、検証で「このドラフトの最新の証拠が evidence_id と一致しない」エラーとして検出される。`npm run sns:record-review` を再実行すると新しい証拠で整合が取れる。
- 署名は使わない（サーバ側鍵の複製は禁止）。ハッシュチェーンと git 履歴で担保する。
- 患者を特定し得る本文は記録しない。hash と判定結果だけで足りる設計。`notes` / `detail` は最小限にする。
- このディレクトリへの記録は、投稿の許可を意味しない。投稿の可否は、フラグ（先生のみが操作する）と `sns_auto_suspend` を含む gate 判定を、実行主体が投稿直前に行う。
