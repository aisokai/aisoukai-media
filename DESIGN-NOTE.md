# DESIGN-NOTE: 未知パス（インベントリ/claims未登録）の公開済み記事に対する照合修復

- 対象ブランチ: `fix/mwf-unknown-path-comparison-20261109`（開始HEAD `41fd8f28e6759b94a928e0730d90d214c7df4773`）
- 障害: 2026-11-09の月水金生成が全12候補 `comparison_metadata_unavailable` で停止。原因は `content/posts/2026-11-07-monthly-notice.md` が固定インベントリ（54 entries）と `data/mwf/claims/*` のどちらにもエントリが無い「未知パス」で、`approvedComparisonUpdates` の冒頭ゲートが即 throw したこと。
- 設計根拠: 三谷が2026-11-09に推奨案を採択（Macは未知パスで即停止せずサーバ判定へ委ね、サーバは証拠3点が揃う場合に限り照合用としてだけ認める。承認扱いにはしない）。2026-09-22の同型修復（既知ファイル向け comparisonOnly projection）が先例。
- データ（記事・claims・receipt・インベントリ・media-gateフラグ）には一切触っていない。署名付きデータの手書き追加はしていない。

## 変更の要点

### `scripts/lib/mwf-human-comparisons.mjs`（共有lib）
- `approvedComparisonUpdates` に任意引数 `readUnknownMetadata`（Mac用）と `verifyUnknownPublished`（サーバ用）を追加。
- 変更ファイルの振り分けを変更: type/PATHの検証は従来どおり全件先行。canonicalエントリ（非quarantine・metadata付き）があるパスは従来処理を完全維持。**未知パスは「エントリが一切無いパス」に厳密に限定**する。エントリはあるが既知扱いにならないパス（quarantine、metadata無し、localのみ）は従来の冒頭ゲートどおり拒否され、未知フローへは漏れない（独立レビュー指摘を受けて修正・回帰テスト追加）。エントリの無いパスは `comparisonOnly` 呼び出しでのみ後段処理へ進み、それ以外の呼び出しでは従来どおり `comparison_metadata_unavailable` で拒否。
- サーバ経路では、既知フローと同様に receipt verifier の存在も必須とした（欠如すれば `approval_verifier_required`）。
- receipts の一覧取得・検証は従来どおり per-file 処理（＝記事取得）より前に実行されるため、偽造receipt＋未知パスでも従来どおり記事取得前に拒否される（回帰テスト追加済み）。
- 未知パスの受理形は既知ファイルと同じ `comparisonProjection`（path＋gitBlob＋metadataから決まる照合専用digest）に `unknownPath:true` を付けたもの。承認記録ではなく、blob は記事bytesのハッシュではない。
- Mac経路（`readBytes` なし）: `readUnknownMetadata` が返す公開metadataで projection を「提案」するだけ。検証コールバックが無い場合は従来どおり拒否（fail closed）。
- サーバ経路（`readBytes` あり）: `verifyUnknownPublished` が必須で、無い場合は従来どおり拒否。検証が例外を投げるか metadata を返さなければ受理しない。

### `scripts/lib/mwf-unknown-published.mjs`（新規、サーバ専用の証拠検証）
`validateUnknownPublishedEvidence({data, content, reviewHistoryText, path, commit})` が、次をすべて満たす場合にだけ true を返し、1つでも欠ければ `unknown_published_unproven` を投げる。
1. **reviewed記録＋ハッシュ再計算一致**: `draft:false`、`reviewed:true`、アーカイブ/却下でない、`reviewed_by`・`reviewed_at` が有効、保護入力でない、そして `reviewed_content_hash` が `getReviewedContentFingerprint(data, content)` の再計算と完全一致する。fingerprint は承認系フィールドを除外して本文と非承認frontmatterを束縛するため、審査後に本文やメタデータが変わっていれば一致しない（＝変更は拒否）。
2. **レビュー履歴**: `logs/review-history.md` に、当該slugの `action: approve` 記録があり、`reviewed_by` が frontmatter と一致するブロックが存在する。
3. **Humanコミット**: 後述の attribution が存在し、author/committer の名前・メールが自動化identity（`MWF Draft Runner` / `mwf@users.noreply.github.com`）に一致しない。

### `scripts/lib/mwf-production.mjs`（Mac）
- `localComparisons` の呼び出しに `readUnknownMetadata` を追加。未知パスのファイルだけ、既存の GitHub contents スコープ内で bytes を取得し、`metadataEntry`（frontmatterの公開4キーだけを抽出し、本文はデコードしない）で metadata を作る。取得bytesの gitBlob が listing の sha と一致しない場合は `comparison_current_changed` で停止する。
- Macは署名検証・証拠検証を一切行わない。Macの projection は候補であり、サーバが同じ projection を再導出できなければ prepare の comparisonHash が一致せず先へ進まない（既存の hash 束縛がそのまま効く）。

### `src/lib/mwfServerRuntime.ts`（サーバ）
- `comparisons()` に `verifyUnknownPublished` を実装: 現行bytes取得→gitBlob一致確認→gray-matterで解析→レビュー履歴テキスト取得→attribution取得→`validateUnknownPublishedEvidence`→`metadataEntry` で metadata を再導出し返却。metadata が取れなければ `comparison_metadata_unavailable`。
- 失敗理由コード `unknown_published_unproven`（および attribution の入力検証コード2件）を `safeComparisonFailure` の公開コード集合に追加。

### `src/lib/githubContents.ts`
- `readGitHubPathCommitAttribution(path, gitBlob, ref)` を追加（下記）。

## (3) Humanコミットをどう検証したか
- サーバの実行環境（Vercel Functions）には git 履歴が無いため、GitHub API で検証する。既存の `readGitHubApprovedBaselineBytes` と同じ bounded 手法: `GET /commits?path=<path>&sha=<ref>&per_page=20` で対象記事の直近20コミット以内に限定し、各コミット時点のファイル blob sha を contents API で取得して、現行 gitBlob と一致する最新コミットを特定する。その commit の `commit.author` / `commit.committer`（名前・メール）と GitHub の `author.login` を返す。
- 判定は「自動化identityでないこと」の確認に限る。monthly-notice の実コミット（`8719bc7`）は author/committer とも `Caelus20250613 <234753314+Caelus20250613@users.noreply.github.com>` で、この基準を満たす（本ブランチの検証でも、ローカル git log から得た同値を用いて実記事の証拠検証が受理されることを確認済み）。
- **正直な限界**: git の author/committer は自己申告であり、暗号学的な本人証明にはならない。この確認は証拠(3)単体では弱く、(1) fingerprint で束縛された reviewed 記録と (2) append-only のレビュー履歴と組み合わせて初めて採用根拠になる、という位置づけを維持する。検証を偽装する実装（署名の模倣、reviewed記録の後付け生成）はしていない。

## 残るリスク
- **Mac/サーバの metadata 一致依存**: 両側とも `metadataEntry`（同一の抽出実装）を使うため決定的に一致するが、frontmatter の公開4キーに保護表現や抽出不能な形式が含まれる未知記事は、Mac側で metadata が取れず従来どおり全停止する（安全側。意図的な fail closed）。
- **下書きの未知パス**: Macは下書きでも projection を提案するが、サーバが `draft:false` を必須とするため prepare で拒否され、生成は進まない。Macの snapshot 段階では未知の下書きが重複判定の metadata として現れるが、これは「存在する記事との重複を見逃さない」安全側の挙動であり、公開可否には影響しない。
- **attribution の20件境界**: 現行blobを導入したコミットが対象パスの直近20コミットより古い場合は attribution が取れず拒否される（安全側）。通常の手動投稿では直近コミットが該当するため実害は小さい。
- **レビュー履歴の形式依存**: 履歴ブロックの `slug:` / `action: approve` / `reviewed_by:` の行形式が変わると (2) が満たせず拒否される（安全側）。
- **prepare 以降の段**: 本修復は照合スナップショット段まで。次点として残っていた WebP記事（下書きの画像のみ変更経路）と11/6記事（管理画面承認の receipt 経路）は prepare 段で最終判定されるため、本番反映後に理由コードで切り分ける必要がある。
- **claim 永続化による「既知化」（独立レビュー指摘、本修復の範囲外）**: 未知パスが一度受理されると、その projection を含む照合集合がサーバ署名付き claim として永続化され、次回以降そのパスは「既知パス」として扱われる。その後に同じファイルが正当に再審査・再公開されても（新しい fingerprint・履歴・Humanコミットが揃っていても）、既知フローの baseline 候補から comparisonOnly エントリは除外されるため、receipt の無い手動投稿経路では `comparison_unreviewed_change` 等で拒否され得る。安全側の制限だが、同一パスへの再編集（同月内のお知らせ訂正など）で顕在化し得るため、将来のフォローアップとして記録する。月次お知らせは通常は月ごとに新規ファイルになるため頻度は低い。

## 検証結果（ローカル）
- 変更前ベースライン: 対象3テストファイル 57/57 合格（npm ci 後）。
- 変更後: 70/70 合格（追加13件: 未知パスのMac/サーバ同一projection、verifier/metadata欠如での fail closed、証拠失敗での拒否、偽造receiptの先行拒否、証拠3点の充足/履歴欠落/履歴の継ぎ接ぎ/ハッシュ不一致/本文変更/下書き・未審査/アーカイブ/automation（author・committer別）・attribution欠落の各拒否、quarantine・local-onlyパスの従来ゲート維持、attribution取得の境界・null・最新一致選択）。
- 独立レビュー: 高重大度の指摘なし。中2件（quarantine等の未知フロー漏れ→修正済み／claim永続化による既知化→残るリスクに明記）、低2件（サーバ経路の verifier 必須化→修正済み／テストの突き不足→主要分を追加。実配線を通す統合テストは未追加で、ハッシュ一致はコード精読＋実記事検証に依存する点は残る）。
- 実記事検証: monthly-notice 実物の frontmatter＋レビュー履歴＋実コミットattribution で `validateUnknownPublishedEvidence` が受理することをローカルで確認（コミット値は git log 由来。GitHub API 経由の取得はロールアウト後の実機確認事項）。
- ESLint（対象6ファイル）合格、`git diff --check` 合格、`tsc --noEmit` は変更前後ともエラーなし。

## ロールアウト時に必要な手順（本タスクの範囲外・別途承認事項）
1. 独立レビュー（repo治理 v3 プロトコル）の完了と、本ブランチの push・main への反映についての三谷の明示承認（reviewed non-force push）。サーバ側は Vercel Production のアプリコードに `mwfServerRuntime` が含まれるため、main 反映でデプロイされる。
2. **Mac runner のリリース差し替え**: ops-mwf は main 追随ではなくリリース・スナップショット運用（`MWF_RUNNER_VERSION` が snapshot の commit と一致しないと起動拒否される）。新しい snapshot の作成・配置と `runtime-metadata.env` の更新が Mac mini 側で必要。これは Mac mini 実機作業であり三谷の実施判断が要る。
3. 復旧確認: 次回 slot（2026-11-11 水 08:30）の runner.log で `candidateHolds` の解消と記事生成を確認する。slot を待たない手動実行は live execution に当たるため別途承認が要る。
4. prepare 段に進んだ後、WebP記事・11/6記事が各経路で通るかを理由コードで確認する。通らない場合は別件として切り分ける。
5. インベントリファイル（anchor `c7618673…`）は本手順では変更しない。
