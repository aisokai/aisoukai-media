# 承認制 AI 編集部 運用設計

AI が記事候補を生成し、Human が確認・承認してから公開する「承認制 AI 編集部」の運用設計。
自動公開・自動承認は行わず、AI は常に **下書き生成** と **通知** のみ担う。

---

## 全体コンセプト

```
外部入力（LINE / Telegram / cron）
    ↓
AI が情報収集・記事下書きを生成（reviewed: false）
    ↓
/admin/pending-review に表示
    ↓
LINE / Telegram で通知（「確認してください」）
    ↓
Human が記事本文を確認・判断
    ↓
CLI で approve / reject
    ↓
approved 記事のみ次回ビルド時に公開
```

**不変ルール（どのフェーズでも変えない）:**
- AI が `reviewed: true` にすることは絶対禁止
- AI が `publish_at` を過去日付に操作することは禁止
- `reviewed: false` の記事はビルドに含まれず公開されない
- approve 操作は Human が CLI または明示的 UI 操作でのみ実行する

---

## フロー 1: 手動依頼型

Human が LINE / Telegram でテーマを指定し、AI が下書きを生成する。

```
[Human] LINE/Telegram でテーマを送信
        例: 「親知らずの抜歯後ケアについて記事を書いて」

[Bot]   テーマを受信 → topic ID を生成
        → article-topics.sample.csv に追記
        → generate:draft を実行（reviewed: false）
        → /admin/pending-review に記事が追加される

[Bot]   LINE/Telegram に通知
        「下書きが完成しました。確認してください」
        「記事タイトル: 親知らず抜歯後のケア…」
        「確認URL: https://aisoukai-media.vercel.app/admin/pending-review」

[Human] ブラウザで記事を確認

[Human] 問題なければ CLI で承認:
        npm run approve:post -- <slug> --reviewed-by "三谷"

[System] 次回ビルド時に公開
```

---

## フロー 2: 定期提案型

スケジュール（月・水・金など）で AI が自動的に記事候補を収集・生成する。

```
[Cron]  設定時刻に起動（例: 毎週月・水・金 9:00 JST）

[AI]    research:trends を実行
        → 歯科テーマ・季節テーマ・患者FAQ から候補を収集
        → data/research/YYYY-MM-DD-trends.json に保存

[AI]    優先度・medical_risk を評価し、採用候補を1〜2件に絞る
        → article-topics.sample.csv に追記（status: idea）
        → generate:draft を実行（reviewed: false）

[Bot]   LINE/Telegram に通知
        「今週の記事候補が届きました」
        「1. 〇〇についての記事（虫歯治療・low risk）」
        「確認URL: https://aisoukai-media.vercel.app/admin/pending-review」

[Human] 不要なら reject、問題なければ approve

[System] 次回ビルド時に approved 記事のみ公開
```

---

## Human Approval 必須ルール

すべての記事は以下の条件を満たさなければ公開されない（コードレベルで保証済み）:

| 条件 | 内容 |
|------|------|
| `reviewed: true` | Human が明示的に承認した証明 |
| `reviewed_at` | 承認日（`approve:post` CLI が自動付与） |
| `reviewed_by` | 承認者名（`--reviewed-by` 引数が必須） |
| `draft: true` でない | ドラフト明示記事は除外 |
| `publish_at` が現在日以前 | スケジュール公開の場合 |

**AI が直接これらを書き換えることは禁止。**  
`approve:post` スクリプトは「Human が実行する CLI」として設計されており、
AI エージェントによる自動実行は禁止事項としてコメントに明記されている。

---

## LINE / Telegram 連携の将来構成

### 通知のみ（Phase 4C）

```
generate:draft 完了後
    ↓
Webhook 送信スクリプト（scripts/notify-pending.mjs）
    ↓
LINE Messaging API / Telegram Bot API
    ↓
「下書き完了・確認してください」メッセージ
```

実装は1スクリプト追加のみ。既存フローへの影響なし。

### 手動依頼受付（Phase 4B → 4D）

```
LINE/Telegram からのメッセージ受信
    ↓
Webhook エンドポイント（Vercel Function / 外部サーバー）
    ↓
テーマを解析 → topic CSV に追記 → generate:draft 実行
    ↓
完了通知を返信
```

Webhook エンドポイントの実装が必要。Vercel Edge Function または
外部 Node.js サーバー（例: Railway / Fly.io）を使う。

---

## 実装フェーズ案

### Phase 4A: docs（今回）
- 運用設計ドキュメント作成
- 不変ルールの明文化
- コード変更なし

### Phase 4B: 手動依頼 CLI 拡張
- `scripts/request-article.mjs` を追加
  - テーマ文字列を受け取り、topic CSV 追記 → `generate:draft` を実行する
  - CLI から呼べる形にする（将来の Webhook 呼び出しに備える）
- ローカルで `node scripts/request-article.mjs "テーマ"` で動作確認

### Phase 4C: 通知のみ（最小 LINE/Telegram 連携）
- `scripts/notify-pending.mjs` を追加
  - pending review の件数・タイトル・URL を LINE または Telegram に送信
  - 環境変数: `LINE_CHANNEL_ACCESS_TOKEN` / `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
- `generate:draft` の完了後に呼び出す or 単独で実行
- Human approval フローは変更しない

### Phase 4D: Approval UX 改善
- `/admin/pending-review` に記事本文プレビューを追加
- approve / reject ボタンを追加（**サーバーサイド Action 経由**、API なしで実行）
- ボタン押下は「CLI コマンドをサーバーサイドで実行」と同等の扱いにし、
  審査フローの本質（Human による明示的操作）を維持する

### Phase 4E: 定期提案型（cron）
- GitHub Actions の schedule trigger または Vercel Cron を使用
- `research:trends → --import → generate:draft → notify` を自動実行
- Human approval なしには公開されないことをワークフローで保証する
- cron が直接 approve / deploy しないことを明示する

---

## 環境変数（将来追加予定）

| 変数名 | 追加フェーズ | 説明 |
|--------|------------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | 4C | LINE Messaging API トークン |
| `TELEGRAM_BOT_TOKEN` | 4C | Telegram Bot トークン |
| `TELEGRAM_CHAT_ID` | 4C | 通知先チャット ID |
| `WEBHOOK_SECRET` | 4D | Webhook 受信時の署名検証用 |

すべて `.env.local` に記述し、絶対に commit しないこと。
