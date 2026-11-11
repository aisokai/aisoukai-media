# MWF 生成画像の却下取り消し（運用手順）

この文書は手順の説明であり、実行の許可ではない。release の導入と本コマンドの実行は、それぞれ別途の承認・検証済み実行契約に従う。agent は本コマンドを本番に対して実行しない。

## 目的

自動生成画像が画像審査を通らなかったテーマは、画像 journal が `rejected` になり、以後の MWF 実行では有料 API を再度呼ばずに毎回 `image_rejected` で止まる（意図した fail-fast）。本手順は、Human が明示的に却下を取り消し、**そのテーマ版について新しい画像を 1 枚だけ**生成できる状態に戻すためのもの。

## 使う場面

- `--status` で対象テーマが `state: generation-failed` で、`generationReason` が `image_rejected` または `image_visual_review_failed` になっている。
- 運用者が却下された PNG（`<state root>/generated-images/<hash>.png`）と journal の `rejection`（却下理由）を確認し、再生成が妥当だと判断した。

却下理由（journal の `rejection.kind`）:

| kind | 意味 |
| --- | --- |
| `criteria_failed` | 審査項目のいずれかが不合格。`failed` に項目名、`reviewId` に審査 ID |
| `review_request_failed` | 審査リクエストが HTTP エラー。`httpStatus` に状態コード |
| `review_incomplete` | 審査応答が途中終了（finish_reason が stop 以外） |
| `review_malformed` | 審査応答の形式不正（JSON・項目・ID） |
| `duplicate_of_revoked` | 再生成画像が取り消し済み画像と同一 bytes。審査せず却下 |

この機能より前に却下された journal には `rejection` が無い（理由不明のまま取り消しは可能）。モデルの自由記述や画像 bytes は journal に記録しない。

## コマンド

導入済み release のディレクトリで、Human が、runner が動いていない時に実行する。

```sh
node --env-file=<既存の runner 用 env ファイル> scripts/ops-mwf.mjs --production --revoke-image-rejection <topicId>
```

- `--production` と `--revoke-image-rejection <topicId>` 以外のオプションは併用できない（`revoke_image_rejection_options_invalid`）。
- runner 実行中は run lock を取得できず `already_running` で終了する。何も変更しない。

## 変更されるもの

- `<state root>/generated-images/image-<topicVersion>.json` の 1 ファイルだけを原子的に書き換える（`rejected` → `regeneration-authorized`）。
- 却下された PNG は削除・変更しない。取り消した却下の記録（hash、生成時刻、request ID、却下理由、取り消し時刻）は同じ journal の `revokedRejections` に追記し、以後の状態遷移でも保持する。
- 配送 journal（`events.jsonl`）、署名付き claim / receipt、inventory、GitHub、画像ライブラリには触れない。API 呼び出し・通知・同期・記事生成・候補供給は行わない（起動時に release の同一性確認としてローカルの `git rev-parse` / `git status` だけを実行する）。
- 承認・公開は一切行わない。再生成された画像も通常どおり画像審査を受け、記事は未審査の下書きのまま先生のレビューに回る。

## 上限

1 テーマ版につき取り消しは **2 回まで**（`MAX_IMAGE_REJECTION_REVOCATIONS`）。3 回目は `revocation_limit_reached` で拒否し、有料呼び出しは増えない。上限に達したテーマは、テーマ内容の見直しまたは承認済み画像の割り当てで対応する。

## 取り消し後の流れ

1. 次にそのテーマの生成が再試行された時、画像を 1 枚だけ生成し、画像審査を行う。合格すれば従来どおり commit → 配信確認 → 記事生成 → 同期 → レビュー依頼へ進む。
2. 再試行が起きるのは、(a) 月水金 08:30 の定時実行で、その回が retry-only にならない場合（同じ slot の実行、または新しいテーマを選定できた回）、または (b) `--production --recover-topic <topicId>` を実行した場合。定時実行が新規テーマを選べず retry-only になった回では再試行されないため、確実に進めるには (b) を使う（これも別途承認された実行に限る）。
3. 画像が却下された回の `generationReason` は `image_visual_review_failed`、その後の再試行以降は `image_rejected` になる。本コマンドはどちらの理由でも受け付ける（`state` は `generation-failed` であること）。実際に取り消せるかは画像 journal が `rejected` かどうかで決まる。再生成画像が再び却下された場合も、上限内であれば同じ手順で取り消せる。
4. 配信待ちの継続（deployment-only）中は生成しない。`unknown` / `review-unknown` など結果不明の状態は取り消し対象外（自動でも手動でも再呼び出ししない）。

## 出力

1 行の JSON。成功時は終了コード 0、それ以外は 1。

成功: `{"status":"image-rejection-revocation","ok":true,"topicId":…,"topicVersion":…,"revokedHash":…,"revocationsUsed":1,"revocationsRemaining":1}`

失敗: `{"status":"image-rejection-revocation","ok":false,"topicId":…,"reason":…}`

| reason | 意味 |
| --- | --- |
| `already_running` | runner または別の操作が run lock を保持中 |
| `delivery_item_not_image_rejected` | そのテーマの配送項目が、ちょうど 1 件の `generation-failed` かつ理由が `image_rejected` または `image_visual_review_failed` のもの、ではない（`image_deployment_pending` など他の理由は対象外） |
| `topic_invalid` | 配送項目のテーマが不正、または保護対象 |
| `image_record_missing` | そのテーマ版の画像 journal が無い |
| `image_not_rejected` | 画像 journal が `rejected` ではない（取り消し済みを含む） |
| `image_record_mismatch` | journal のテーマ ID・版・operation・hash が一致しない |
| `revocation_limit_reached` | 取り消し上限（2 回）に到達 |

オプション不正・テーマ ID 形式不正・runner 版不一致・journal 破損などは、既存コマンドと同じく `{"status":"attention","reason":"delivery_failed_check_local_status"}` で終了する。
