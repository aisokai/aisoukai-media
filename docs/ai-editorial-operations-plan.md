# AI 編集部 運用設計

> 共通ルールは [../CLAUDE.md](../CLAUDE.md) / [../AGENTS.md](../AGENTS.md) を正本とする。
> 自動公開の詳細は [dmp/auto-publish-agent-system-plan.md](dmp/auto-publish-agent-system-plan.md) を参照する。

AI が記事候補を生成し、Human review または Auto Publish Policy に基づく自動レビューを通過した記事だけを公開する運用設計。
低リスク記事は自動承認を許可し、中・高リスク記事や blocker のある記事は Human review に回す。

---

## 全体コンセプト

```
外部入力（Telegram / cron / CLI）
    ↓
AI が情報収集・記事下書きを生成
    ↓
Auto Publish Policy で low risk 記事を自動レビュー
    ↓
passed: auto_approved:true / failed: pending review
    ↓
approved 記事のみ次回ビルド時に公開
```

## 不変ルール

- AI が `reviewed: true` にすることは禁止。Human 承認と自動承認を混ぜない。
- 自動承認は `auto_approved: true` / `publication_status: auto_approved` として記録する。
- AI が `publish_at` を過去日付に操作することは禁止。
- `reviewed: true` または `auto_approved: true` 以外の記事はビルドに含まれず公開されない。
- Auto Publish Policy を満たさない記事は Human review に回す。
- `approve:post` / `reject:post` は Human 操作用 CLI として維持する。
- Telegram からの approve / publish は引き続き禁止する。

---

## フロー 1: 手動依頼型

Human が Telegram や CLI でテーマを指定し、AI が下書きを生成する。

```
[Human] Telegram / CLI でテーマを指定

[Bot]   テーマを受信
        → topic ID を生成
        → article-topics.sample.csv に追記
        → generate:draft を実行

[Auto]  article:auto-review を実行
        → low risk かつ blocker なしなら auto_approved
        → 条件未達なら pending review に残す

[Bot]   Telegram に通知
        「自動承認: n件 / Human review: n件」

[System] approved 記事のみ次回ビルド時に公開
```

## フロー 2: 定期提案型

スケジュール（月・水・金など）で AI が自動的に記事候補を収集・生成する。

```
[Cron]  設定時刻に起動

[AI]    research:trends を実行
        → 歯科テーマ・季節テーマ・患者FAQ から候補を収集
        → data/research/YYYY-MM-DD-trends.json に保存

[AI]    優先度・medical_risk を評価
        → article-topics.sample.csv に追記
        → generate:draft を実行

[Auto]  Auto Publish Policy で自動レビュー
        → low risk + blocker なし + 画像確認済みなら auto_approved
        → それ以外は pending review

[Bot]   Telegram に通知
        「自動承認: n件 / Human review: n件」

[System] approved 記事のみ次回ビルド時に公開
```

---

## Approval ルール

すべての記事は以下のどちらかを満たさなければ公開されない。

| 種別 | 条件 |
|------|------|
| Human approval | `reviewed: true` / `reviewed_at` / `reviewed_by` |
| Auto approval | `auto_approved: true` / `auto_approved_at` / `auto_approved_by` / `legal_check_status: passed` / `image_check_status: passed` / `medical_risk: low` |
| 共通 | `draft: true` でない / `publish_at` が現在日以前 |

`approve:post` スクリプトは「Human が実行する CLI」として維持する。
AI エージェントは `auto-review-post.mjs` だけを使い、Human 承認メタデータを書き換えない。

---

## LINE / Telegram 連携

Telegram は通知とダイジェストに使う。

- 下書き生成完了
- 自動承認成功
- Auto Publish Policy 失敗
- Human review 待ち件数
- build 失敗

Telegram から直接 approve / publish する機能は作らない。

---

## 実装フェーズ

### Phase 0: ルール変更

- AGENTS.md / README / DMP 文書を条件付き自動公開へ更新
- `reviewed:true` と `auto_approved:true` の責務を分離

### Phase 1: 自動レビュー CLI

- `scripts/auto-review-post.mjs` を追加
- low risk / blocker / 画像 / 必須 frontmatter を検査
- `logs/auto-publish-history.md` と `data/auto-publish-reviews/*.json` に結果を保存

### Phase 2: 定期フロー接続

- `article:scheduled -- --auto-publish` で下書き生成後に自動レビュー
- 条件未達の記事は pending review に残す

### Phase 3: 本番スケジュール

- GitHub Actions または Vercel Cron で定期実行
- `approve:post` / deploy / push は直接実行しない

### Phase 4: 週次監査

- 公開済み記事の再チェック
- 医療広告ガイドライン変更、古い情報、画像ライセンス、重複を監査

---

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `ANTHROPIC_API_KEY` | AI 下書き生成に使用 |
| `TELEGRAM_BOT_TOKEN` | Telegram 通知に使用 |
| `TELEGRAM_CHAT_ID` | 通知先チャット ID |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Telegram 操作元制限 |

すべて `.env.local` に記述し、commit しない。
