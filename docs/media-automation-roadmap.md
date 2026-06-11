# Media Automation ロードマップ

- 作成日: 2026-06-11
- 関連: [media-automation-system-plan.md](./media-automation-system-plan.md) / [media-automation-human-gate.md](./media-automation-human-gate.md) / [gmb-review-automation-plan.md](./gmb-review-automation-plan.md)

---

## 最終形

**完全自律型。** 先生は常時作業者ではなくHuman Gate承認者であり、承認は「公開後に修正できないもの」だけに最小化する。公開後に修正・削除できる外部送信(GMB投稿・GMB口コミ返信・X/Instagram投稿)は、`config/media-gate.json` のフラグONにより「自動実行 → 事後通知 → 必要なら事後修正」へ移行する。

- 外部公開系は**初期OFF**(全フラグfalse = 全てHuman Gate)。
- `auto_when_enabled` はconfigで管理し、**フラグONは先生のみ**が行う(この操作自体がHuman Gate)。
- gate判定は `type × channel × risk_level → gate_policy` の固定表引き。AIは判断しない。high riskは常にhuman_gateへ引き上げ。
- GMB口コミは raw_text / masked_text を分離し、表示・ログはmaskedのみ。
- **SNSは拡散性が高い**(スクリーンショットで残る)ため、GMB自動化の安定運用を確認した後に自動化する。
- 医療広告・医療法務表現は警告対象だが、開発停止ブロッカーにしない(事後修正前提)。
- push / deploy は先生のみ。データ削除・上書き・秘密情報操作・課金・契約は常にHuman Gate。

## 現在地 (v1 の制約)

- GMB/LINE WORKS/Telegramの実API接続コードは実装済み。ただし全flag初期OFFで、default launchdはread-only/dry-runのみ。実送信は明示apply + 承認済みjob + 該当flagの条件を満たす場合に限る。
- GMB口コミ返信は dry-run / 下書き生成まで。low risk auto reply は将来、先生が `gmb_reply_auto_template` 等のフラグをONにした後に有効化される。
- push / deploy は先生のみ。生成物(mj-* / snapshots / replies / jsonl)はcommitしない([commit-plan](./media-automation-commit-plan.md)参照)。
- Mac mini常駐化する場合も、常駐してよいのは読み取り・下書き生成系のみで、apply / post / send 系の常駐登録は禁止。

## 実装状況と今後のBatch

| Batch | 内容 | 状態 |
|---|---|---|
| 1 | Media Queue schema + validator + list/status | ✅ 実装済み |
| 2 | emergency notice draft generator | ✅ 実装済み |
| 3 | SNS repurpose generator | ✅ 実装済み |
| 4 | GMB post draft generator | ✅ 実装済み |
| Phase 1 | Telegram承認ループ (/approve 二重ゲート・digest通知・CLI承認) | ✅ 実装済み |
| 5 | GMB discovery + OAuthヘルパー (`media:gmb:auth` / `media:gmb:discover`) | ✅ 実装済み (**接続は先生の認証情報設定後**) |
| 6 | review watcher 実API読み取り (`--source api`) | ✅ 実装済み (同上) |
| 7 | GMB apply (`media:gmb:apply` — approved job + --apply のみ。削除は3段階Human Gate: リクエスト→承認→--apply --by) | ✅ 実装済み (**実送信は未疎通**) |
| 8 | media executor (フラグON時のみ自動実行・variant別解禁・事後通知) | ✅ 実装済み (全フラグOFF) |
| 9 | LINE WORKS adapter (JWT認証・院内通知・inbox受信) | ✅ 実装済み (**Bot登録は先生**) |
| 10 | MitaniOS連携 (status JSONエクスポート + カード仕様書) | ✅ 実装済み (GUIカードは mitanios-gui 側タスク) |
| 11 | launchd (デフォルト=read-only/dry-runのみ。apply/notify系は install-apply + flag の二重Gate) / ログローテ | ✅ 実装済み (**install実行は先生**) |
| 12 | 運用ドキュメント (OAuth手順書・コマンド表・緊急停止・rollback) | ✅ 実装済み |

**残り(先生側の作業 + 別repo)**: ①GBP API認証情報設定([手順書](./gmb-oauth-setup-guide.md)) ②AGENTS.md v2適用([提案](./agents-md-v2-proposal.md)) ③`media:launchd:install` 実行 ④フラグ段階ON ⑤LINE WORKS Bot登録 ⑥mitanios-gui カード追加([仕様](./mitanios-media-status-spec.md))

## AGENTS.md との関係 (将来改訂対象)

現行 `AGENTS.md` は「Telegram からの approve / publish 禁止」「publish API 実装禁止」等を定める。v1実装はこれに完全準拠している(approve/post/publish系コマンドはblocked、外部送信コードなし)。

Batch 7以降(承認後のGMB返信実行)および auto mode 導入時には、**先生の明示判断による AGENTS.md 改訂が必要**。改訂自体が「本番公開設定の変更」としてHuman Gate対象であり、改訂されるまで現行ルールが優先される。

## 自動化解禁の目安 (詳細は human-gate.md §4)

1. `gmb_post_auto` — 休診・時間変更の定型GMB投稿: human_gate運用10件問題なし
2. `gmb_reply_auto_template` — 星5本文なし定型返信: dry-run 2週間誤分類ゼロ
3. `gmb_reply_auto` — low risk返信全般: テンプレ返信1か月問題なし
4. `x_auto` / `instagram_auto` — GMB自動化安定後
5. `lineworks_internal_auto` — Bot導入後すぐON可(院内限定)
