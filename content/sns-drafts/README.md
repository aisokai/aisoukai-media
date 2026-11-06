# SNS Drafts

Instagram / X / Threads / Facebook / LINE などの SNS ドラフト置き場。`publish_mode` によって経路が分かれる。

ファイル名は `YYYY-MM-DD-<platform>-slug.md`（platform: instagram / x / threads / facebook / line / youtube / website）。対象は医療法人藍想会の公式アカウントのみ。

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

- `media_files` は `public/images/` 配下の通常ファイルの repo 相対パスのみ（絶対パス・`..`・ドットで始まるパス・経路上の symlink・ハードリンクは不可）。読み込みは検査済みのファイル実体に結び付けて行う。
- 脅威モデル: repo への書き込み権限を持つ主体は信頼する（そうした主体はドラフトや証拠ログ自体も書き換えられるため）。誤操作・誤設定・単純な差し替えで許可領域外を読まないよう補強しているが、経路上の要素を高速に差し替え続ける競合までは完全には排除しない（先生決定 2026-11-06）。
- レビュー後は `mutual_review` を正本とし、互換用の top-level `reviewed: true` / `reviewed_by` / `reviewed_at` を同じ値で持つ（不一致はエラー）。
- `approved_for_manual_post` は常に `false`。Human 承認 CLI（`sns:approve` / `sns:reject`）の対象外。
- `mutual_review` / `created_by` を manual_only のドラフトに含めることはできない。
- 患者が特定され得る内容・個別相談・クレーム・判断が割れたものは `escalated`（`exception_category` 必須）とし、自動フローから外す。
- 検証: `npm run media:sns:validate`（構造検証 + 証拠照合。証拠なし・hash 不一致・同一系統・ペア外・policy_version 不一致・チェーン破損はすべてエラー）。

## 短文フォーマット（X / Threads）

ブログや Instagram キャプションの全文転載ではなく、短文に要約・再構成する。医院テイストの型（挨拶＋院名 → 患者の疑問をフック → 要点の予告 → 相談・来院の呼びかけ → 署名）を短く圧縮し、診療時間・休診日・住所・電話などの事実は変えない。

| 項目 | 規則 | 検証 |
|---|---|---|
| 文字数上限 | **未確認**（公式の現行値を確認できていないため推測で設定しない） | 検証しない。確認後に値と根拠をここに記録してから追加する |
| ハッシュタグ | 本文の末尾にまとめる。個数上限は**未確認** | 末尾以外にあればエラー（個数は検証しない） |
| リンク | 医院サイト・予約ページ等は本文中1件まで | 2件以上は警告（エラーにしない） |
| メディア | `media_files` に `public/images/` 配下の repo 相対パスを列挙（なしは省略） | hash 算出の対象 |

Facebook は Instagram のキャプション型と短文型の中間とし、短文フォーマットの検証対象外（共通の検証のみ）。

## お知らせ投稿（臨時休診・診療時間変更）

frontmatter に `notice_type: temporary_closure_notice` または `schedule_change_notice` を指定すると、本文の日付・曜日・時刻を検証する（全 platform 共通）。

- 本文に日付（`11月10日`・`2026年11月10日`・`2026-11-10`・`11/10`）の記載が必要で、そのうち1つは frontmatter の `date` と一致すること
- `（火）` などの曜日表記は、その日付の実際の曜日と一致すること
- 時刻（`9:00`・`9時30分` 等）は実在する時刻であること
- 時刻と休診・変更内容そのものの照合は、構造化された項目が無いため検証していない（レビューのチェックリスト `facts` で確認する）

**現時点の位置づけ（先生決定 2026-11-06）**: 上記はお知らせ投稿の**補助チェック**であり、次の2点は未対応。お知らせ投稿の自動化（`*_notice_auto` を ON にする判断）の前に、別の指示書で設計・実装する。

1. `notice_type` を宣言しないお知らせ投稿は日付チェックを通らない（宣言の省略・media queue のジョブ種別との照合が未実装）。
2. 本文の対象日・時刻と、実際の休診・変更内容（構造化された正本）との照合が未実装。レビュー証拠の hash（`sns-content-hash/v1`）にもお知らせ内容の構造化項目は含まれない。

それまでの間、お知らせ投稿は自動運用の対象にしない（フラグは OFF のまま。変更は先生のみ）。

お知らせ投稿の自動化フラグ（`*_notice_auto`）は初期値 OFF で、変更は先生のみ。
