<!-- BEGIN:mwf-unreviewed-draft-sync-policy -->
## MWF 未審査下書き同期の退役記録（2026-08-24）

旧 MWF 処理は、allowlist に一致する `draft:true`、`reviewed:false`、`auto_approved:false` の編集用artifactだけを GitHub `main` へ同期する設計だった。これは履歴説明であり、cron、agent dispatch、push、通知、approve、publish を許可または起動する現行ポリシーではない。

現行のagent作業はローカル下書き生成・validation・Human review準備までに限定する。GitHub同期は別途v3 task contractが `reviewed_non_force_push` を明示し全条件を満たす場合だけ検討できるが、第三者への通知・コンテンツ送信、approve、publish、cron、auto-dispatch、send-keys、live executionはTeacher standing directiveにより禁止する。
<!-- END:mwf-unreviewed-draft-sync-policy -->
<!-- BEGIN:repository-policy -->
# Canonical repository policy

## Policy record

- Policy version: `aisoukai-media-tiered-blog-sns-2026-11-06`
- Gate profile: `STANDARD_NON_STOP`
- Answer date: `2026-08-18`
- Evidence reference: `teacher_message_2026_08_18_yes_gui_and_aisoukai_standard_non_stop_policy`
- Teacher data handling declaration: `NO_SENSITIVE_DATA`
- Declaration scope: DMP code, configuration, documentation, and tests only; no real data, secrets, credentials, patient data, or private-message bodies.

The 2026-09-06 governance-cleanup declaration is task evidence only. It does not replace or broaden this repository-specific intake record.

## Declared boundary and operations

- Affected paths and data flow are limited to non-sensitive DMP code, configuration, documentation, and test artifacts in this repository, processed locally without real-data access.
- Metadata-only sources are repository policy, paths, and runtime configuration; the only sink is the local repository workspace.
- Allowed reversible work in this declared scope: local edits, validation, tests, lint, builds, browser verification when UI changes require it, bounded repairs, targeted local commits after the seven completion gates, and—when separately declared by a v3 task contract—reviewed non-force push, repository sync, CI, preview or production application-code deploy, and machine-to-machine artifact transfer.
- The 2026-08-24 MWF auto-sync record is historical and non-executable. Current agent work may prepare and validate local unreviewed drafts, but it must not register or invoke a scheduler, push, notification, approval, or publication from that record.
- Prohibited in this declared scope: reading or writing secrets, credentials, tokens, production environment values, patient data, or private-message text; `THIRD_PARTY_HUMAN_DATA_TRANSFER`; external AI API use; payment or contractual actions; destructive or irreversible operations; cron, auto-dispatch, send-keys, and live execution. These standing prohibitions are not converted into Human Gates and no old authorization unlocks them.
- Re-question only when the objective crosses this declaration, target, risk class, or sensitive boundary. A future explicit Teacher change is required to alter a standing prohibition.

## v3 execution

- The active development protocol is `manager_worker_reviewer_v3` with `execution_container: "visible_task"`; the teacher-facing secretary is not a development manager.
- Every development intake records one Teacher-first data declaration, bounded non-overlapping worker ownership, operation risk, standing authorization, and the seven completion gates. Independent review must clear correctness and safety before completion.
- Runtime model and effort remain `unverified` unless official evidence is available. Legacy v1/v2, proposal-bound, compatibility, report transport, and reconciliation workflows are retired and must not be recreated.
<!-- END:repository-policy -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:aisoukai-media-rules -->
# aisoukai-media 共通ルール

この repo の作業では、以下を前提にする。

## 基本方針

- この repo は医療法人藍想会の公開メディア運用 repo
- 医療広告ガイドラインを重視する
- agentが扱う記事はローカル下書きとHuman review準備までとし、agentによる公開・外部送信は行わない
- 管理画面は裏方用であり、UI polish より安全性と運用性を優先する

## 絶対禁止

- 未審査記事の自動公開禁止
- AI 自動 approve 禁止
- `reviewed:false` かつ `auto_approved:false` の公開禁止
- Telegram からの approve / publish 禁止
- publish API の実装禁止
- approve API は原則禁止。ただし `/admin/pending-review` の認証済み Human 操作に限り、reviewed/frontmatter と review log を更新する管理画面アクションを許可する
- cron、自動公開、外部通知、外部AI API利用は禁止する
- `git push` はv3 task contractが `reviewed_non_force_push` を明示し、canonical policy・authorization・review・7 gatesの全条件を満たす場合だけ対象になり得る。現在のローカル下書き作業から暗黙に継承しない

## Retired Auto Publish Policy

- 旧 `Auto Publish Policy` は履歴参照専用で、実行・承認・公開の権限を与えない
- `medical_risk`、legal/image checks、重複、build結果はローカルreview候補の判定にだけ利用する
- blocker、出典不足、画像ライセンス不明、重複、build失敗があればローカルのpending reviewに残す
- 旧 `auto_approved` 記録は既存データ互換の表示・検証に限り、新規の自動承認判断を生成しない

## 既存公開状態の互換条件

- `reviewed:true` または `auto_approved:true` のみ公開対象
- 既存 `auto_approved:true` は履歴状態として扱い、agentの公開権限にはしない
- `rejected` 記事は通常 `pending` に混ぜない
- `future date` / `future publish_at` 記事は、承認済みでも公開対象から除外する
- `sitemap` / `category` / `blog` 一覧 / `blog` 詳細 / `metadata` はすべて同じ公開条件に従う
- `admin` 配下は `noindex`

## review 運用

- approve / reject は認証済み `/admin/pending-review` の Human 操作、または Human が明示実行する CLI コマンドで行う
- `scripts/auto-review-post.mjs` が残る場合もローカル診断専用とし、自動 approve・publish・外部送信を行わない
- 管理画面は publish しない。reviewed/frontmatter と review history の更新のみ許可する
- review history は append-only
- 誰が・いつ・何を approve / reject したかを残す

## Telegram

- 旧Telegram通知は履歴上の運用記録であり、agentは送信しない
- ローカルに表示するreview digestから approve / publish しない
- 件数が多い場合の要約もローカルreview準備に限定する

## 作業完了時の報告

必ず以下を報告する。

- 変更ファイル
- 実行した検証コマンド
- build結果
- commit hash
- `git status --short --branch`

## Next.js 補足

- この version は breaking changes が前提になることがある。API / conventions / file structure は学習済み知識と異なる可能性があるため、実装前に関連ガイドを確認すること
- deprecated notice を優先して確認すること

<!-- END:aisoukai-media-rules -->

<!-- BEGIN:blog-mwf-20260914 -->
## 先生によるブログ限定の再許可（2026-09-14）

根拠: `canonical_policy_and_teacher_20260914_approved_blog_scoped_restoration`。この節は上の退役記録・禁止規則のうち、以下のブログ運用に限って先生が明示変更した範囲だけを置き換える。

- 対象は aisoukai-media ブログのみ。月水金 08:30 JST の予定下書き生成、記事生成用の既存外部 AI サービス、先生への既存 Telegram レビュー依頼を許可する。他媒体・他宛先・agent dispatch の許可ではない。
- 非機密の対象ネタから未審査下書きを永続保存し、隔離された Git 領域から対象記事だけを通常同期する。開発 checkout の dirty/ahead/behind は同期基準にしない。対象記事の競合はその記事だけを保留し、main 更新競合は最新 main から bounded retry する。
- 通知は本番の認証済み admin ソースが同一記事・同一内容版をレビュー可能と確認してから行う。push 成功・HTTP 200・ログイン画面だけでは反映確認にならない。
- `draft:true`、`reviewed:false`、`auto_approved:false` を維持する。自動承認・未審査公開・Telegram 経由の approve/publish は引き続き禁止。
- 既存認証機構を用い、認証情報そのものの取得・表示・保存は行わない。患者情報・私的メッセージ・secrets/credentials/tokens の agent による読み書き禁止は維持する。破壊・削除・支払・契約・対象外の第三者送信は禁止のまま。
- 今回の実装契約は隔離 checkout のコードと架空データ検証のみ。push/deploy/live_execution は false。実行 checkout・既存ジョブは変更しない。導入・実運用確認はこのローカル検証の完了と区別する。
<!-- END:blog-mwf-20260914 -->

<!-- BEGIN:blog-three-levels-20260914 -->
## ブログ3段階運用（先生の明示変更、2026-09-14）

Policy version: `aisoukai-media-tiered-blog-2026-09-14`。
根拠: `teacher_20260914_explicit_blog_three_levels_and_scoped_validator_execution_amendment`。
この節が、上記のこのブログ限定の「すべてHuman記事承認」「自動承認禁止」と矛盾する部分を置き換える。対象外の禁止は維持する。

- 軽微: 既に正確な内容版で先生承認済みの記事の誤字・書式・リンク修正で、医療的意味が変わらないもの。元承認版、差分、validation、独立レビューを確認した同一内容hashだけ自動公開可。
- 通常: 先生が新たに採用したネタと承認済み編集方針に沿う記事。本文・画像・重複・医療表現・validation の独立レビューをすべて通過した同一内容hashだけ自動公開可。今回、初期編集方針を承認した。個々のネタ採用は既存の認証済み採用操作に基づく署名証拠を必須とし、CSVのapproved等の自己申告だけでは足りない。
- 重要: 新たな治療方針、効果、安全性、費用に関する説明変更は先生の個別承認を要する。曖昧・レビュー不備・画像権利不明・重複・内容変更があれば下書きに残す。
- 生成とレビューは別の実際の実行identity。署名付きレビュー証拠は内容版・独立identity・採用証拠・policy versionに結び付ける。古いauto_approvedフラグを承認とみなさない。従来の有効な同一hashのHuman承認は保持する。
- 公開一覧・詳細・category・sitemap・metadata・CLIで同一公開判定を使う。rejected、archived、future dateを除外する。患者情報・私的メッセージ・対象外送信・破壊操作は禁止のまま。
- この実装phaseはローカルコードと架空データ検証のみ。実API・実env・記事実データ・push/deploy・ジョブ変更は実施しない。次段階の実運用は別途この範囲を表現できる検証済み契約に従う。
<!-- END:blog-three-levels-20260914 -->


## Server authority amendment (2026-09-14)

Teacher evidence: `teacher_20260914_explicit_server_side_blog_authority_no_secret_replication`.
Within this same blog objective, approval signing and publication authority remain exclusively on the existing production server. Do not copy, export, create an alias for, or replicate the admin signing key onto the Mac runner. The Mac uses its existing internal GitHub authentication to generate/synchronize only unreviewed drafts and bounded canonical request metadata. Anonymous HTTP wake requests confer no authority; the server independently validates the canonical request, genuine topic adoption and pinned preservation evidence, and claims each semantic operation once with signed CAS ownership before any external AI review. Missing server review configuration leaves an unreviewed draft and a truthful review request, never automatic publication. Old CSV approval flags and unverifiable history are not converted into authenticated adoption. All protected-data and destructive-operation prohibitions remain intact.

## Teacher-approved storage optimization code rollout (2026-09-19)

Teacher evidence: `teacher_20260919_explicit_storage_optimization_rules_and_code_rollout`. This is a separate closed `teacher_approved_storage_optimization_operations` descriptor, not a renaming or expansion of the blog descriptor. It authorizes only reviewed non-force code push and production application-code deployment for objective `optimize_function_storage_and_mwf_deployments`, target `aisoukai_media`, repository `aisokai/aisoukai-media`, branch `main`, existing Vercel project `prj_ATtyS5co8vHu314SfRej1WFVc37g`, team `team_DwtlLboYj9ATDNLhTk9MVgZQ`, origin `https://aisoukai-media.vercel.app`. Policy version remains `aisoukai-media-tiered-blog-2026-09-14`; verify the current canonical AGENTS.md digest.

Only the explicitly declared code operations may execute, after independent review of the immutable commit and release manifest and all seven PASS gates plus the completion-validator checkpoint. Verify the actual artifact at use, remote main SHA after push, and exact READY Production Current deployment/source identity after rollout. Changed commit or artifact requires renewed release evidence; same-objective bounded repair does not require renewed Teacher approval. Existing runtime authentication may operate internally without any agent retrieval/display/storage of credential values.

Omission or exact null preserves ordinary restrictions; undefined, malformed, mixed blog/unlink descriptors, other objectives/targets and non-code paths fail closed. NO_SENSITIVE_DATA and real_data_access:false are mandatory. The workflow reference defines exact schema and code-path allowlist. AI calls, notifications or third-party sending, article generation/review/publication, runner/cron execution or installation, retention changes/deletion, payment, destructive operations and protected-data access remain prohibited. Approval to roll out code is not approval to trigger the business workflow or proof of its recovery. Governance files are reviewed locally; this amendment does not authorize pushing governance repositories.


## Teacher-approved adopted-theme image generation (2026-10-07)

Evidence: `teacher_20261007_automatic_generation_with_teacher_theme_adoption`. The Teacher explicitly requested automatic blog article generation after Human theme adoption, including generating and applying suitable images when suitable stock is missing. The fixed OpenAI image endpoint below is the reviewed implementation choice for that functional instruction; this does not claim that the Teacher dictated an API URL verbatim.

This additive amendment applies only to `restore_mwf_draft_review_delivery_reliability`, `aisoukai_media`, `aisokai/aisoukai-media` `main`, and the existing fixed blog service under policy `aisoukai-media-tiered-blog-2026-09-14`. It authorizes no candidate auto-adoption: candidate supply remains pending, and genuine authenticated Human adoption tied to the current theme hash is mandatory before article/image generation. New Human selection atomically persists candidate state, generation eligibility and signed adoption; historical selected flags alone never prove adoption.

The closed `teacher_approved_blog_operations` descriptor gains only the explicitly listed operation `blog_image_generation`. When and only when this operation is present, `authorization_id` and Teacher declaration evidence must equal the 2026-10-07 evidence above, and the additional required target `image_endpoint` must equal `https://api.openai.com/v1/images/generations`. The existing `ai_endpoint` remains exactly `https://api.openai.com/v1/chat/completions`; every other fixed target stays unchanged. Missing/extra/malformed targets, edits/variations endpoints, arbitrary providers or URL arrays are rejected. Image-free descriptors retain the original evidence and exact original target shape; a code deploy does not imply an image call.

Every image-execution release requires `change_level: important_system_change` with `teacher_approval.kind: specific_important_change`, this exact 2026-10-07 evidence, and the exact reviewed artifact hash. It requires independent review, all seven PASS gates and the completion checkpoint before execution. Image calls count as scoped non-sensitive editorial runtime: `real_data_access`, `third_party_human_data_transfer`, `live_execution` and `real_world_impact` are true. These flags never permit protected-data access. Generated bytes, saved `public/images/library/` paths and registry entries must be bounded by the execution scope and bound to the exact adopted theme/article identity and SHA-256. Uncertain/failed generation must not trigger unbounded retries or fabricated success.

Image generation alone confers no publication, sending, push, deploy or runner permission. Those operations require their own explicit entries and unchanged gates. Generated output/provider success is not independent image suitability, licensing or medical/content review. Keep unverified articles as drafts. Existing runtime authentication may operate internally; agents never retrieve, display, store or log credentials. Patient data, private-message bodies, secrets/credentials/tokens, destructive/deletion actions, payment/contractual actions, unrelated AI/sending, agent dispatch and send-keys remain prohibited. This narrow later Teacher amendment leaves all other standing prohibitions and existing publication checks unchanged.

<!-- BEGIN:sns-mutual-review-20261106 -->
## 先生によるSNS AI相互監視運用の明示変更（2026-11-06）

Policy version: `aisoukai-media-tiered-blog-sns-2026-11-06`。
根拠: `teacher_20261106_explicit_sns_ai_mutual_review_all_sns_and_gmb_reply_human_gate`。
この節は、上記の禁止規則のうち、以下の SNS 運用に限って先生が明示変更した範囲だけを置き換える。対象外の禁止（YouTube / LINE / Website、ブログの治理、publish API の実装禁止等）は維持する。

- 対象は本 repo が扱う SNS ドラフトと、医療法人藍想会の公式 SNS アカウントへの投稿のみとする。対象チャンネルは Instagram / Facebook / X / Threads とする。ただし各チャンネルの自動運用は、`config/media-gate.json` の該当 flags が先生の操作で ON にされ、かつ当該チャンネルのドラフト規格・検証が本節の運用に追随した範囲でのみ有効とする。他法人（CLP・GMS）のアカウントは本節の対象外とする。
- 人間の投稿前監視は廃止し、AI 相互監視による自動運用とする。生成とレビューは別の実際の実行 identity が担い、レビュー証拠は対象コンテンツ（本文・キャプション・メディアファイル）の hash、作成 identity、レビュー identity、チェック結果、policy version に結び付けて append-only で記録する。レビューを通過していないコンテンツ、投稿直前に再計算した hash が証拠と一致しないコンテンツは投稿しない。
- 運用初期値として、作成は Claude 系統、レビューは ChatGPT 系統とする。Muse が作成を担った場合も、レビューは ChatGPT 系統が行う。Muse は原則として投稿の実行と事後巡回を担い、自作自演のレビューで投稿まで進めない。
- 投稿の実行は Muse が担う。投稿結果（プラットフォーム、投稿 ID / URL、実行時刻、対象 hash）は監査ログに記録する。
- 以下のいずれかに当たる投稿は自動運用の対象外とし、投稿前に先生へエスカレーションする: 患者が特定され得る内容を含むもの、個別の症状・治療相談への対応、クレーム・苦情への対応、その他レビューで例外該当の判断が割れたもの。
- 投稿後は Muse がコメント・メンション・プラットフォーム通知を、投稿直後と1日1回巡回する。医療広告ガイドライン抵触の疑い、事実誤認、外部からの指摘等を検知した場合は、検知・対応・結果を監査ログに記録して先生へ報告する。
- 投稿の削除・キャプション修正の実行経路はブラウザ操作とする。Muse の判断で即時に削除できるのは、明らかな誤投稿または医療広告ガイドライン抵触の場合に限る。それ以外のものは削除せず、先生へ確認する。
- 通常投稿（sns_repurpose）と、お知らせ投稿（臨時休診・診療時間変更等の temporary_closure_notice / schedule_change_notice）は、`config/media-gate.json` 上で別の flags によって制御する。通常投稿用フラグの ON は、お知らせ投稿の自動化を意味しない。お知らせ用 flags は構造を先行整備するが初期値は OFF とし、当面は自動化しない。お知らせ投稿の自動化開始には、先生の別途明示決定と先生による flags 操作を要する。
- Google 口コミへの返信は本変更の自動運用の対象外とし、human gate を維持する。口コミの取得・監視・返信案の下書き生成は自動で行ってよいが、返信の送信は先生の承認後にのみ行う。承認提示と承認は Muse とのチャットで行い、実行は当面、承認済み queue item に対する `gmb-apply` の Human 明示実行経路に限る。gate_table の `review_reply.gmb` は `human_gate` に固定し、flag_bindings から review_reply 系の binding を除去する。`gmb_reply_auto` / `gmb_reply_auto_template` を ON にしても自動返信は行われない。
- 本変更は `config/media-gate.json` の該当 flags が先生の操作で ON にされた範囲でのみ効力を持つ。flags の変更権限は従来どおり先生のみとし、AI は変更しない。先生はいつでも flags を OFF に戻すことで自動運用を停止できる。
- 患者情報そのものの読み書き、secrets / credentials / tokens の取得・表示・保存の禁止は維持する。レビュー証拠・監査ログに対象コンテンツの hash と判定結果は記録してよいが、患者を特定し得る本文の引用は最小限とする。
<!-- END:sns-mutual-review-20261106 -->
