# GMB口コミ自動化 詳細設計書

- 作成日: 2026-06-11
- 親ドキュメント: [media-automation-system-plan.md](./media-automation-system-plan.md) / [media-automation-human-gate.md](./media-automation-human-gate.md)
- 状態: 設計のみ

---

## 1. 目的と方針

Google Business Profile（GMB）の口コミを1日1回チェックし、新規口コミへの返信を可能な限りAIが自走する。

- GMB返信は**後から編集・削除できる**（`accounts.locations.reviews.updateReply` / `deleteReply`）ため、「公開後修正可能 = AI自走可」の原則に最も適合する対象。
- Human Gateに残すのは **high risk口コミ（低評価・医療内容言及・個人情報らしき記述・攻撃的内容）への返信のみ**。
- 分類はAIではなく**ルールベース**（rating / 本文有無 / キーワード辞書）。AIの仕事は返信文の生成だけ。

## 2. 日次処理フロー（watcher）

launchdで1日1回実行（推奨: 朝8:00 JST）。

```
1. GMB API で口コミ一覧取得（read-only）
2. content/gmb-reviews/processed-ids.json と比較し新規reviewを検出
3. 新規reviewをスナップショット保存（gmb_review.schema.json）
4. ルールベース分類（§3）
5. low risk  → 返信案生成（テンプレ＋AI補正）→ queue item化
              → gmb_reply_auto ON なら自動返信＋事後通知
              → OFF なら review_pending でTelegram確認依頼
6. high risk → human_required でTelegramに全文＋返信案を送付、先生判断待ち
7. 処理済みIDを台帳に追記、logs/gmb-review-watcher.log に記録
```

失敗時: 該当review jobのみ failed（retry上限3回）。watcher全体は止めない。API認証エラー時のみ全体スキップ＋Telegram警告。

## 3. ルールベース分類（AIに判断させない）

判定は上から順に評価し、最初にマッチしたものを採用する固定優先順位:

| 優先 | 条件 | 分類 | gate_policy |
|---|---|---|---|
| 1 | 個人情報らしき記述（氏名・電話番号・日付＋症状の組合せパターン） | high | human_gate |
| 2 | NGキーワード（訴訟・返金・事故・苦情・痛い思い等の辞書） | high | human_gate |
| 3 | 治療内容への具体的言及（インプラント・抜歯・矯正等＋評価文） | high | human_gate |
| 4 | rating ≤ 3 | high | human_gate |
| 5 | rating 4-5 かつ 本文なし | low (template_only) | auto_when_enabled (`gmb_reply_auto_template`) |
| 6 | rating 4-5 かつ 本文 ≤ 60字 かつ ポジティブ辞書のみ | low (short_positive) | auto_when_enabled (`gmb_reply_auto_template`) |
| 7 | rating 4-5 かつ 上記以外 | low (normal) | auto_when_enabled (`gmb_reply_auto`) |

キーワード辞書は `scripts/media/dictionaries/review-keywords.json` に固定配置。辞書の更新は通常のコード変更（push経由なので結果的に先生確認を通る）。

## 4. 返信テンプレート方針

テンプレは `scripts/media/templates/review-reply/*.md`。AIはテンプレの変数部（来院への感謝の言い回し程度）のみ補正する。

全テンプレ共通の制約（プロンプトに固定で埋め込み＋validatorで機械チェック）:

- 感謝を述べる
- 個別の医療内容に踏み込まない（治療名を返信に書かない）
- 具体的治療結果を保証しない（「必ず」「完全に」等の断定語をvalidatorで拒否）
- 個人情報に触れない（投稿者名の呼称は「○○様」形式のみ、本文中の個人情報を引用しない）
- 低評価には謝意＋個別連絡のお願い（電話番号は固定定数から挿入）
- 攻撃的口コミには冷静・簡潔に対応（反論しない）
- 返信は短め（200字以内）

テンプレ種別: `thanks_no_text` / `thanks_short` / `thanks_normal` / `apology_low_rating` / `calm_hostile`

## 5. 段階導入（v0→v4）

| 版 | 内容 | 自動返信 |
|---|---|---|
| v0 | 取得・検出・分類・返信案生成・Telegram通知のみ | なし |
| v1 | Telegram `/approve` 後にAPI返信。先生明示コマンドのみ | なし（Gate経由） |
| v2 | 星5本文なし＋短文好意的 → テンプレ自動返信（`gmb_reply_auto_template` ON時）。**最初の2週間はdry-run**で分類結果のみ通知し、誤分類ゼロを確認後にapply | 定型のみ |
| v3 | low risk通常返信も自動送信＋事後通知（`gmb_reply_auto` ON時）。先生は通知を見て必要なら編集・削除 | low risk全般 |
| v4 | 先生承認済みルールセット内は完全自動。high riskのみhuman_required が残る | ルール内全て |

v2以降のフラグONは先生のみが行う（[Human Gate表](./media-automation-human-gate.md) §4）。

## 6. データ構造

```
content/gmb-reviews/
  processed-ids.json          処理済みreview id台帳（append-only）
  snapshots/<review_id>.json  口コミスナップショット
  replies/<review_id>.json    返信案＋送信結果（reply ID保存）
logs/gmb-review-watcher.log   watcher実行ログ
logs/media-execution.log      返信実行ログ（reply ID・タイムスタンプ）
```

### gmb_review.schema.json（案）

```jsonc
{
  "review_id": "...",          // GMBのreview name/ID
  "rating": 5,
  "text": "",                  // 本文（個人情報はそのまま保存するが、Telegram通知時はマスク検討）
  "reviewer_display": "...",   // 表示名のみ。それ以外の個人特定情報は保存しない
  "detected_at": "2026-06-11T08:00:00+09:00",
  "classification": "low_template_only",  // §3の固定enum
  "matched_rule": 5,           // §3のどの行でマッチしたか（監査用）
  "processed": true
}
```

### gmb_reply_draft.schema.json（案）

```jsonc
{
  "review_id": "...",
  "template_id": "thanks_no_text",
  "draft_text": "...",
  "risk_level": "low",
  "gate_policy": "auto_when_enabled",
  "job_id": "mj-20260611-003",     // media queueとの紐付け
  "external_result": { "reply_name": "..." },  // 送信後のreply ID
  "replied_at": null
}
```

## 7. API・認証の扱い

- 使用API: Google Business Profile API（`mybusiness.googleapis.com` 系）。OAuth認証情報は `.env.local` 管理。**中身を表示・記録しない。**
- account ID / location ID の取得（discovery）は Batch 5。取得手順を設計書化し、実際のAPI接続テストは先生承認後に実施。
- APIレスポンスは redact フィルタ（token / email / key パターンのマスク）を通してから保存。
- レート制限: watcherは1日1回・1 locationのみのため問題なし。`/review` コマンドによる手動チェックは1時間1回に制限。

## 8. Rollback / Safety

- 返信送信前に必ずdry-runパス（`media:gmb:reviews:dry-run`）が存在し、デフォルトは送信なし。
- 送信した返信のreply IDを必ず保存 → 編集は `updateReply`、削除は `deleteReply` で即時可能。削除手順（API＋管理画面の両方）を運用ドキュメント（Batch 12）に記載。
- 自動返信の `approved_by` は `auto:gmb_reply_auto_template` 等のpolicy名を記録し、Human承認と区別。
- 誤返信に気づいた場合の手順: ①Telegramで `/gmb reply delete <review_id>`（v1以降）または管理画面で削除 → ②job を failed に遷移 → ③修正返信を human_gate で再送。
- 緊急停止: `config/media-gate.json` の `gmb_reply_*` フラグOFFで自動返信は即停止（watcherの検出・通知は継続）。

## 9. 実装Batch対応

| Batch | 本設計の対応範囲 |
|---|---|
| 5 | account/location discovery（手順設計） |
| 6 | watcher v0（§2のステップ1-4＋通知。返信なし） |
| 7 | reply apply v1（§5 v1） |
| 8 | auto reply dry-run→apply（§5 v2） |
| 11 | launchd日次実行・ログローテ |
| 12 | 削除手順・緊急停止手順の運用ドキュメント |
