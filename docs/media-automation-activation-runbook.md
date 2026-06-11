# Media Automation Production Activation — 本番移行手順書

- 作成日: 2026-06-11
- 大目標: GMB口コミの日次実API稼働 → 承認付きapply開放 → 低リスク自動返信の段階解放
- 方針: **① read-only本番稼働 → ② 先生承認付きapply → ③ 低リスクのみ自動apply** の順で、後戻りできる形で解錠する
- 実装状態: 全コード実装済み。本書は「先生が順に回す解錠手順」の正本
- **現在地の確認と次の1手は `npm run media:activation` がいつでも表示します**(認証で中断しても、このコマンドで再開位置がわかります)

---

## Stage 0: 土台 (所要 ~15分)

| # | 操作 | コマンド/参照 |
|---|---|---|
| 0-1 | Commit A/B/C を実行 | [commit-plan](./media-automation-commit-plan.md) |
| 0-2 | AGENTS.md v2 を適用しcommit | [agents-md-v2-proposal](./agents-md-v2-proposal.md) |

完了条件: `git status` がclean。

## Stage 1: read-only本番稼働 (所要 ~40分 + 1日観察)

**この段階では外部に何も送信されない。** 取得・分類・返信案生成・記録のみ。

| # | 操作 | コマンド |
|---|---|---|
| 1-1 | GBP API有効化・OAuthクライアント作成 | [oauth-setup-guide](./gmb-oauth-setup-guide.md) Step 1-3 |
| 1-2 | refresh token取得(.env.localに直接保存・画面非表示) | `npm run media:gmb:auth -- --url` → `--exchange <code> --write-env` |
| 1-3 | location ID取得 | `npm run media:gmb:discover` |
| 1-4 | 実API読み取りテスト | `npm run media:gmb:reviews:check -- --source api` |
| 1-5 | launchd登録(**read-only/dry-runジョブのみ**) | `npm run media:launchd:install` |
| 1-6 | 登録状態を確認(plist存在 + launchctl load済み) | `npm run media:launchd:status` / `npm run media:activation` |
| 1-7 | 記録確認 | `~/Desktop/mybrain/media-automation/` と `data/media-status.json` |
| 1-8 | (任意) Telegram digest解禁 | `telegram_notify: true` + `launchd_apply_jobs: true` + `media:launchd:install-apply`。executor-applyも登録されるがauto系フラグOFFのため毎回no-op |

完了条件: 実口コミが毎朝検出され、返信案が `content/gmb-reviews/replies/` に溜まり、queueに `review_pending / human_required` が並ぶ。

Stage 1の途中で止まった場合は、必ず `npm run media:activation` で再開位置を確認する。OAuth client secret / refresh token は `.env.local` にだけ保存し、画面・チャット・Markdown・ログには出さない。

## Stage 2: 先生承認付きapply開放 (1〜2週間の運用)

| # | 操作 | コマンド |
|---|---|---|
| 2-1 | Telegram承認解禁 | `telegram_media_approve: true`(AGENTS.md v2適用済みが前提) |
| 2-2 | 返信を承認 | Telegram `/review` → `/approve <mj-id>`(またはCLI `media:approve`) |
| 2-3 | 送信dry-run確認 → 実行 | `npm run media:gmb:apply -- <mj-id>` → `+ --apply` |
| 2-4 | **初回はrollback往復を必ず確認** | `--request-delete-reply <review_id> --by 氏名` → 承認 → `--apply --by 氏名` → 再返信 |
| 2-5 | GMB投稿も同様に運用 | `/gmb <本文>` → 承認 → apply |

完了条件: human-gate.md §4 の目安(返信10件・投稿10件を承認運用で問題なし)。全実行IDが `external_result` とObsidianに記録されている。

## Stage 3: 低リスク自動apply解放 (段階・各2週間目安)

| # | 解錠 | 前提条件 |
|---|---|---|
| 3-1 | executor dry-runログを2週間観察(launchdが毎15分出力済み) | 誤分類ゼロ確認: `logs/media-executor.log` |
| 3-2 | `gmb_reply_auto_template: true` — 星5本文なし/短文好意のみ自動返信 | 3-1クリア |
| 3-3 | `gmb_post_auto: true` — 休診・時間変更の定型投稿を自動化 | Stage 2で定型投稿10件問題なし |
| 3-4 | `gmb_reply_auto: true` — low risk返信全般 | 3-2を1か月問題なし |
| 3-5 | `x_auto` / `instagram_auto` | GMB安定後(SNSは拡散性が高いため最後) |

自動実行はすべて `approved_by: auto:media-executor` で記録され、Telegram事後通知(`telegram_notify` ON時)が届く。**high risk口コミと削除操作はどの段階でもhuman_gateのまま。**

## 常時有効な緊急停止

1. `config/media-gate.json` の全フラグを `false`(自動実行・通知が即停止)
2. `npm run media:launchd:uninstall`(常駐全停止)
3. `.env.local` から `GMB_*` を削除(API接続自体を遮断)

## 残りの開発項目 (本runbookの対象外)

- **LINE WORKS実受信**: webhookに公開エンドポイントが必要。当面は `media:lineworks:inbox`(ローカルJSON投入)で受け、relay方式(Cloudflare Tunnel等)は別途設計
- **mitanios-gui「メディア運用」カード**: 別repo作業。[仕様書](./mitanios-media-status-spec.md) 通りに `data/media-status.json` を読むだけで実装可能
