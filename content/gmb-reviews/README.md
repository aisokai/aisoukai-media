# GMB Reviews

GMB口コミのスナップショット・返信案・処理済みID台帳。

- `sample/mock-reviews.json` — v0用のmockデータ (実APIは呼ばない)
- `snapshots/` — 口コミスナップショット (raw_text はここにのみ保持。表示・ログ出力禁止)
- `replies/` — 返信案 (raw_text を含めてはならない)
- `processed-ids.json` — 処理済みreview id台帳 (append-only)

- 表示のみ (ファイルを書かない): `npm run media:gmb:reviews:dry-run`
- 返信案をローカル保存 (外部送信なし): `npm run media:gmb:reviews:check`
- 検証: `npm run media:gmb:reviews:validate`

いずれも実APIは呼ばない。返信の送信機能は存在しない (Human Gate)。
