# MWF 自動作成の接続修復（2026-10-07）

## 対象と原因

既存の固定テーマ集は過去候補と重複し、新規に採用できるテーマを補充できなかった。採用と署名の接続修復は別 worker が担当する。本変更は既存 MWF runner に未採用候補の補充と、採用済み記事に適合画像がない場合の画像準備を接続する。実データ変更・実 API・通知・runner 実行はこの worker では行っていない。

## 候補の補充

- 通常実行では既存の記事配信処理の後に補充する。補充失敗で、完了した記事配信を失敗扱いに戻さない。
- 今月を優先し翌月まで。1 回に最大 6 件、今月・翌月のいずれか 1 ファイルだけを変更する。実行日以降の MWF 日付を割り当てる。
- 比較用記事タイトル、採用 CSV のタイトル、全月候補のタイトルと正規化一致・保守的な関連判定で比較する。本文をプロンプトに入れない。別の切り口まで完全に判断できるものではなく、最終的に先生が採用を選ぶ。
- 既存 status、却下、保留、メモを変更せず、未使用 ID の pending 候補だけを追記する。不足時に類似テーマで埋めない。署名採用証跡は自動作成しない。
- 新規候補は固定 JSON 形式・6 件以内・許可カテゴリ・文字数・保護情報チェックを通す。
- journal を paid request 前に durable 保存する。結果不明・壊れた結果は自動再生成しない。main の競合時は保存済み提案を最新候補へ追記し直す。新たな AI 呼出しはしない。
- GitHub 非 force ref 更新後、保存された候補を current main の固定 revision で確認してから、固定 admin URL を通知する。後続の Human status／メモ更新は保持したまま復帰できる。
- 通知結果不明は再送しない。通知が明確に未送信なら保存済み候補から再試行できる。

候補の準備と通知だけを行う CLI（別途承認済み execution descriptor による実行時に使用）:

```sh
node scripts/ops-mwf.mjs --production --prepare-topics-only
```

このモードは article generation、article sync、review、公開に進まない。他の業務フラグとの併用を拒否する。今回この実コマンドは実行していない。CLI テストはすべて合成 adapter で実行した。

## 適合画像の準備

- server.prepare が現在の採用署名と topic version を確認し、既存重複 precheck が通った後だけ画像作成に進む。
- 固定 OpenAI images endpoint、1 枚、1536×1024、medium、PNG。コード上のモデルは `gpt-image-2.5-sunburst`。実環境での利用可能性は未検証。
- topic version ごとに paid attempt を durable 保存する。不明な生成結果、画像確認結果、commit 結果を理由に再生成しない。
- 別 chat request が実際の画像 bytes とテーマを照合する。適合・医療的正確さ・誤認防止・識別可能な人物不在のすべてが true の場合だけ保存処理へ進む。記事公開承認は付けない。
- SHA256 と Git blob を持つ PNG、library の既存 schema fields、creation request ID、visual review ID、topic version、利用許諾 evidence を原子的に保存する。既存画像を流用して空欄を埋めない。
- 利用区分 approved は既存アカウントで生成した出力を先生のブログで使う明示指示に基づく。copyright guarantee、独占性、法的審査、Human による画像審査を意味しない。出典は OpenAI Services Agreement §4.1／4.3／4.4。既存 server の画像・医療・重複・本文審査を省略しない。
- 公開画像 URL の MIME と SHA256 を確認するまで記事本文を生成しない。デプロイ待ちは cached bytes を維持する。library から既存生成画像が選ばれる再実行でも公開 bytes を確認する。次の通常 MWF 実行で新規テーマがなくても、確定した image_deployment_pending だけは元 slot と topic を再検証して再開する。明示 retry-only／不明な paid 結果は再開しない。
- 画像が未反映または生成・確認結果不明なら、既存 slot 通知 journal で一度だけ説明する。採用し直す操作を求めない。

コード既定値は automatic images 有効。実行許可は Manager が管理する限定 image endpoint amendment と reviewed execution descriptor に依存する。この worker は policy の適用、インストール、API 実行を行っていない。

## 合成検証

```sh
node --test tests/mwf-auto-images.test.mjs tests/mwf-candidate-supply.test.mjs tests/mwf-production.test.mjs tests/ops-mwf.test.mjs tests/mwf-delivery.test.mjs tests/mwf-intake-notice.test.mjs
npx --no-install eslint scripts/lib/mwf-production.mjs scripts/lib/mwf-candidate-supply.mjs scripts/lib/mwf-auto-images.mjs scripts/lib/mwf-intake-notice.mjs scripts/lib/mwf-delivery.mjs scripts/ops-mwf.mjs tests/mwf-production.test.mjs tests/mwf-candidate-supply.test.mjs tests/mwf-auto-images.test.mjs tests/ops-mwf.test.mjs
```

主な検証は、既存判断の保持、通知後の再送防止、paid 結果不明の再試行防止、競合時追記再計画、後続 commit 後の復帰、未採用・保護テーマの画像 API 呼出しゼロ、画像未反映時の記事生成ゼロ、画像反映後に一度だけ unreviewed draft 同期、画像生成による記事承認の非付与。

Next build／UI 目視は Manager 担当。実際の provider 出力品質、モデルの利用可能性、本番デプロイ待ち時間は合成テストでは証明していない。未知の paid／通知結果は運用確認が必要であり、成功と扱わない。


## 同日過剰補充の修復

採用後の selected テーマは、自分自身の MONTHLY CSV 行とタイトル一致し、旧判定では在庫から除外されていた。採用による status 変更で補充 journal の cycle も変わるため、採用のたびに新規提案を課金生成する余地があった。

補充在庫だけに使う予約枠を追加した。候補・CSV・採用 receipt・比較 metadata を同じ main revision に固定する。selected の厳密な MONTHLY ID、CSV approved、候補との意味 field／日付／risk 一致、receipt の schema／purpose／repository／policy／topic ID／topic version を確認する。比較から外すのは自身の CSV 1 行だけで、別 ID・実記事・他月の重複は引き続き除外する。既存 delivery に topic ID があるもの、consumed／archived／in-progress は予約枠に数えない。

これは追加候補課金を抑える予約枠であり、Mac では HMAC 署名を検証しない。真正な採用認定や生成許可ではなく、server.prepare／公開審査には結果を渡さない。署名検証は従来どおり server の責任である。receipt 404 の旧 selected は 0 件、receipt 読取異常・binding 不正・ID 重複は stock-unverified とし、追加生成を止める。

合成回帰では、採用後の自己 CSV 一致、5 件中 1 件が delivery 処理中で残り 4 件、旧採用の receipt 不在、used topic、consumed、別 ID／記事／他月重複、receipt 破損／取得失敗／purpose・version 不一致、意味 field 差異、ID 重複を確認した。実データ・main・審査 API・認証設定は変更していない。
