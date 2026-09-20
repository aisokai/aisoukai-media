# 2026-09-20 生成済み画像4点の適用

## 範囲と結果

先生が別タスクで生成・保存した4画像を、指定した4記事の画像ヘッダへ適用。本文と元の日付・topic IDは保持。既存画像ライブラリ159件は変更せず、用途限定の4件を追記。元のcanonical作業ツリーは変更していない。

生成元: `01a0b6ea-30d3-7433-a1cf-34fafc13050d`。4点ともPNG、1672×941。生成サービスの利用条件は本作業で独立確認しておらず、`license_status: pending_review` と先生の用途限定指示を別々に記録した。

| 対象 | 新しい画像 | 本文SHA-256（変更前後一致） |
| --- | --- | --- |
| ホーム／オフィスの違い | `preventive/whitening-home-office-comparison.png` | `7f0cd1a9143d31c04007d27185d8563d4d4f92ce7a606b7ed885fd116adca983` |
| ホワイトニングの回数 | `preventive/whitening-treatment-planning.png` | `54963428ad5015e4c47e147abaa1a96691047eab736b7a6c2d780e21eeaab371` |
| 歯ぐきが下がった原因 | `periodontal/gingival-recession-comparison.png` | `5963b304f16884f332a5311f5c131e55c04f1427d952edfc0d27ccc3519ae872` |
| 乳歯の虫歯 | `pediatric/primary-tooth-caries-progression.png` | `975c03815639e6d769d234c3d949b14022e8092621f0700029cacf06840d09f3` |

画像パスはすべて `public/images/library/` 配下。

## 画像確認と保留事項

- ホーム／オフィス比較: 自宅用トレーと医院での施術を左右に示す。比較記事の主題向け。
- ホワイトニング回数: カレンダーとシェードガイドによる相談場面。具体的な回数や白さを保証する図ではない。
- 歯肉退縮: 歯肉位置と露出した歯根の比較模式図。原因や診断を断定しない。
- 乳歯の虫歯: 一般的な虫歯の内部への進行を示す模式図。乳歯特有の解剖や後継永久歯への影響を描いた図とは認定せず、altも「説明用の模式図」に限定する。
- ホワイトニング比較記事には、本作業前からホーム／オフィスの記述が矛盾する可能性を示す `generation_warnings` がある。本文は変更しておらず、医学的内容の審査は未完了。画像適用を記事の正確性・公開承認としない。
- 歯肉退縮・乳歯虫歯の2記事にはHuman承認済みヘッダがあった。画像変更版は `draft:true`、`reviewed:false` とし、従来の `reviewed_by`、`reviewed_at`、`reviewed_content_hash` は旧版の証跡としてそのまま保持。承認履歴ファイルも変更しない。
- 本作業は画像割り当てと選択バグの修正であり、全記事の本文・医学的内容や既存素材の権利を一括認定しない。

## 再発防止

MWFは明示的なtopic ID・タイトルの対応、視覚確認記録、用途許可、ファイル同一性を確認して選択する。曖昧な候補・重複登録・不足時は未設定と理由を保持し、既存レビュー依頼へ不足を表示する。先生指示の別タスクで生成→保存→確認→適用する手順は `docs/blog-image-workflow.md` に記録。

ライブラリにハッシュ未登録の旧画像も、同じリビジョンのGitツリーから選択画像との同一blobを検出し、別名登録による重複を拒否する。

## 検証

- `node --test tests/mwf-images.test.mjs tests/mwf-production.test.mjs`: 31件PASS。外部通信はsynthetic stubのみ。
- 対象4 JavaScriptファイルへのESLint、および `git diff --check` はPASS。
- 4画像の保存前後SHA-256一致、対象4記事の本文bytes一致と日付・topic ID・既存承認履歴保持を個別検証。
- 本変更には画面レイアウトの変更なし。実画像を目視確認。既存16:9表示に対し1672×941はほぼ同じ比率。
- commit、push、deploy、runner、画像生成、通知送信は実装workerでは実行しない。リリースの実行状態とbuild結果はManagerの最終証跡に従う。
