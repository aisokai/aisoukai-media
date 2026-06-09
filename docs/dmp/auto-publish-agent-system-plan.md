# DMP 自動公開エージェント運用計画

最終更新: 2026-06-09

この文書は、aisoukai-media のブログ記事を定期的に自動生成し、条件を満たす記事だけを自動掲載するための運用計画です。医療広告ガイドラインを軽視するための変更ではなく、毎記事の Human review を、事前承認された自動公開ポリシー、機械チェック、監査ログ、停止条件に置き換えるための設計です。

厚生労働省「医療法における病院等の広告規制について」を医療広告ルールの正本として扱います。
https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/kokokukisei/index_00003.html

## 基本方針

- 無条件の自動公開は禁止する。
- `medical_risk: low` の記事だけを自動承認候補にする。
- `medical_risk: medium` / `high`、リーガル blocker、出典不足、画像ライセンス不明、ビルド失敗は自動公開を止める。
- Human 承認記事は `reviewed: true`、自動承認記事は `auto_approved: true` として区別する。
- すべての自動承認判断を `logs/auto-publish-history.md` と `data/auto-publish-reviews/*.json` に残す。
- Telegram は通知とダイジェストに使う。Telegram からの approve / publish は引き続き禁止する。
- `git push` は原則 Human の明示依頼がある場合のみ実行する。

## エージェント構成

### 1. ネタ収集エージェント

患者 FAQ、季節性、既存カテゴリ、記事ネタ CSV、過去記事の不足領域から候補を作ります。

出力:

- `data/research/YYYY-MM-DD-trends.json`
- `data/article-topics.sample.csv`

必須項目:

- `topic`
- `title_candidate`
- `category`
- `target_keyword`
- `patient_intent`
- `priority`
- `medical_risk`
- `publish_date`

### 2. ネタ採用・重複チェックエージェント

既存記事、記事ネタ CSV、同一検索意図を確認します。タイトル完全一致だけでなく、同じ悩みに答える記事が近い時期に重ならないかを見ます。

自動採用条件:

- `status: approved`
- `medical_risk: low`
- 既存記事と `source_topic_id` が重複しない
- タイトルが既存記事と一致しない

### 3. 記事執筆エージェント

採用済みネタから Markdown 記事を生成します。

frontmatter に追加する項目:

- `ai_generated: true`
- `source_topic_id`
- `medical_risk`
- `review_mode: auto`
- `auto_approved: false`
- `legal_check_status: pending`
- `image_check_status: pending`
- `publication_status: draft`

### 4. 医療・リーガルチェックエージェント

公開前に、医療広告上のリスク表現を機械チェックします。

blocker 例:

- 必ず
- 絶対
- 完全に治る
- 100%
- No.1 / ナンバーワン
- 日本一
- 最安
- 他院より
- 痛くない
- 副作用なし
- 体験談風表現
- before / after 訴求

blocker が 1 件でもあれば自動承認しません。

### 5. 画像選定エージェント

初期実装では外部画像生成 API を追加しません。既存の `data/image-library.json` から記事に合う画像を選びます。

自動割当条件:

- 画像ファイルが `public/` に存在する
- `image_alt` がある
- `license_note` に `TODO` が残っていない

条件を満たす画像がない場合、記事自体は保留します。

### 6. 編集・SEO整形エージェント

タイトル、excerpt、見出し、タグ、内部リンク候補を整えます。初期実装では既存の `generate-draft` と `validate:posts` を使い、専用のリライト API は追加しません。

### 7. 最終ゲート・公開エージェント

各チェック結果を集約し、条件を満たす場合だけ frontmatter を更新します。

自動公開対象:

- `auto_approved: true`
- `publication_status: auto_approved`
- `legal_check_status: passed`
- `image_check_status: passed`
- `medical_risk: low`
- `draft !== true`
- `publish_at <= 今日`

Human 承認対象:

- `reviewed: true`
- `publication_status: human_approved`

## 停止条件

次のいずれかに該当したら自動公開を止め、pending review に残します。

- `medical_risk` が `low` ではない
- blocker が 1 件以上ある
- `title` / `excerpt` / `category` / `author` / `tags` / `date` が不足
- 画像が未設定、またはライセンス情報が未確認
- `npm run validate:posts` が失敗
- `npm run build` が失敗
- 既存記事と topic ID が重複する

## 段階導入

### Phase 0: ルール変更

AGENTS.md、CLAUDE.md、README、DMP 文書を、条件付き自動公開を許可する内容に更新します。

### Phase 1: 自動レビュー

`scripts/auto-review-post.mjs` を追加し、既存記事に対して自動公開可否を判定します。

### Phase 2: 定期フロー接続

`article:scheduled` に `--auto-publish` を追加します。下書き生成後、低リスク記事だけ自動承認します。

### Phase 3: 本番スケジュール

GitHub Actions または Vercel Cron で定期実行します。push / deploy は別途 Human の明示承認後に設定します。

### Phase 4: 週次監査

公開済み記事を再チェックします。ガイドライン変更、古い情報、画像ライセンス、重複を監査します。
