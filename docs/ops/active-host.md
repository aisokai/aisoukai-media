# Active host

- current: mac-mini
- since: 2026-11-08
- declared_by: mitani
- note: 2026-11-08 切替ドリル完了: 所有者を mac-mini へ切戻し。宣言→MacBook側の同期確認→切戻しまで一通り実施済み。MacBook 側は clone 常備のみに戻る。

## 切り替え履歴
- 2026-11-08: 初版作成（所有者は mac-mini）
- 2026-11-08: 切替ドリル開始（mac-mini → macbook-pro）
- 2026-11-08: 切戻しドリル完了（macbook-pro → mac-mini）

## ルール
- 切り替え・切り戻しは、このファイルを変更する専用コミット（PR経由）でのみ宣言する
- 常駐ジョブは起動時にこのファイルを確認し、自機が current でなければ何もせず終了する（ガード実装は今後）
