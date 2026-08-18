<!-- BEGIN:repository-policy -->
# Canonical repository policy

## Policy record

- Policy version: `aisoukai-media-standard-non-stop-2026-08-18`
- Gate profile: `STANDARD_NON_STOP`
- Answer date: `2026-08-18`
- Evidence reference: `teacher_message_2026_08_18_yes_gui_and_aisoukai_standard_non_stop_policy`
- Teacher data handling declaration: `NO_SENSITIVE_DATA`
- Declaration scope: DMP code, configuration, documentation, and tests only; no real data, secrets, credentials, patient data, or private-message bodies.

## Declared boundary and operations

- Affected paths and data flow are limited to non-sensitive DMP code, configuration, documentation, and test artifacts in this repository, processed locally without real-data access.
- Metadata-only sources are repository policy, paths, and runtime configuration; the only sink is the local repository workspace.
- Allowed reversible work in this declared scope: local edits, validation, tests, lint, builds, browser verification when UI changes require it, bounded repairs, targeted local commits after the seven completion gates, and—when separately declared by a v3 task contract—reviewed non-force push, repository sync, CI, preview or production application-code deploy, and machine-to-machine artifact transfer.
- Prohibited in this declared scope: reading or writing secrets, credentials, tokens, production environment values, patient data, or private-message text; `THIRD_PARTY_HUMAN_DATA_TRANSFER`; payment or contractual actions; destructive or irreversible operations; cron, auto-dispatch, send-keys, and live execution.
- A Human Gate remains required for destructive or irreversible work, payment or contractual action, `THIRD_PARTY_HUMAN_DATA_TRANSFER`, and any teacher-declared `SENSITIVE_STRICT` real-data boundary. Re-question only when the objective crosses this declaration, target, risk class, or sensitive boundary.

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
- 公開記事は Human review または Auto Publish Policy に基づく自動レビューを必須とする
- 管理画面は裏方用であり、UI polish より安全性と運用性を優先する

## 絶対禁止

- 未審査記事の自動公開禁止
- Auto Publish Policy を満たさない記事の AI 自動 approve 禁止
- `reviewed:false` かつ `auto_approved:false` の公開禁止
- Telegram からの approve / publish 禁止
- publish API の実装禁止
- approve API は原則禁止。ただし `/admin/pending-review` の認証済み Human 操作に限り、reviewed/frontmatter と review log を更新する管理画面アクションを許可する
- cron 完全自動化は、`medical_risk: low` かつ自動レビューを通過した記事に限り許可する
- `git push` は原則禁止。人間から明示依頼がある場合のみ実行する

## Auto Publish Policy

- 自動承認は `auto_approved:true` として記録し、Human 承認の `reviewed:true` と区別する
- 自動承認できるのは `medical_risk: low` の記事のみ
- `legal_check_status: passed` / `image_check_status: passed` / `publication_status: auto_approved` を満たす記事のみ自動公開対象にする
- blocker、出典不足、画像ライセンス不明、重複、ビルド失敗があれば自動公開せず pending review に残す
- 自動承認判断は `logs/auto-publish-history.md` と `data/auto-publish-reviews/*.json` に残す

## 公開条件

- `reviewed:true` または `auto_approved:true` のみ公開対象
- `auto_approved:true` の場合は Auto Publish Policy の全条件を満たすこと
- `rejected` 記事は通常 `pending` に混ぜない
- `future date` / `future publish_at` 記事は、承認済みでも公開対象から除外する
- `sitemap` / `category` / `blog` 一覧 / `blog` 詳細 / `metadata` はすべて同じ公開条件に従う
- `admin` 配下は `noindex`

## review 運用

- approve / reject は認証済み `/admin/pending-review` の Human 操作、または Human が明示実行する CLI コマンドで行う
- 自動 approve は `scripts/auto-review-post.mjs` の Auto Publish Policy 判定を通過した場合のみ許可する
- 管理画面は publish しない。reviewed/frontmatter と review history の更新のみ許可する
- review history は append-only
- 誰が・いつ・何を approve / reject したかを残す

## Telegram

- 通知は digest 優先
- 通知から approve / publish しない
- 件数が多い場合は要約する

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
