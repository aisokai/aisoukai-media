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

- **外部送信は未実装。実APIは未接続。** すべてローカルのJSON/Markdown生成・dry-run・validator・status表示まで。
- GMB口コミ返信は dry-run / 下書き生成まで。low risk auto reply は将来、先生が `gmb_reply_auto_template` 等のフラグをONにした後に有効化される。
- push / deploy は先生のみ。生成物(mj-* / snapshots / replies / jsonl)はcommitしない([commit-plan](./media-automation-commit-plan.md)参照)。
- Mac mini常駐化する場合も、常駐してよいのは読み取り・下書き生成系のみで、apply / post / send 系の常駐登録は禁止。

## 実装状況と今後のBatch

| Batch | 内容 | 状態 |
|---|---|---|
| 1 | Media Queue schema + validator + list/status | ✅ 実装済み (v1) |
| 2 | emergency notice draft generator | ✅ 実装済み (v1) |
| 3 | SNS repurpose generator | ✅ 実装済み (v1) |
| 4 | GMB post draft generator | ✅ 実装済み (v1) |
| 6(v0) | GMB review watcher dry-run (mock) + 返信案生成 | ✅ 実装済み (v1, mock) |
| 9(v0) | LINE WORKS intake stub | ✅ 実装済み (v1, mock) |
| 7(stub) | Telegram instruction dry-run | ✅ 実装済み (v1, mock) |
| 5 | GMB account/location discovery (OAuth・先生承認後に接続テスト) | 未着手 |
| 6(実API) | review watcher の adapter を実API読み取りに差し替え | 未着手 |
| 7 | GMB reply apply v1 (Telegram承認後・先生明示コマンド) | 未着手 |
| 8 | low risk auto reply (星5本文なし定型・dry-run→apply) | 未着手 |
| 9 | LINE WORKS実受信・院内通知 | 未着手 |
| 10 | MitaniOS/AI司令塔連携 (queue/承認待ち/履歴表示) | 未着手 |
| 11 | launchd整備 (日次watcher / ログローテ / health) | 未着手 |
| 12 | 運用ドキュメント拡充 (削除手順・緊急停止の実地確認) | 一部 (operator-guide作成済み) |

## AGENTS.md との関係 (将来改訂対象)

現行 `AGENTS.md` は「Telegram からの approve / publish 禁止」「publish API 実装禁止」等を定める。v1実装はこれに完全準拠している(approve/post/publish系コマンドはblocked、外部送信コードなし)。

Batch 7以降(承認後のGMB返信実行)および auto mode 導入時には、**先生の明示判断による AGENTS.md 改訂が必要**。改訂自体が「本番公開設定の変更」としてHuman Gate対象であり、改訂されるまで現行ルールが優先される。

## 自動化解禁の目安 (詳細は human-gate.md §4)

1. `gmb_post_auto` — 休診・時間変更の定型GMB投稿: human_gate運用10件問題なし
2. `gmb_reply_auto_template` — 星5本文なし定型返信: dry-run 2週間誤分類ゼロ
3. `gmb_reply_auto` — low risk返信全般: テンプレ返信1か月問題なし
4. `x_auto` / `instagram_auto` — GMB自動化安定後
5. `lineworks_internal_auto` — Bot導入後すぐON可(院内限定)
