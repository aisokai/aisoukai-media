# MWF 画像反映待ちの継続修復（2026-10-09）

## 原因と変更

従来は画像の保存・同期後、未反映なら `image_deployment_pending` を保存して実行を終了した。明示 `--retry-only` も本文未生成の待機を再開できなかった。

既存の production CLI 一回の実行内で、同じ画像の反映確認と記事の管理画面反映確認を継続する。15 秒ごと、最大 40 待機、開始から 10 分の共通予算を持つ。API 所要時間も次の継続可否判定に含める。進行中の既存 API のタイムアウトを強制短縮するものではない。上限後は保存済み状態を保持して終了する。新しい cron や dispatch は追加しない。

`--retry-only` は保存済み配信に加え、明確な `image_deployment_pending` の既存記事だけを生成前段から再開する。他テーマを選択しない。再開時も現在のテーマ採用、topicVersion、比較 metadata/hash、画像 bytes/hash を再検証する。画像待ちの再開では画像 API を新規呼出しせず、保存済みまたは現在の検証済み画像がなければ停止する。

結果不明の画像生成・本文生成・通知は再試行しない。管理画面の反映待ち継続は既に審査結果が確定した `draft-review-required` / `server-reviewed` に限る。既存 server authority は同じ semantic claim を読み直し、独立審査を再実行しない。原本 hash の照合、Human 最終審査、公開条件は変更しない。

## 通知

記事完了通知は作成件数と先生の確認・承認依頼、管理画面 URL を先頭にする。保存原本の復元と公開反映は別の事実として表現する。path/hash 全文は通知の主役から外し、journal に保持する。画像待ち通知は本文未完成と操作不要を明示し、今回の待機終了と次回定期確認を示す。

## 合成検証

```sh
node --test tests/mwf-delivery.test.mjs tests/mwf-auto-images.test.mjs tests/ops-mwf.test.mjs tests/mwf-production.test.mjs tests/mwf-intake-notice.test.mjs
```

画像未反映→同一 bytes 反映→本文一回生成→保存同期→admin 同 hash→通知一回、再起動重複なし、待機上限、unknown 停止、採用失効、別テーマ生成禁止を確認。test clock と wait は注入し実待機・実 API を使わない。

追加修復で server runtime に Human 最終審査の固定 policy を追加したため、アプリ build は必要。UI は変更しないため browser は対象外。変更 ESM の構文確認、対象 ESLint、diff check を行う。実環境の復旧成否は別実行 stage で確認する。local tests の成功だけで本番復旧完了とは扱わない。


## Human 最終審査の固定

本番 server authority は `humanReviewRequired:()=>true` を固定する。通常 schema1 review は API 設定の有無にかかわらず `human_review_required` の下書き結果とし、原本を変更せず記事審査 API を呼ばない。reflection は原本 hash と未承認 draft flags / 非公開状態を確認する。prepare の採用検証、schema2 minor、backfill、復元は従来通り。要求形式や semantic claim key は変えず、既存 done claim は読み返すだけで再審査・再公開しない。既存 caller の既定 policy は互換維持。
