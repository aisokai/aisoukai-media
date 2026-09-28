# 画像適用記録 2026-09-28

## 対象と根拠

- 先生指示: `teacher_20260928_generate_and_apply_suitable_images_when_missing`。適合画像がない場合は、同じ作業内で適切な画像を生成して充てる。
- 対象: `content/posts/2026-09-23-mwf-06399562381d485b05518cadbe8abb167d25dc0b9f51b46a12128638b9149130.md`
- Topic: `MONTHLY-202609TOPIC023` / インプラントと入れ歯の違いは？相談前の整理
- 適用画像: `public/images/library/implant/implant-denture-consultation-20260928.png`
- 生成元: `/Users/caelus/.codex/generated_images/01a0a345-a8f5-7ab2-8ca2-be650da39293/exec-856ed5b9-96d7-4a8e-8798-bd8d082ed794.png`
- SHA-256: `43a9e95623e408320e14ac3275766860942dceb0476622c6d0eea0eae54a2ff7`
- Git blob: `c78d809bc5375e430dcc89a6f8c479912b2597e7`
- PNG: 1536 × 1024、1680171 bytes。

## 実物確認と方法

本タスクの組み込み image_gen で新規作成した（モデル名は未確認）。構図の要約は「明るい歯科相談室の机に、説明用インプラント模型と取り外し式入れ歯模型を並べる。実患者・文字・ロゴ・治療成果の表現を含めない」。生成物を実際に目視し、独立したインプラント模型と入れ歯模型が並び、相談前の治療選択肢比較という主題に合うことを確認した。説明用の生成イメージとして扱い、正確な解剖図・実際の診療写真・治療効果の証拠とはしない。適合範囲は許可された記事題名とテーマであり、本文との最終照合は記事審査で行う。

旧画像 `/images/library/implant/implant-denture-consultation-comparison-20260922.png` の割当は stock_pending_article_review / article_path:null であり、今回の下書き用に実物確認済みの割当ではなかった。旧画像を不適合と断定せず、先生の新規生成・適用指示に基づき専用画像へ置き換えた。旧画像は保存したまま。旧 topic_assignment を previous_topic_assignment に記録し、現在の topic_assignment は新画像 1 件だけに置き換えた。旧画像の他の来歴・利用記録を新画像へ流用していない。

新画像の license_status は pending_review のまま。先生の指示と同一画像 SHA-256 に限定した draft_use_authorization を記録した。独立した利用条件審査済み・公開承認済みとは扱わない。

### 生成 prompt の要約

Use case: scientific-educational. Japanese dental blog 3:2 cover for 「インプラントと入れ歯の違いは？相談前の整理」. Clean neutral soft 3D editorial consultation desk; single white molar crown on a short silver threaded implant fixture and stand; separate pink U-shaped removable lower denture; equal emphasis, wide safe crop margins; blank notepad and pen; off-white and pale blue. No people, patient data, surgery, blood, bone, cutaways, text, logo, watermark, outcome claims or ranking. 実行した全文 tool prompt は生成元タスクの実行記録を正本とする。

## 不変確認

- Markdown 本文は opaque bytes として保持し、復号・出力せず前後一致を確認。
- 本文 SHA-256: `e8c7331edefe86939abf744b940299cd132146364f73083cf581da045b111920`（前後同一）。
- 記事全体変更前 SHA-256: `c31255865f703d1c9919465739367818d9dc0cf6c3e5cd99b5e663faa043982c`。
- 記事全体変更後 SHA-256: `1e208cb3065888b01b39b65af30a6ccad4a4db5043decd6a06bfbe8fc44bc559`。
- 変更キーは image / image_alt / image_content_hash / image_selection_status / image_selection_reason のみ。
- 元の日付 2026-09-23、topic ID、draft:true、reviewed:false、auto_approved:false を保持。
- state / claims / 署名承認記録は変更していない。今回の記事版は引き続き未審査下書き。

## 検証

- `node --test tests/mwf-images.test.mjs`: 9 PASS。
- `eslint scripts/lib/mwf-images.mjs tests/mwf-images.test.mjs`: PASS。
- `git diff --check`: PASS。
- 配置済み実画像の SHA-256 / Git blob / PNG 寸法と登録情報一致: PASS。
- HEAD の対象下書きを opaque bytes で読み、`isDraftImageOnlyChange(baseline,current) === true`: PASS。追跡済み claim / receipt の書換えは不要。
- 同関数とは別に Markdown 本文の bytes 前後一致: PASS。
- topic_assignment が対象 topic について 1 件: PASS。
- HEAD の Git tree に新画像の blob を加えたローカル検証用 inventory で `selectMwfImage` が新画像および `assigned_pending_review` を返す: PASS。既存画像と同一 blob でないことも selector で確認。
- 実物を目視し、図の主題・altとの一致、文字・ロゴ・人物がないことを確認。記事本文の審査 PASS は意味しない。

独立レビューは Manager が別 identity で実施する。本作業はローカル変更であり、commit / push / deploy / 記事公開・通知送信・cron 実行を行っていない。
