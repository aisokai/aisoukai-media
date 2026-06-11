# Media Automation 運用ガイド (先生向け)

- 作成日: 2026-06-11
- 対象: Media Automation Core v1 (ローカル完結版)
- 関連: [media-automation-system-plan.md](./media-automation-system-plan.md) / [media-automation-human-gate.md](./media-automation-human-gate.md) / [media-automation-roadmap.md](./media-automation-roadmap.md)

---

## 1. v1でできること / できないこと

**できること(すべてローカル完結):**

- 緊急お知らせ(休診・時間変更等)の全媒体向け下書き一括生成
- ブログ記事からのSNS下書き生成(Instagram / X / LINE)
- GMB投稿下書き生成(6タイプ)
- GMB口コミのmockチェック・分類・返信案生成
- queue / status / health の確認

**外部送信の現状(Phase 3以降実装済み・ただし全ゲートCLOSED):**

- 外部送信の経路は `media:gmb:apply`(approved job + `--apply` 明示)と `media:executor --apply`(フラグON時のみ)、`media:lineworks:notify --apply`(フラグON時のみ)、Telegram通知の4つだけ。それ以外の送信コードは存在しないか `blocked`。
- 実APIは**認証情報を先生が設定するまで未接続**(GMB: [手順書](./gmb-oauth-setup-guide.md) / LINE WORKS: Bot登録)。未設定時は全て明示エラーで停止。
- 自動実行フラグは全てOFF初期値のため、認証情報を入れても自動送信は始まらない(承認後の手動applyのみ)。
- SNS投稿(Instagram/X/LINE公式)の送信機能は引き続き存在しない(手動投稿)。
- push / deploy / publish は先生のみ。

**生成物はcommitしない:**

- queue実データ(`mj-*`)・口コミsnapshot/返信案・`logs/media-automation.jsonl` 等は `.gitignore` 済み。commit対象と手順は [media-automation-commit-plan.md](./media-automation-commit-plan.md) を参照。

**Mac mini常駐化(launchd)の制約:**

- **デフォルトの `media:launchd:install` は read-only / dry-run / ローカル生成のジョブのみを登録し、apply / post / send / reply / publish / notify は実行しない。**
- apply/notify系ジョブは `media:launchd:install-apply` + `launchd_apply_jobs` flag ON(先生のみ)の二重条件でのみ登録できる。登録後も実送信は各個別フラグ(`telegram_notify` / `health_notify` / auto系)に従う。
- 通知系もフラグ初期OFF: env(BOT TOKEN等)が設定されていても、`telegram_notify` / `health_notify` / `lineworks_internal_auto` がOFFなら送信処理はno-op。
- 破壊的操作(GMB返信削除・投稿削除)はlaunchd登録不可。必ず「削除リクエスト作成→承認→`--apply --by 氏名`」のHuman Gate 3段階を踏む。

## 2. コマンド表

| コマンド | 用途 |
|---|---|
| `npm run media:notice:draft -- --input "本日午後休診"` | 緊急お知らせを全媒体向けに生成 |
| `npm run media:sns:from-post -- --post <slug>` | ブログ記事からSNS下書き生成 |
| `npm run media:gmb:draft -- --type update --input "本文"` | GMB投稿下書き生成 |
| `npm run media:gmb:draft -- --type blog_summary --post <slug>` | ブログ紹介GMB下書き |
| `npm run media:gmb:reviews:dry-run` | 口コミチェック(mock)の**表示のみ**(ファイルを書かない) |
| `npm run media:gmb:reviews:check` | 口コミチェック(mock)・返信案を**ローカル保存**(外部送信はしない) |
| `npm run media:lineworks:dry-run -- --input "指示"` | LINE WORKS指示受付(mock) |
| `npm run media:telegram:dry-run -- --input "/notice 本日午後休診"` | Telegramコマンド解釈(mock) |
| `npm run media:queue:list` / `media:queue:validate` | queue一覧・検証 |
| `npm run media:status` / `media:health` | 状態サマリ・health check |
| `npm run media:approve -- <mj-id> --by "氏名"` | queue itemをCLIで承認(状態遷移のみ) |
| `npm run media:approve -- <mj-id> --reject --reason "理由" --by "氏名"` | CLIで差し戻し |
| `npm run media:notify:pending` | 承認待ちdigest表示(`--apply` でTelegram送信) |
| Telegram: `/notice` `/gmb` `/sns` `/review` `/status` | 指示・照会(telegram-ops経由) |
| Telegram: `/approve <mj-id>` `/reject <mj-id> <理由>` | 承認・差し戻し。**AGENTS.md v2適用 + `telegram_media_approve` フラグON後に有効**(それまでは未解禁応答) |
| `npm run media:gmb:auth` / `media:gmb:discover` | OAuth初回認可・location取得([手順書](./gmb-oauth-setup-guide.md)) |
| `npm run media:gmb:reviews:check -- --source api` | 実APIで口コミ取得(読み取りのみ) |
| `npm run media:gmb:apply -- <mj-id>` | **唯一の外部送信コマンド**。approved jobのみ。デフォルトdry-run、送信は `--apply` |
| `npm run media:gmb:apply -- --request-delete-reply <review_id> --by 氏名` | **削除リクエスト作成**(直接削除は不可)。承認後 `gmb-apply <mj-id> --apply --by 氏名` で実行。`--request-delete-post` も同様 |
| `npm run media:executor` | 自動実行器のdry-run(フラグON時のみ対象が出る)。default launchdもdry-run。apply常駐は `media:launchd:install-apply` + flag ON時のみ |
| `npm run media:lineworks:notify -- --from-notice <mj-id>` | 院内通知。`lineworks_internal_auto` ON + `--apply` の二重ゲート |
| `npm run media:export:obsidian` / `media:export:status` | mybrain日次記録 / MitaniOS向けJSON |
| `npm run media:launchd:install` / `uninstall` / `status` | 常駐ジョブ管理(**installは先生のみ**)。**デフォルトinstallは read-only / dry-run のみで、apply / post / send / reply / publish / notify は一切実行しない** |
| `npm run media:launchd:install-apply` | apply/notify系jobの登録。`launchd_apply_jobs` flag(初期OFF)がONでなければ拒否される |
| `npm run media:logs:rotate` | 5MB超ログをlogs/archive/へ退避 |
| 各 `media:*:validate` | 下書きの検証 |

生成系は `--dry-run` を付けると保存せず表示のみ。

## 3. Human Gateの扱い

- `config/media-gate.json` が gate判定の正本。**変更は先生のみ**(AIは変更禁止)。
- 自動実行フラグ(`flags`)は初期状態ですべて `false` = 全外部送信がHuman Gate。
- フラグをONにする手順: 先生が直接ファイルを編集 → `npm run media:health` でON状態を確認 → 通常のgit管理。
- review_pending / human_required の件数は `npm run media:status` で確認。

## 4. 緊急停止手順 (emergency stop)

1. `config/media-gate.json` の `flags` をすべて `false` にする(これだけで自動実行系は全停止。v1では元々外部送信機能が無いため、これは将来版向けの手順)。
2. launchd を導入済みの場合: `npm run telegram:ops:uninstall` 等で該当ジョブをunload。
3. 確認: `npm run media:health` で「全てOFF」表示を確認。

## 5. Rollback方針

- queue itemの全遷移は `logs/media-automation.jsonl` に append-only 記録。誤操作時はログから状態を辿れる。
- 下書きファイル(content/配下)はgit管理。誤生成は git checkout で個別復元(先生操作)。
- 将来の外部投稿時は投稿ID・返信IDを `external_result` に必ず保存し、削除・編集手順(GMB: `reviews.deleteReply` / 投稿の編集・削除)で事後修正する。
- `processed-ids.json` を削除すると口コミが再検出される(再実行safe)。

## 6. 秘密情報の扱い

- `.env.local` はgitignore。スクリプトは中身を表示・記録しない。
- 全ログ・queue保存は `redactSecrets` フィルタを通る(token / sk- / Bearer / key=value パターンをマスク)。
- 口コミの原文(raw_text)は `content/gmb-reviews/snapshots/` のみに保持。console・ログ・返信案には masked_text しか出ない。

## 7. 故障時の見方

- `npm run media:health` がNG → 表示された✗項目を確認(ディレクトリ欠落 / config読込不可 / queue不整合)。
- 個別jobの失敗は該当jobのみ `failed` になる。全体は止まらない。`npm run media:queue:list -- --status failed` で確認。
- retry上限(3回)超過は `human_required` に落ちる設計(将来の自動実行版)。
