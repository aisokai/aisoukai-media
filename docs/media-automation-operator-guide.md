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

**できないこと(意図的に未実装):**

- 外部送信は一切できない。GMB投稿・口コミ返信・SNS投稿・LINE WORKS送信・Telegram送信の実行コードは存在しないか、`blocked` エラーを投げる。
- 実APIは未接続(GMB口コミはmockデータのみ。実API接続はBatch 5以降・先生承認後)。
- GMB口コミ返信は現状 dry-run / 下書き生成まで。low risk auto reply は将来先生がフラグONにした後の機能。
- push / deploy / publish は先生のみ。

**生成物はcommitしない:**

- queue実データ(`mj-*`)・口コミsnapshot/返信案・`logs/media-automation.jsonl` 等は `.gitignore` 済み。commit対象と手順は [media-automation-commit-plan.md](./media-automation-commit-plan.md) を参照。

**Mac mini常駐化する場合の制約:**

- launchd等で常駐させてよいのは watcher / validate / status / health などの読み取り・下書き生成系のみ。
- apply / post / send / reply / publish 系のジョブを常駐登録することは禁止(そもそもv1に実行コードが存在しないが、将来版でも常駐化はHuman Gate対象)。

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
