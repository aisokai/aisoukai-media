# MWF 下書き配送運用

2026-09-14 の先生承認により、Mac と本番の権限を分ける。Mac は既存 OpenAI 設定で原稿を生成し、既存 native gh 認証で未審査原稿を固定 `aisokai/aisoukai-media/main` へ同期する。本番は既存管理画面の採用証跡を検証し、独立審査と公開署名を担当する。ADMIN_REVIEW_COOKIE_SECRET を Mac へコピーしない。新しい秘密鍵や別名共有を導入しない。

## 実行経路

1. 固定 SHA の canonical テーマと比較 metadata を読み、真正な署名採用証跡のない候補だけ hold にする。旧 approved CSV は署名の代用にならない。
2. 本番 prepare が採用 version と比較集合を確認する。Mac の独立 metadata 判定が clear の候補のみ下書き生成に進む。Mac の判定は公開承認ではない。
3. slot/topic ID を durable journal に予約し、生成原稿を保存する。原稿は draft:true、reviewed:false、auto_approved:false。既存ライセンス確認済み画像候補を付与できるが、画像を含む最終公開審査は本番が行う。
4. 専用 bare Git が対象原稿だけ同期する。開発 checkout の dirty/ahead/behind は入力に使わない。同一ファイル競合はその原稿だけ保留する。
5. canonical mailbox の要求を本番が CAS claim する。真正な採用と現行比較集合を再検証し、実際の別 reviewer 呼出しが成功した場合のみ同一内容 hash に署名する。
6. 本番に AI 設定がない場合は公開せず、下書きレビュー依頼を維持する。通知には canonical と deployed の exact bytes 一致、および本番 admin の同じ一件レンダラーでの表示可能性が必要。
7. 通知は公開済み／要レビューを区別する。Telegram から approve/publish しない。

## 専用 runner

既存 `com.mitani.aisoukai-media-ops-mwf` の月水金 08:30 JST を維持する。新 cron、別 dispatch は作らない。管理者がレビュー済み immutable release を既存 installer で導入する。旧 checkout を実行場所に戻さない。

実行形（導入操作は別の検証済み実行契約で行う）:

```sh
/opt/homebrew/bin/node --env-file=/Users/caelus/projects/aisoukai-media/.env.local --env-file="/Users/caelus/Library/Application Support/AisoukaiMWF/runtime-metadata.env" "/Users/caelus/Library/Application Support/AisoukaiMWF/releases/<reviewed-sha>/scripts/ops-mwf.mjs" --production
```

非秘密 `runtime-metadata.env` は MWF_STATE_ROOT、MWF_TOPICS_PATH、MWF_INVENTORY_PATH、MWF_RUNNER_VERSION の既存4項目。MWF_INVENTORY_PATH は保全済み `input/editorial-metadata-c76186738639dfceec7766fc1daf5975a844cd84e4b2963c318b3ab7cf1e6c49.json` を指す。MWF_RUNNER_VERSION は実行 release の SHA と一致させる。既存 .env.local の内容を閲覧・変更・複製しない。

`--production --status` は状態確認、`--production --retry-only` は保存済み原稿の配送再試行。生成失敗/unknown、送信 unknown を自動再実行しない。SQLite lock は異常終了時にも同時実行を防ぐ。保存済み queue は新規候補 intake の失敗から独立して処理する。

## 保全と制限

54件の保全、8件 local-only、4件 quarantine を維持する。schema1 reconciled:false を書き換えない。比較は許可された公開 editorial metadata のみで、原本全体は opaque hash、本文・私的 request を decode/AI 送信しない。固定 anchor と本番署名済み比較履歴に現行 canonical metadata を追加し、コードだけの SHA 更新や新記事の追加で全 intake を永久停止させない。

過去の環境調査では本番 reviewer 設定と真正な topic adoption sidecar が未確認だった。2026-09-15 の独立ローカル検証では本番に接続しておらず、現在の有無は未実測。未証明候補は個別 hold となる。これらを復旧完了や公開成功と表現しない。過去の真正な証拠が確認できるものだけ移行対象とし、unsigned Git commit や記事承認ログからテーマ採用を捏造しない。

normal 下書きと minor 修正の本番審査経路を実装済み。minor CLI は `ops:mwf:minor -- --proposal /absolute/proposal.json` で固定先へ不変 proposal を同期する。真正な署名 Human 承認 baseline、医療意味不変の独立審査、同一 hash の本番反映確認が必要で、旧 reviewed:true だけでは進めない。詳細は [本番認証と minor 修正](../mwf-server-authentication.md) を参照。ローカル合成テストは実際の同期・審査・公開・通知の成功証跡ではない。

## レビュー済み runner の導入手順

既存 `ops:mwf:install` は reviewed commit と manifest を必須にし、開発 checkout / `--force` を登録しない。以下は別の `mwf_runner_install` 実行段階でのみ実行する。

```sh
npm run ops:mwf:install -- --commit <reviewed-sha> --manifest /absolute/release-manifest.json --manifest-sha256 <reviewed-manifest-sha256>
npm run ops:mwf:job-status
```

先に固定 root の `releases/<reviewed-sha>` を用意し、manifest（`schema:1`, `files:[{path,sha256}]`、path 昇順）の全ファイルを独立レビュー済み bytes と一致させる。installer は SHA / clean tracked paths / manifest digest / 全内容 hash / Asia/Tokyo timezone を確認する。実行中の既存 job は変更しない。旧 plist は rename で保全し、bootstrap 失敗時は元に戻す。kickstart、RunAtLoad、ファイル削除、秘密値の取得やコピーは行わない。インストール成功は scheduled business recovery の証拠ではない。
