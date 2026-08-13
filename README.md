# aisoukai-media

藍想会が運営する歯科メディアサイト。AI運用前提で設計された Next.js + Markdown ベースのコンテンツ基盤。

## 技術スタック

| 技術 | 用途 |
|------|------|
| Next.js 15 (App Router) | フレームワーク |
| TypeScript strict | 型安全 |
| Tailwind CSS v4 | スタイリング |
| gray-matter | Markdown frontmatter パース |
| remark / remark-html | Markdown → HTML 変換（sanitize:true） |

## 記事ネタDB

記事ネタDB は、今後 AI が歯科メディアの記事候補を定期収集し、下書き作成へ接続するための企画・進行管理の正本です。

初期段階では Google Sheets API には接続せず、Google スプレッドシートに入力した内容を CSV でエクスポートまたは貼り付けして運用します。

### 使い方

1. `data/article-topics.sample.csv` をテンプレートとして使う
2. スプレッドシートで候補を管理する
3. `npm run validate:topics` で CSV の整合性を確認する
4. 公開記事の本文は `content/posts/*.md` を正本として管理する

### 記録する項目

- ネタの発見日
- 収集元の種別
- 記事テーマ
- 候補タイトル
- カテゴリ
- 検索キーワード
- 患者の検索意図
- 優先度
- 医療リスク
- 進捗ステータス

### status の使い分け

- `idea`: アイデア段階
- `approved`: 採用済み
- `drafting`: 下書き作成中
- `reviewed`: レビュー完了
- `published`: 公開済み
- `hold`: 保留

## 開発環境

```bash
npm install
npm run dev
```

→ http://localhost:3000

## 共通ルール

この repo の作業ルールは [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) を正本とする。  
ここでは主に使い方を案内し、公開条件・review・Telegram・完了報告の共通ルールはそちらに集約する。

## DMP横展開

DMPブログ自動更新システムは、Instagram / X / LINE / YouTube / Website へ横展開するための雛形として扱う。

- 共通テンプレート: [docs/dmp/dmp-channel-template.md](docs/dmp/dmp-channel-template.md)
- SNS展開計画: [docs/dmp/dmp-sns-expansion-plan.md](docs/dmp/dmp-sns-expansion-plan.md)

共通方針は `ネタ候補 -> AI下書き -> review待ち -> Telegram通知 -> Human承認 -> 手動公開`。
SNSについては当面、外部APIによる自動投稿は行わず、手動投稿用Markdownを生成する。

## ディレクトリ構成

```
aisoukai-media/
├── content/
│   └── posts/           # 記事置き場（AI自動生成記事もここへ）
├── src/
│   ├── app/             # App Router ページ
│   │   ├── page.tsx         # トップページ
│   │   └── blog/
│   │       ├── page.tsx         # 記事一覧
│   │       └── [slug]/page.tsx  # 記事詳細
│   ├── components/      # Header / Footer / ArticleCard
│   └── lib/
│       └── posts.ts     # Markdown読み取りユーティリティ
└── public/
```

## 環境変数（本番必須）

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `NEXT_PUBLIC_SITE_URL` | **本番必須** | サイトの公開 URL（末尾スラッシュなし）。sitemap.xml・OGP・canonical の絶対 URL 生成に使用する |
| `ANTHROPIC_API_KEY` | generate:draft 実行時 | Claude API キー。`.env.local` に記述し commit しないこと |
| `TELEGRAM_BOT_TOKEN` | telegram:notify:live-check / 将来の通知連携 | BotFather で取得したトークン。`.env.local` に記述し commit しないこと |
| `TELEGRAM_CHAT_ID` | telegram:notify:live-check / 将来の通知連携 | 通知先チャット ID（個人 DM の場合は数値 ID）。`.env.local` に記述し commit しないこと |
| `TELEGRAM_ALLOWED_CHAT_IDS` | telegram:ops | Telegram からの記事リクエスト取得・通知先制限に使用する chat_id または from_id のカンマ区切りリスト。未設定時は `TELEGRAM_CHAT_ID` にフォールバック |
| `ADMIN_REVIEW_PASSWORD` | スマホ承認フロー | `/admin/pending-review` へログインするための管理者パスワード。Vercel Production に設定する |
| `ADMIN_REVIEW_COOKIE_SECRET` | スマホ承認フロー | 管理画面ログイン Cookie の署名用秘密鍵。32文字以上のランダム文字列を Vercel Production に設定する |
| `GITHUB_REVIEW_TOKEN` | スマホ承認フロー | `/admin/pending-review` の承認・却下操作で GitHub に commit するための token。`aisokai/aisoukai-media` への contents 書き込み権限が必要 |
| `GITHUB_REVIEW_REPO` | スマホ承認フロー | GitHub repo 名。通常は `aisokai/aisoukai-media` |
| `GITHUB_REVIEW_BRANCH` | スマホ承認フロー | commit 先 branch。通常は `main` |

```bash
# .env.local に設定する例
NEXT_PUBLIC_SITE_URL=https://your-domain.com
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=<BotFather から取得したトークン>
TELEGRAM_CHAT_ID=<チャット ID>
```

### Telegram Bot セットアップ手順

1. Telegram で [@BotFather](https://t.me/BotFather) に `/newbot` を送信してトークンを取得
2. 作成した Bot に DM を送信する（または追加したグループで `/start` を送信）
3. チャット ID を確認する:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
   # result[0].message.chat.id の値を使う
   ```
4. `.env.local` に `TELEGRAM_BOT_TOKEN` と `TELEGRAM_CHAT_ID` を設定する
5. 疎通確認:
   ```bash
   # 外部送信を伴うため、Human が必要時だけ明示実行する
   npm run telegram:notify:live-check -- --send
   ```

**Vercel へのデプロイ時:**
Vercel ダッシュボード → Settings → Environment Variables に `NEXT_PUBLIC_SITE_URL` とスマホ承認フロー用の環境変数を設定してください。
`NEXT_PUBLIC_SITE_URL` が未設定または localhost URL のままでは本番ビルドがエラーで停止します（sitemap / OGP への localhost 混入を防ぐ安全装置）。

## 公開条件

公開条件・review・Telegram・報告の共通ルールは [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) を参照する。  
この README では、関連コマンドの使い方を中心に案内する。

## 記事の追加方法

`content/posts/` に Markdown ファイルを追加するだけで記事候補になります。公開可否は共通ルールに従います。

ファイル名規則: `YYYY-MM-DD-slug.md`

frontmatter 必須フィールド:

```markdown
---
title: "記事タイトル"
date: "2026-01-15"
description: "記事の概要（OGP・一覧表示に使用）"
category: "カテゴリ名"
tags:
  - タグ1
  - タグ2
---
```

## AI自動記事生成の拡張ポイント

1. **記事ファイル生成**: `content/posts/` に frontmatter 付き Markdown を追加するだけで即時公開
2. **型参照**: `src/lib/posts.ts` の `PostMeta` 型を参照して frontmatter を構成
3. **デプロイ自動化**: `npm run build` → Vercel / GitHub Actions でデプロイ可能
4. **OGP画像生成**: `opengraph-image.tsx` を各ページに追加で SNS対応
5. **カテゴリ管理**: 記事数増加後は `content/categories.json` 等でマスタ管理を検討
6. **記事ネタDB連携**: Google スプレッドシート由来の CSV を `validate:topics` で検証し、採用ネタを `content/posts/` の下書きへ接続する

## コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 (http://localhost:3000) |
| `npm run build` | 本番ビルド |
| `npm run lint` | ESLint 実行 |
| `npm run validate:topics` | `data/article-topics.sample.csv` の整合性を検証する |
| `npm run import:topic -- TOPIC-XXXX` | CSVから指定 topic_id のテンプレート下書きを生成する |
| `npm run generate:draft -- TOPIC-XXXX` | CSVから指定 topic_id の AI 生成下書きを作成する（要 API キー） |
| `npm run new:post -- --title "..." --category "..." --excerpt "..." --tags "..."` | 空の記事ファイルを新規作成する |
| `npm run validate:posts` | `content/posts/` の全記事 frontmatter を検証する |
| `npm run research:trends` | AIトレンド調査の記事候補を `data/research/` に出力する（dry-run） |
| `npm run validate:publish-ready` | 公開承認状態を確認する（本文確認済みの reviewed: true / reviewed_at / reviewed_by と必須項目充足チェック） |
| `npm run list:pending-review` | Human review 待ちの記事一覧を表示する |
| `npm run request:article -- --title "..." --category "..." --date YYYY-MM-DD` | テーマを手動指定して記事ネタ CSV に追加する（generate:draft の前段） |
| `npm run notify:pending-review` | pending review 記事の一覧を console 出力し、Telegram Bot に通知する（要 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`） |
| `npm run notify:posting-reminder` | 月・水・金にコンテンツ状態サマリーを Telegram に送る投稿確認リマインド。`--force` で曜日に関係なく送信 |
| `npm run telegram:requests` | Telegram 受信メッセージから記事リクエストを取得（デフォルト dry-run / `--apply` で保存） |
| `npm run telegram:ops` | Telegram 記事運用フロー: 新着メッセージを解析し、記事リクエスト取得・下書き生成の補助を行う（デフォルト dry-run / `--apply` で実行 / `--build` で build も実行）。Telegram から直接 approve / reject / publish はしない |
| `npm run request:list` | `data/article-requests.json` の記事リクエスト一覧を表示（読み取り専用） |
| `npm run request:draft -- <update_id> --category "カテゴリ" --date YYYY-MM-DD` | リクエストから frontmatter のみの下書き記事を生成し、pending-review に追加する（Human がトリガー） |
| `npm run request:ignore -- <update_id> --reason "理由"` | リクエストを見送り（ignored）にする。元メッセージは削除しない |
| `npm run request:archive -- <update_id>` | リクエストを archived にする（最終状態。一覧から省略表示） |
| `npm run request:archive -- --all-done` | drafted / ignored の全件を一括 archived にする |
| `npm run notify:requests` | 記事リクエストの状態サマリーを console 出力し Telegram に送信する（Human がトリガー） |
| `npm run ops:mwf` | 月水金 定期運用を実行（未使用CSVネタから1記事生成→永続ストック→Telegramレビュー依頼）。月水金以外は警告。`--force` で強制実行 |
| `npm run image:import-inbox` | `public/images/library/inbox/` を再帰走査して画像を自動分類・コピー・JSON 登録する（デフォルト dry-run / `--apply` で実行 / `--apply --move` で移動） |
| `npm run image:list` | 画像ライブラリのサマリーを表示する（カテゴリ別件数 / alt未カスタマイズ / license未更新 / 未使用画像。`--all` で全件表示） |
| `npm run image:check` | `data/image-library.json` と記事画像の整合性を検証する（path実在 / id重複 / category妥当性 / alt・license確認 / 記事の image・image_alt 必須） |
| `npm run image:reclassify -- <image-id> --category <category>` | 画像のカテゴリを変更してファイルを移動し、JSON と記事 frontmatter を更新する（デフォルト dry-run / `--apply` で実行 / `--alt "..."` で alt を上書き） |
| `npm run image:suggest -- <slug>` | 記事に合う画像を `data/image-library.json` から候補提示する（読み取り専用） |
| `npm run image:assign -- <slug> --image <image-id>` | 画像 ID を記事 frontmatter に割り当てる（`image` / `image_alt` を更新。`reviewed` は変更しない） |
| `npm run image:license:list` | `license_note` に TODO が残っている画像を一覧表示する（読み取り専用 / `--all` で全件） |
| `npm run image:license:update -- <image-id> --date YYYY-MM-DD --plan "プラン"` | 指定画像の `license_note` を Pixta 購入情報で更新する |
| `npm run image:license:bulk-template` | TODO 残件を Markdown テーブル（`docs/license-bulk-template.md`）に出力する。一覧を確認しながら `image:license:update` で順次記入 |
| `npm run image:purchase:list` | 不足カテゴリの購入候補・検索キーワード・医療広告注意点を表示する（読み取り専用） |
| `npm run image:usage` | 記事 ↔ 画像の対応一覧を表示する（未割当記事・共用画像も表示。読み取り専用） |
| `npm run telegram:notify:live-check -- --send` | Telegram Bot への疎通確認（外部送信あり。Human の明示実行のみ） |
| `npm run article:manual -- --title "..." --category "..." --date YYYY-MM-DD` | 手動依頼フロー: topic 登録 → AI 下書き生成 → Telegram 通知を一括実行（Human がトリガー） |
| `npm run article:scheduled` | 定期提案フロー: CSVの未使用ネタを1件選択 → AI下書き生成 → 画像確認 → Telegram通知（掲載はHuman承認後のみ） |
| `npm run article:scheduled -- --auto-publish` | 使用禁止。本文確認なしの自動公開を防ぐためエラー終了する |
| `npm run article:auto-scheduled` | 定期運用向けの短縮コマンド。次の approved topic を本日配信予定のレビュー待ち記事として生成する |
| `npm run article:batch-scheduled -- --month YYYY-MM --limit N` | 指定月の approved かつ未生成 topic をまとめて下書き生成する（Human が明示実行 / approve・publish はしない） |
| `npm run article:auto-review -- <slug>` | 補助チェック用。`auto_approved:true` は本文承認の代替にしない |
| `npm run article:auto-review -- <slug> --dry-run` | 指定記事の補助チェックだけを確認し、ファイルや監査ログは更新しない |
| `npm run article:auto-review -- --all` | pending review 記事を一括で補助チェックする |
| `npm run approve:post -- <slug> --reviewed-by "氏名" --confirm-body-reviewed` | Human として本文確認後に記事を承認する（reviewed: true / reviewed_at・reviewed_by を設定） |
| `npm run reject:post -- <slug>` | 記事を差し戻す（rejection_reason と review log を記録。--reviewed-by も指定可） |
| `npm run resubmit:post -- <slug> --reviewed-by "氏名" --reason "理由"` | 差し戻し済み記事を pending-review に戻す。元の差し戻し履歴は logs/ に保持。自動 approve しない |
| `npm run sns:validate` | `content/sns-drafts/` のSNSドラフトfrontmatterを検証する。`publish_mode: manual_only` のみ許可 |
| `npm run sns:list-pending-review` | SNSドラフトのreview待ち一覧を表示する（読み取り専用） |
| `npm run status:content` | 公開中・公開予定・review待ち・差し戻し済みの件数と一覧を表示する（読み取り専用） |
| `npm run status:publish-ready` | publish-ready 判定チェック（exit 1 でも CI エラー扱いしない確認用コマンド） |

### スマホ承認フロー

1. Telegram 通知から `/admin/pending-review` を開く
2. 管理者パスコードでログインする
3. 記事本文・画像・注意事項を確認する
4. 「承認」または「却下」を押す
5. GitHub に Human 操作として commit される
6. 本文確認済みの `reviewed:true` / `reviewed_at` / `reviewed_by` が揃った記事のみ Vercel の通常デプロイで公開対象になる

Telegram から直接承認しない。publish API は作らない。

## 運用開始フロー

### パターン A — AI トレンド調査起点

```
1. npm run research:trends
   → data/research/YYYY-MM-DD-trends.json で候補確認

2. 採用候補を data/article-topics.sample.csv に手動追記（または --import フラグで半自動）
   → npm run validate:topics で確認

3. npm run generate:draft -- TOPIC-XXXX
   → content/posts/ に reviewed:false の下書きを生成

4. npm run notify:pending-review
   → Telegram に一覧を通知（Human がトリガー。通知からの approve は禁止）

5. http://localhost:3000/admin/pending-review で本文を確認

6. npm run approve:post -- SLUG --reviewed-by "氏名" --confirm-body-reviewed
   → 本文確認済みとして reviewed:true / reviewed_at / reviewed_by が揃い、公開対象に入る

7. npm run validate:publish-ready
   → publish-ready 件数を確認（exit 0 なら全承認済み）

8. npm run build → Human が push / deploy を判断・実行
   → reviewed:true / reviewed_at / reviewed_by が揃った記事のみ静的生成・sitemap 収録
```

### パターン B — 手動テーマ指定起点

```
1. npm run request:article -- --title "タイトル" --category "カテゴリ" --date YYYY-MM-DD
   → data/article-topics.sample.csv に status:approved で登録

2. npm run generate:draft -- TOPIC-XXXX
   → content/posts/ に reviewed:false の下書きを生成

3. npm run notify:pending-review
   → Telegram に一覧を通知（Human がトリガー）

4〜8. パターン A の 5〜8 と同じ
```

> 詳細手順: [docs/manual-request-to-telegram-review-flow.md](docs/manual-request-to-telegram-review-flow.md)

スケジュール公開の判定は共通ルールと workflow docs に従う。実装の詳細は各 workflow を参照する。

## 日常運用フロー

### 月水金 定期運用（`ops:mwf`）

**月・水・金に、未使用ネタから1記事を生成してストックし、レビュー依頼を送る:**

```bash
npm run ops:mwf               # 月・水・金のみ実行
npm run ops:mwf -- --force    # 曜日に関わらず実行
```

`ops:mwf` が順に実行すること（approve / publish / push / request:draft 自動実行なし）:
1. 月次ネタCSVから未使用ネタを1件選び、AI下書きを生成
2. 生成記事を永続ストックする
3. Telegram に必ずレビュー・承認依頼を送信する（失敗時は未送信として次回再試行する）
4. 先生が承認した記事だけが既存の掲載経路へ進む

記事生成ステップの制御:

```bash
npm run ops:mwf -- --no-generate    # 生成せず、未送信Telegram通知だけを再試行
```

記事生成は次の場合にスキップされる:

- `--no-generate` 指定
- `ANTHROPIC_API_KEY` 未設定
- 未使用ネタがない
- 記事生成または画像設定に失敗した

**ops:mwf 後に Human が実行するアクション:**

```bash
# review待ちを承認
# スマホなら /admin/pending-review、CLIなら以下
npm run approve:post -- <slug> --reviewed-by "三谷"

# 承認後にデプロイ（Human の明示判断で実行）
npm run build
git push origin main
```

> `approve / publish / push / request:draft` は `ops:mwf` が自動実行しない。Human 判断が必要。
> 定期記事生成は下書き作成までで、標準では Human review 待ちに残る。

#### launchd による自動実行（macOS）

Mac の launchd を使って月・水・金 08:30 に自動実行できる。

```bash
npm run ops:mwf:install    # launchd に登録（初回のみ）
npm run ops:mwf:status     # 登録状態・次回実行を確認
npm run ops:mwf:uninstall  # 解除
```

- plist: `~/Library/LaunchAgents/com.mitani.aisoukai-media-ops-mwf.plist`
- ログ: `logs/ops-mwf.log` / `logs/ops-mwf-error.log`
- 内部では `--force` フラグで `ops:mwf.mjs` を直接起動する
- 生成を止めたい場合は手動運用で `npm run ops:mwf -- --force --no-generate` を使う
- Mac がスリープ中は実行されない（起動後に次の実行時刻まで待機）

### 毎朝の確認（所要 1〜2 分）

```bash
npm run status:content         # 公開中/予定/待ちの全体像
npm run notify:pending-review  # Telegram にサマリーを送信（任意）
```

### 記事を1件生成→公開するまでの流れ

```bash
# 1. 下書き生成
npm run article:manual -- --title "テーマ" --category "カテゴリ" --date YYYY-MM-DD
# または
npm run generate:draft -- TOPIC-XXXX

# 2. 本文確認（管理画面 or CLI）
npm run list:pending-review
# → http://localhost:3000/admin/pending-review でも確認可

# 3. 承認 または 差し戻し（Human が実行）
# スマホなら /admin/pending-review、CLIなら以下
npm run approve:post -- <slug> --reviewed-by "氏名"
# npm run reject:post -- <slug>

# 4. build確認
npm run validate:publish-ready   # publish-ready 件数確認
npm run build                     # エラーがないか確認

# 5. push / deploy（Human の明示判断で実行）
git push origin main
# → Vercel が自動デプロイ
```

### 今月分の記事をまとめて下書き生成

月次候補から採用済みになっている記事を、まとめて review 待ちへ積む場合:

```bash
npm run article:batch-scheduled -- --month 2026-06 --dry-run
npm run article:batch-scheduled -- --month 2026-06 --limit 5
```

- 対象は `status: approved` かつ指定月の `publish_date` を持つ topic
- 既に `content/posts/<publish_date>-<topic-id>.md` がある topic はスキップ
- 実行後の記事は `reviewed:false` の下書きで、承認・公開は行わない
- 生成後は `npm run validate:posts` と `/admin/pending-review` で確認する

### Telegram digest 確認

```bash
npm run notify:pending-review
```

通知には 公開中・公開予定・review待ち・差し戻し済みの全件数を含む。  
**通知から直接 approve / publish を行わないこと（AGENTS.md 絶対禁止）。**

### 月水金の投稿確認リマインド

```bash
npm run notify:posting-reminder        # 月・水・金のみ送信
npm run notify:posting-reminder -- --force  # 曜日に関係なく送信
```

通知内容: 公開中/予定/review待ちのサマリー + 管理画面URL。launchd による自動実行に対応（`npm run ops:mwf:install`）。

### Telegram 記事リクエスト受信

Telegram に記事テーマをメッセージすると、以下のコマンドで受信できる。

```bash
npm run telegram:requests              # dry-run（確認のみ）
npm run telegram:requests -- --apply   # data/article-requests.json に保存
npm run request:list                   # リクエスト一覧を表示
```

- approve / publish / push 系メッセージは自動的に無視される
- 受信した記事リクエストから直接 approve / publish はしない
- launchd 自動化対応: `npm run ops:mwf:install` で月水金 08:30 に自動実行できる

### 暫定Laptop運用（`telegram:ops` の 3 分おき再実行）

Wi-Fi 切断や一時的な API 失敗後も、復帰時に Telegram 処理を再開できるようにする暫定運用。

```bash
npm run telegram:ops:install    # launchd に登録（3分おきに自動実行）
npm run telegram:ops:status     # 登録状態・ログ保存先を確認
npm run telegram:ops:uninstall  # 解除
```

- 実行間隔: 3分おき
- 実行コマンド: `cd ~/Desktop/aisoukai-media && npm run telegram:ops -- --apply`
- Telegramリクエスト確認と承認処理までは自動。`build` / `push` は行わない
- `build` / `push` は Human Gate とし、先生の明示操作だけで実行する
- ログ: `logs/telegram-ops.log`
- エラーログ: `logs/telegram-ops-error.log`
- Wi-Fi 切断や API 失敗時はエラー終了してよい。次回実行で再取得する

### Telegram リクエスト → 下書きライフサイクル

Telegram から受信した記事リクエストを下書き記事に変換するフロー。

```
Telegram メッセージ
   ↓
npm run telegram:requests -- --apply   # data/article-requests.json に保存 (status: requested)
   ↓
npm run request:list                   # 未処理リクエストを確認
npm run notify:requests                # Telegram にサマリーを送信（任意）
   ↓ 採用する場合
npm run request:draft -- <update_id> --category "カテゴリ" --date YYYY-MM-DD
   → content/posts/<date>-<slug>.md を生成（reviewed:false, draft:false）
   → status が "drafted" に更新される
   → http://localhost:3000/admin/pending-review に出現
   ↓
（通常の approve フローへ: 本文記入 → approve:post）
   ↓ 下書き完了後
npm run request:archive -- <update_id>  # または --all-done で drafted/ignored を一括 archived
```

#### status の意味

| status | 説明 | 次のアクション |
|--------|------|--------------|
| `requested` | 受信済み・未処理 | `request:draft` または `request:ignore` |
| `drafted` | 下書き生成済み | 本文記入 → `approve:post` |
| `ignored` | 見送り済み | 必要なら `request:archive` |
| `archived` | 最終状態。一覧から省略表示 | なし（データは保持） |

#### 見送りの場合

```bash
npm run request:ignore -- <update_id> --reason "当院の診療範囲外のため"
npm run request:archive -- --all-done  # drafted/ignored を一括 archived
```

---

## 画像運用

### 素材を入れる場所

```
public/images/library/
  cavity/          虫歯治療
  root-canal/      根管治療
  periodontal/     歯周病治療
  preventive/      予防歯科
  pediatric/       小児歯科
  wisdom-tooth/    親知らず
  implant/         インプラント
  announcement/    お知らせ
  general/         汎用・その他
```

ファイル名規則: `<category>-<PixtaID>.jpg`（例: `cavity-3291061.jpg`）  
Pixta 以外の場合は `<category>-<任意ID>.jpg` で重複しない ID を付与する。

### image-library.json の書き方

```jsonc
// data/image-library.json
{
  "images": [
    {
      "id": "cavity-3291061",                                 // 一意 ID（英数字・ハイフン）
      "path": "/images/library/cavity/cavity-3291061.jpg",   // public/ 配下のパス
      "category": "cavity",                                   // フォルダ名と合わせる
      "tags": ["虫歯", "治療", "歯科"],                       // 記事マッチングに使うキーワード
      "alt": "頬を押さえて歯の痛みに顔をしかめる女性",       // 必須・内容を具体的に記述
      "license_source": "Pixta",                              // 素材サイト名
      "license_note": "Pixta ID: 3291061 — 購入日: 2026-05-13 / プラン: シングルパック"
    }
  ]
}
```

**`license_note` の TODO 運用:**  
購入直後に記入できない場合は `"購入日: TODO / プラン: TODO"` と記入する。  
`npm run image:check` が TODO 文字列を警告として検出するため、漏れなく追跡できる。

### inbox から画像を一括インポートする（`image:import-inbox`）

Pixta など有料素材サイトからまとめてダウンロードした画像を `public/images/library/inbox/` に置き、以下のコマンドで自動分類・ライブラリ登録できる。

```bash
# 1. ダウンロードした画像を inbox に配置（サブフォルダごとでも可）
#    public/images/library/inbox/
#      20260513_photo/
#        34130816_s.jpg   ← Pixta の場合は数値ID + _s/_m/_l サフィックス

# 2. dry-run で分類結果を確認（ファイル変更なし）
npm run image:import-inbox

# 3. 問題なければ実行（public/images/library/<category>/ にコピー + JSON 更新）
npm run image:import-inbox -- --apply

# または元ファイルを削除して移動
npm run image:import-inbox -- --apply --move
```

**自動分類ルール:**
- ファイル名・親フォルダ名にキーワードが含まれていれば対応カテゴリへ分類
- Pixta の数値 ID ファイルはキーワードがないため `general` に分類される（手動で category を修正すること）
- `_s` / `_m` / `_l` サフィックスを除去して ID を正規化（例: `34130816_s.jpg` → `general-34130816.jpg`）

**インポート後の作業:**
1. `npm run image:list` でインポート結果を確認（alt 未カスタマイズ / license 未更新 の件数）
2. `npm run image:check` でエラーがないことを確認（エラーがあれば修正してから次へ）
3. `data/image-library.json` を開き、`general` の画像を適切な category に修正する
   - `npm run image:reclassify -- <image-id> --category <category>` で分類変更（dry-run → `--apply`）
   - `--alt "..."` オプションで alt も同時に更新できる
4. `alt` テキストを実際の画像内容に合わせて書き直す
5. Pixta 購入情報を記入する（TODO のままでも OK。後で `image:license:update` で一件ずつ記入できる）
6. `npm run image:suggest -- <slug>` で記事への割当候補を確認する

### Pixta 購入後の license_note を入力する（`image:license:update`）

```bash
# 購入情報が未入力の画像を確認（TODO 件数を一覧表示）
npm run image:license:list

# 1件ずつ購入情報を記入（--date と --plan は必須）
npm run image:license:update -- <image-id> --date YYYY-MM-DD --plan "シングルパック"

# 例
npm run image:license:update -- general-3291061 --date 2026-05-13 --plan "シングルパック"

# 記入後に整合性確認
npm run image:check
```

プラン名の例: `シングルパック` / `定額プラン（月XX点）` / `法人プラン`

### 画像の追加から記事への割当まで（全体フロー）

```bash
# ── STEP 1: 購入 ──
npm run image:purchase:list    # 不足カテゴリの購入候補・検索キーワードを確認
# → Pixta で購入してダウンロード

# ── STEP 2: インポート ──
# public/images/library/inbox/ にダウンロードした画像を置く
npm run image:import-inbox              # dry-run で確認
npm run image:import-inbox -- --apply   # 実行

# ── STEP 3: 分類・メタデータ整備 ──
npm run image:reclassify -- <id> --category <cat> --alt "画像説明" --apply  # 必要な場合
npm run image:license:update -- <id> --date YYYY-MM-DD --plan "プラン名"

# ── STEP 4: 記事への割当 ──
npm run image:usage           # 画像未割当の記事を確認
npm run image:suggest -- <slug>         # 記事に合う候補を確認
npm run image:assign -- <slug> --image <image-id>  # 割当

# ── STEP 5: 検証 ──
npm run image:check           # エラー 0・警告を確認
npm run validate:posts        # image ファイルの存在と image_alt を確認
npm run build                 # 表示崩れがないか確認

# ── STEP 6: commit ──
git add content/posts/<slug>.md data/image-library.json
git commit -m "chore: assign image to <slug>"
# push は Human が手動実行
```

### 画像の分類変更（`image:reclassify`）

インポート時に `general` に分類された画像を正しいカテゴリに移す:

```bash
# dry-run（確認のみ）
npm run image:reclassify -- <image-id> --category preventive

# 実行（ファイル移動 + JSON + 記事 frontmatter を更新）
npm run image:reclassify -- <image-id> --category preventive --apply

# alt も同時に上書きする場合
npm run image:reclassify -- <image-id> --category preventive --alt "実際の画像の説明" --apply
```

### 不足カテゴリの追加購入

`root-canal` / `periodontal` / `wisdom-tooth` の 3 カテゴリは画像が 0 件のため、  
記事公開時に preventive / cavity の画像で代替している。

購入候補・推奨キーワード・医療広告上の注意点: [docs/image-purchase-guide.md](docs/image-purchase-guide.md)

購入後は inbox に配置して `image:import-inbox` で取り込む。

### 画像運用ルール

| ルール | 詳細 |
|--------|------|
| 口腔内のリアル写真 | 患者が不快に感じる可能性があるため慎重に扱う |
| before/after 風画像 | 禁止（医療広告ガイドライン違反の恐れ） |
| 治療効果を保証する画像 | 禁止（例：完治した歯の比較写真） |
| `image_alt` | 必須。`image:assign` で自動設定されるが、内容を確認すること |
| ライセンス情報 | `image-library.json` の `license_source` / `license_note` に必ず記載。購入情報不明の場合は `TODO` と書いて後で埋める |
| AI 画像生成 | 補助扱い。医療情報の補足イラスト程度に留め、誤解を招く写実的な医療行為の描写は使わない |

---

## cron 設計（5G）— 設計案のみ・未実装

現段階では cron は実装しない（AGENTS.md 禁止）。将来 GitHub Actions で自動化する場合の設計案を記録する。

### 自動化候補コマンド

| コマンド | 推奨スケジュール | 用途 |
|---------|-----------------|------|
| `telegram:requests -- --apply` | 毎時 or 15分ごと | 新着リクエストを自動取得 |
| `notify:posting-reminder` | 月水金 9:00 JST | コンテンツ投稿確認リマインド |
| `notify:requests` | 毎日朝 8:30 JST | リクエスト状態サマリーを毎朝確認 |
| `notify:pending-review` | 毎日朝 8:30 JST | review待ち記事を毎朝確認 |
| `status:content` | 週1回（月曜） | 全体健康診断 |

### GitHub Actions 設定例（参考）

```yaml
# .github/workflows/telegram-requests.yml（未実装）
name: Fetch Telegram Requests
on:
  schedule:
    - cron: '0 * * * *'   # 毎時 (UTC)
jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run telegram:requests -- --apply
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: fetch telegram requests"
          file_pattern: data/article-requests.json
```

**注意:** cron 自動化を有効にする前に、以下を確認する:
- `git push` 権限の scope を明示的に制限する
- `approve:post` / `reject:post` / publish API の自動実行が混入しないこと
- `article:auto-review` は補助チェックであり、本文承認の代替にしないこと
- AGENTS.md の禁止事項を CI 側でも周知する

---

### 差し戻し済み記事の再提出

差し戻し済み（rejected）記事は削除ではなく**再検討キュー**として扱う。

```bash
# 再提出（pending-review に戻す）
npm run resubmit:post -- <slug> --reviewed-by "氏名" --reason "本文を修正して再提出"

# 再提出後は通常の approve フローへ
npm run approve:post -- <slug> --reviewed-by "氏名" --confirm-body-reviewed
```

- `rejection_reason` を削除することで pending-review に復帰する
- 元の差し戻し理由は `logs/review-history.md` に保持（append-only）
- 再提出後も `reviewed: false` のまま。本文確認後の Human approval までは公開しない

## generate:draft の使い方

AI（Claude）が記事本文を自動生成します。生成した記事は `reviewed: false` / `auto_approved: false` のドラフト扱いです。

### セットアップ

```bash
# .env.local.example をコピーして API キーを設定する
cp .env.local.example .env.local
# .env.local を開いて ANTHROPIC_API_KEY=sk-ant-... を記入
# .env.local は絶対に commit しないこと（.gitignore で除外済み）
```

### 実行例

```bash
# 記事ネタ CSV の整合性確認
npm run validate:topics

# 指定した topic_id の AI 下書きを生成
npm run generate:draft -- TOPIC-20260511-007

# 生成された下書きを確認・修正する
npm run validate:posts
npm run build
```

生成先: `content/posts/YYYY-MM-DD-topic-id.md`

注意:
- 生成記事は本文確認後の Human approval まで公開しないこと
- `article:auto-review` は補助チェックであり、本文承認の代替にしない
- 中・高リスク記事、blocker あり、画像ライセンス未確認の記事は Human review に回す
- `ANTHROPIC_API_KEY` が未設定の場合はエラーで終了します（API は呼びません）
- 同名ファイルが既に存在する場合は上書きせずエラー終了します

## research:trends の使い方

記事ネタの候補を dry-run で生成し、`data/research/` に JSON/CSV として保存します。外部APIは呼ばず、生成物は必ず人間がレビューしてから `data/article-topics.sample.csv` に手動で追記します。

```bash
# 候補ファイルを生成
npm run research:trends

# 出力された候補を確認
# data/research/YYYY-MM-DD-trends.json  ← 0〜4 のインデックスで候補を確認
# data/research/YYYY-MM-DD-trends.csv
```

レビュー手順:
1. `data/research/*.json` を開いて候補を確認する（candidates 配列のインデックスを控えておく）
2. 医療安全上問題のある候補は除外する
3. 採用する候補のインデックスを指定して CSV に追記する（または手動追記）
4. `npm run validate:topics` で追記内容を検証する

```bash
# 採用候補を --import <インデックス> で CSV に追記（Human 承認後に実行）
npm run research:trends -- --import 0   # candidates[0] を追記
npm run research:trends -- --import 2   # candidates[2] を追記

# 追記内容を確認
npm run validate:topics
```

`--import` の動作:
- 最新の `data/research/*-trends.json` から指定インデックスの候補を読み込む
- `title_candidate` が既に CSV に存在する場合は重複エラーで停止する
- `status` は常に `idea`（Human approval フローは変わらない）
- topic ID は `TOPIC-YYYYMMDD-NNN` 形式で自動採番される

フィールドのマッピング（topic DB へ採用する際の対応）:

| research 出力フィールド | topic DB フィールド | 備考 |
|------------------------|---------------------|------|
| `researched_at` | `discovered_at` | 調査日 → ネタ発見日として扱う |
| `title_candidate` | `title_candidate` | そのまま使用 |
| `target_keyword` | `target_keyword` | そのまま使用 |
| `source_type` の有効値 | `source_type` | `trend` / `news` / `seasonal` / `clinic` / `seo` / `patient_question` |

注意:
- 生成物はあくまで候補メモです — AI hallucination を前提に必ず人間が再確認してください
- `data/research/` は人間確認前の scratch 出力であり、`.gitignore` で除外済みです（調査履歴を git 管理する場合は除外設定を変更してください）

## import:topic の使い方

`data/article-topics.sample.csv` に承認済みの記事ネタが登録されている場合、以下のコマンドで `content/posts/` に下書きを生成します。

```bash
# 記事ネタ CSV の整合性確認
npm run validate:topics

# 指定した topic_id の下書きを生成
npm run import:topic -- TOPIC-20260511-007

# 生成された下書きを確認
npm run validate:posts
```

生成先: `content/posts/YYYY-MM-DD-topic-id.md`

テンプレートは category に応じて自動選択されます:
- 医療系カテゴリ（虫歯治療・根管治療など）→ 受診目安・原因・対応の構成
- お知らせ → お知らせ概要・対象・実施日・まとめの構成

注意:
- `title_candidate`・`target_keyword`・`patient_intent`・`publish_date` が空の場合はエラー終了します
- 同一 topic_id が CSV に複数行ある場合はデータ不整合としてエラー終了します
- 同名ファイルが既に存在する場合は上書きせずエラー終了します

## AI への作業指示（短縮形）

この repo の作業ルールは `CLAUDE.md` / `AGENTS.md` に集約されており、Claude Code はセッション開始時に自動参照する。  
毎回の作業指示に公開条件・禁止事項・完了報告形式を書く必要はない。

### 最小限の指示テンプレート

```
repo: ~/Desktop/aisoukai-media
目的: <やりたいこと1〜2行>
```

必要に応じて追記する:

```
計画してから実装   → 実装前に方針確認を求める
やること: ...      → 複数ステップがある場合に箇条書きで渡す
```

### よく使う短縮指示例

| 意図 | 指示例 |
|------|--------|
| 状態確認 | `repo:... / status:content の結果を見せて` |
| 記事を1件 approve | `repo:... / <slug> を approve --reviewed-by "三谷"` |
| 記事生成（下書きのみ） | `repo:... / 「〇〇」について予防歯科カテゴリの記事を下書き生成` |
| build 確認 | `repo:... / validate:posts → build して結果を報告` |
| Telegram 送信 | `repo:... / notify:pending-review を実行` |

AGENTS.md の禁止事項（自動approve・明示依頼のない push 等）は明示しなくても常に適用される。
