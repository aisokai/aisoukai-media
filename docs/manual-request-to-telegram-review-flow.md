# 手動依頼→下書き生成→Telegram通知 実運用フロー

> 共通ルールは [../CLAUDE.md](../CLAUDE.md) / [../AGENTS.md](../AGENTS.md) を正本とする。
> この文書は、手動依頼フローの運用手順だけを記す。

手動テーマ指定から記事下書き生成・レビュー通知・承認・デプロイまでの一連手順。
**AI は下書き生成と通知のみ担う。approve・publish は必ず Human が行う。**

---

## 前提条件

### 環境変数（`.env.local`）

```bash
ANTHROPIC_API_KEY=sk-ant-...       # generate:draft に必須
TELEGRAM_BOT_TOKEN=<BotFather で取得>
TELEGRAM_CHAT_ID=<通知先チャット ID>
NEXT_PUBLIC_SITE_URL=https://aisoukai-media.vercel.app
```

> **`.env.local` は絶対に commit しないこと。** `.gitignore` で除外済み。
> Vercel には Environment Variables 画面で個別に設定すること。

Telegram Bot の初回セットアップ手順は [README.md の「Telegram Bot セットアップ手順」](../README.md#telegram-bot-セットアップ手順) を参照。

---

## 完全フロー（1サイクル）

```
STEP 1  request:article   ← テーマを CSV に登録（Human 操作）
STEP 2  generate:draft    ← AI が下書きを生成
STEP 3  notify:pending-review ← Telegram に通知（Human がトリガー）
STEP 4  pending-review 画面  ← Human が内容を目視確認
STEP 5  approve:post      ← Human が承認（必須）
STEP 6  build / push / deploy ← Human がデプロイ判断
```

---

## 各 STEP の詳細

### STEP 1 — テーマを手動で記事ネタ CSV に登録

```bash
npm run request:article -- \
  --title "虫歯予防に効果的な食生活の工夫" \
  --category "予防歯科" \
  --date 2026-06-01
```

**オプション一覧:**

| オプション | 必須 | 説明 |
|-----------|------|------|
| `--title` | ✅ | 記事タイトル候補 |
| `--category` | ✅ | カテゴリ（有効値は下記） |
| `--date` | ✅ | 公開予定日（`YYYY-MM-DD`） |
| `--keyword` | ― | 検索キーワード（省略時はタイトルをそのまま使用） |
| `--intent` | ― | 患者の検索意図（省略時は自動生成） |
| `--priority` | ― | `high` / `medium` / `low`（デフォルト: `medium`） |
| `--risk` | ― | `low` / `medium` / `high`（デフォルト: `low`） |
| `--notes` | ― | 補足メモ |

**有効カテゴリ:**
`虫歯治療` / `根管治療` / `歯周病治療` / `予防歯科` / `小児歯科` /
`インプラント` / `矯正歯科` / `審美歯科` / `口腔外科` / `お知らせ`

実行後、`data/article-topics.sample.csv` に `status: approved` のレコードが追加される。
`status: approved` のネタのみ `generate:draft` の対象になる。

整合性確認:
```bash
npm run validate:topics
```

---

### STEP 2 — AI 下書きを生成

STEP 1 で登録した `topic_id`（例: `TOPIC-20260512-032`）を指定する。

```bash
npm run generate:draft -- TOPIC-20260512-032
```

- 生成先: `content/posts/YYYY-MM-DD-topic-id.md`
- frontmatter に `reviewed: false` / `auto_approved: false` / `ai_generated: true` が自動付与される
- **Human approval または Auto Publish Policy 通過までは公開されない**（ビルド時に除外）

既存ファイルを上書きする場合（再生成）:
```bash
npm run generate:draft -- TOPIC-20260512-032 --force
```

生成後の検証:
```bash
npm run validate:posts
```

---

### STEP 3 — Telegram に pending-review 通知を送信

```bash
npm run notify:pending-review
```

- console に一覧を出力し、Telegram Bot にも同内容を送信する
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` が未設定の場合は console 出力のみ（エラーにならない）
- **Telegram から approve / reject / publish を行ってはならない**（通知は読み専用）

---

### STEP 4 — ブラウザで記事内容を目視確認

```bash
npm run dev
# → http://localhost:3000/admin/pending-review
```

確認事項:
- [ ] タイトル・本文に誤りがないか
- [ ] 医療情報の正確性（根拠・数値）
- [ ] 断定表現・比較優位表現が含まれていないか
- [ ] セルフケア推奨・受診推奨の記述が適切か
- [ ] 注意書きセクション（「気になる症状は歯科医師に相談を」）が含まれているか

問題があれば:
```bash
npm run reject:post -- SLUG
# → frontmatter に rejection_reason を記録。内容を修正後に再度 generate:draft
```

---

### STEP 5 — 記事を承認（Human のみ実行可）

```bash
npm run approve:post -- SLUG --reviewed-by "氏名"
```

- frontmatter に `reviewed: true` / `reviewed_at: YYYY-MM-DD` / `reviewed_by: 氏名` が書き込まれる
- **`--reviewed-by` は必須**（誰がいつ承認したかをコードに残す）
- 承認後の確認:

```bash
npm run validate:publish-ready
# → exit 0 なら全記事が公開承認済み
```

---

### STEP 6 — ビルド・デプロイ（Human が判断）

```bash
npm run build
git add content/posts/SLUG.md
git commit -m "approve: SLUG"
git push origin main
# → Vercel が自動デプロイ（push 後 1〜2 分で反映）
```

- `reviewed: true` の記事のみ静的生成・sitemap 収録される
- `publish_at` が未来日の記事はビルド時に除外される（スケジュール公開）
- **AI が `git push` / `deploy` を自動実行してはならない**

---

## 禁止事項（変更不可ルール）

| 禁止 | 理由 |
|------|------|
| Telegram から approve を実行する | 通知は読み専用。CLI 操作は端末から行う |
| Telegram から publish / push を実行する | 同上 |
| AI が自動で approve:post を呼ぶ | Human 承認と自動承認が混ざるリスク。自動承認は `article:auto-review` に限定する |
| AI が自動で git push / deploy を実行する | 未承認コンテンツがデプロイされるリスク |
| `.env.local` を commit する | API キー・Telegram トークンの漏洩リスク |

---

## トラブルシューティング

### `generate:draft` が「ファイルが既に存在」エラーになる

同名の下書きが既に存在する場合:
```bash
# 既存ファイルを確認
ls content/posts/ | grep TOPIC-XXXX

# 上書き再生成
npm run generate:draft -- TOPIC-XXXX --force
```

### Telegram 通知が届かない

1. `.env.local` の `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` を確認
2. 疎通確認:
   ```bash
   # 外部送信を伴うため、Human が必要時だけ明示実行する
   npm run telegram:notify:live-check -- --send
   ```
3. Bot に DM を送ってから再試行（Bot が一度もメッセージを受け取っていないと chatId が無効になる）

### `approve:post` で「ファイルが見つからない」エラーになる

slug はファイル名から `.md` を除いた文字列:
```bash
# 例: content/posts/2026-06-01-topic-20260512-032.md → slug は 2026-06-01-topic-20260512-032
npm run approve:post -- 2026-06-01-topic-20260512-032 --reviewed-by "氏名"
```

---

## 関連ドキュメント

- [ai-editorial-operations-plan.md](./ai-editorial-operations-plan.md) — AI 編集部全体の運用設計
- [next-improvements.md](./next-improvements.md) — 改善候補と対応状況
- [README.md](../README.md) — コマンド一覧・環境変数・公開条件
