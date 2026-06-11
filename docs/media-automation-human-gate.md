# Human Gate 設計書

- 作成日: 2026-06-11
- 親ドキュメント: [media-automation-system-plan.md](./media-automation-system-plan.md)
- 状態: 設計のみ

---

## 1. 基本方針

**承認は可及的に少なくする。** 判定基準はただ一つ:

> その操作は、実行後に修正・削除・撤回できるか？

- **できる** → AIが自走してよい（`auto` / `auto_after_notify` / `auto_when_enabled`）。先生は事後通知を受け、必要なら事後修正する。
- **できない、または被害が重大** → Human Gate（`human_gate` / `forbidden`）。

医療広告・医療法務表現の懸念は **警告フラグ**（job に `warnings[]` を付けてTelegram通知に含める）であり、Gateではない。指摘があれば事後修正する。

## 2. gate_policy enum

| gate_policy | 動作 |
|---|---|
| `auto` | 自動実行。ログのみ |
| `auto_after_notify` | 自動実行 → Telegramへ事後通知（先生は事後修正可能） |
| `auto_when_enabled` | `config/media-gate.json` の該当フラグONなら auto_after_notify、OFFなら human_gate |
| `human_gate` | `review_pending` で停止。先生の `/approve` でのみ実行 |
| `forbidden` | システムから実行不可。先生が手動で行う |

## 3. Human Gate table（正本）

| action | risk | auto_allowed | human_required | reason | rollback |
|---|---|---|---|---|---|
| 下書き生成（全媒体） | low | ✅ auto | — | ファイル生成のみ。外部影響なし | ファイル修正・再生成 |
| 投稿案の分類・risk判定 | low | ✅ auto | — | ルールベース表引き | 再分類 |
| queue status遷移（Gate対象外） | low | ✅ auto | — | 内部状態のみ | 遷移ログから復元 |
| Obsidian / logs 記録 | low | ✅ auto | — | append-only | 追記訂正 |
| Telegram内部通知 | low | ✅ auto | — | 先生宛て内部連絡 | 訂正通知 |
| 未返信口コミチェック（読み取り） | low | ✅ auto | — | read-only API | 不要 |
| 院内掲示文生成 | low | ✅ auto | — | 印刷は人間が行う | 再印刷 |
| LINE WORKS院内通知 | low-mid | ✅ auto_when_enabled | フラグOFF時 | 院内限定・低害 | 訂正通知 |
| GMB投稿（全タイプ） | mid | ✅ auto_when_enabled | フラグOFF時 | **投稿は編集・削除可能** | API/管理画面で編集・削除 |
| GMB口コミ返信（low risk） | mid | ✅ auto_when_enabled | フラグOFF時 | **返信は編集・削除可能** | `reviews.deleteReply` |
| GMB口コミ返信（high risk: 低評価・医療内容・個人情報） | high | ❌ | ✅ | 炎上・法務リスク。文面の事前確認価値が高い | 削除は可能だがスクショ拡散リスク |
| GMB返信削除・投稿削除（delete_review_reply / delete_gmb_post） | high | ❌ | ✅ 3段階（リクエスト作成→承認→--apply --by） | 破壊的操作は必ずHuman Gate。auto化しない | 削除の取り消しは不可（再投稿のみ） |
| launchdへのapply/notify系job登録 | high | ❌ | ✅ install-apply + launchd_apply_jobs flag | 常駐自動送信の解禁は二重Gate | uninstall + flag OFF |
| Telegram digest / health通知の送信 | low-mid | ✅ auto_when_enabled | telegram_notify / health_notify flag OFF時 | 通知もenvだけでは送信されずflag必須 | flag OFF |
| X投稿 | mid | ✅ auto_when_enabled | フラグOFF時 | 削除可能（拡散前なら実害小） | ポスト削除 |
| Instagram投稿 | mid | ✅ auto_when_enabled | フラグOFF時 | 削除・編集可能 | 投稿削除 |
| LINE公式一斉配信 | high | ❌ | ✅ | **受信者の端末から取り消せない** | 不可（訂正配信のみ） |
| Webサイト本番反映 | high | ❌ | ✅ | push/deployを伴う | revert + 再deploy（先生のみ） |
| git push / deploy | high | ❌ forbidden | ✅ 先生のみ | 最重要リスク | revert |
| データ削除・既存データ上書き | high | ❌ forbidden | ✅ | 破壊的・復元困難 | backupsから復元 |
| APIキー・認証情報の操作 | high | ❌ forbidden | ✅ | 漏洩リスク | キーローテーション |
| 課金・契約 | high | ❌ forbidden | ✅ | 金銭的影響 | 解約交渉 |
| `config/media-gate.json` の変更 | high | ❌ | ✅ 先生のみ | Gate自体の変更＝公開設定変更 | git履歴からrevert |
| `AGENTS.md` のGateルール改訂 | high | ❌ | ✅ 先生のみ | 同上 | git履歴からrevert |

## 4. auto mode 段階導入ロードマップ

初期状態は全フラグOFF（全外部送信が human_gate）。各媒体で「human_gate運用で○件連続問題なし」を確認した時点で、先生がフラグをONにして承認レスへ移行する。

| フラグ | 対象 | ON判断の目安 |
|---|---|---|
| `gmb_post_auto` | GMB定型投稿（休診・時間変更） | human_gate運用10件問題なし |
| `gmb_post_auto_all` | GMB全投稿タイプ | 上記＋キャンペーン含め20件 |
| `gmb_reply_auto_template` | 星5・本文なし定型返信 | dry-run 2週間で誤分類ゼロ |
| `gmb_reply_auto` | low risk返信全般 | テンプレ返信1か月問題なし |
| `x_auto` / `instagram_auto` | SNS自動投稿 | GMB自動化が安定後 |
| `lineworks_internal_auto` | 院内通知 | Bot導入後すぐON可（院内限定） |

フラグONの操作自体がHuman Gate（先生がファイル編集→commit）。AIはフラグを提案できるが変更できない。

## 5. 既存AGENTS.mdとの衝突点（要・先生判断）

| 現行ルール | 本設計との関係 |
|---|---|
| 「Telegram からの approve / publish 禁止」 | 本設計の `/approve` コマンドおよびauto modeと衝突。auto mode導入時に改訂が必要 |
| 「publish API の実装禁止」 | GMB投稿APIはブログpublishとは別物だが、解釈を明確化する改訂が望ましい |
| 「cron 完全自動化は medical_risk: low のみ」 | 本設計のrisk_level判定と整合させる（low以外はauto対象外で一致） |

改訂までは**現行AGENTS.mdが優先**。Batch 1〜6は現行ルール内で実装可能（外部送信なし or 読み取りのみ）。

## 6. v1実装の現在地

- v1ではGMB/LINE WORKS/Telegramの実API接続コードは実装済み。ただし全flag初期OFFで、default launchdはread-only/dry-runのみ。実送信は明示apply + 承認済みjob + 該当flagの条件を満たす場合に限る。
- GMB口コミ返信は dry-run / 下書きまで。low risk auto reply はフラグON後(§4)に初めて有効化される。
- `review_reply:gmb` のflag bindingは variant 別(`:template_only` / `:short_positive` / `:normal`)に分離済みで、テンプレ返信のみ先行解禁できる。
- 緊急停止は `config/media-gate.json` の全フラグOFF + launchd unload。rollbackは投稿ID/返信IDの保存と `logs/media-automation.jsonl` の append-only 履歴を前提とする(詳細は [operator-guide](./media-automation-operator-guide.md))。

## 7. Gate履歴の記録

- 全approve/reject/auto-approveを `logs/media-automation.jsonl` にイベント記録（who / when / job_id / policy）。
- Obsidian `mybrain/media-automation/` に日次で人間可読サマリを追記。
- auto_after_notify による自動実行も「auto:policy名」を `approved_by` に記録し、Human承認と区別する（既存Auto Publish Policyの `auto_approved` と同じ思想）。
