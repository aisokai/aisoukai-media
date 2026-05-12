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
- 公開記事は Human review を必須とする
- 管理画面は裏方用であり、UI polish より安全性と運用性を優先する

## 絶対禁止

- AI自動approve禁止
- 自動publish禁止
- `reviewed:false` の公開禁止
- Telegram からの approve / publish 禁止
- approve API / publish API の実装禁止
- cron完全自動化は現段階では禁止
- `git push` 禁止。push は人間が手動実行する

## 公開条件

- `reviewed:true` のみ公開対象
- `rejected` 記事は通常 `pending` に混ぜない
- `future date` / `future publish_at` 記事は、`reviewed:true` でも公開対象から除外する
- `sitemap` / `category` / `blog` 一覧 / `blog` 詳細 / `metadata` はすべて同じ公開条件に従う
- `admin` 配下は `noindex`

## review 運用

- approve / reject は CLI コマンドで実行する
- 管理画面は command copy まで
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
