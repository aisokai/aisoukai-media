# 記事ネタDB スキーマ仕様

最終更新: 2026-05-11

記事ネタDB は、AI が収集した記事候補を企画・進行管理するための正本です。  
公開済みの記事本文の正本は `content/posts/*.md`、記事ネタDB の正本は Google スプレッドシート相当の CSV 管理です。

## 運用方針

- 初期段階では Google Sheets API 連携は行わない
- スプレッドシートから CSV をエクスポートするか、CSV を貼り付けて運用する
- 企画の集約、承認、下書き化、公開管理は記事ネタDB で行う
- 公開記事の本文は `content/posts/*.md` を参照する

## CSV 仕様

### 列順

`id,discovered_at,source_type,source_url,topic,title_candidate,category,target_keyword,patient_intent,priority,medical_risk,status,publish_date,notes`

### 列の意味

| 列 | 必須 | 説明 |
|---|---|---|
| `id` | ✅ | 一意の管理 ID。英数字と `-` / `_` を推奨 |
| `discovered_at` | ✅ | ネタを見つけた日付。`YYYY-MM-DD` |
| `source_type` | ✅ | 収集元の種別 |
| `source_url` | 任意 | 元 URL。無い場合は空欄可 |
| `topic` | ✅ | 記事ネタの中心テーマ |
| `title_candidate` | ✅ | 記事タイトルの候補 |
| `category` | ✅ | 許可カテゴリのいずれか |
| `target_keyword` | ✅ | 検索を狙う主キーワード |
| `patient_intent` | ✅ | 患者が知りたいことの要約 |
| `priority` | ✅ | `high` / `medium` / `low` |
| `medical_risk` | ✅ | `high` / `medium` / `low` |
| `status` | ✅ | `idea` / `approved` / `drafting` / `reviewed` / `published` / `hold` |
| `publish_date` | ✅ | 公開予定日または公開日。`YYYY-MM-DD` |
| `notes` | 任意 | 補足メモ |

## 許可値

### category

- 虫歯治療
- 根管治療
- 歯周病治療
- 予防歯科
- 小児歯科
- 親知らず
- インプラント
- その他
- お知らせ

### source_type

- trend
- news
- seasonal
- clinic
- seo
- patient_question

### status

- idea
- approved
- drafting
- reviewed
- published
- hold

### priority

- high
- medium
- low

### medical_risk

- high
- medium
- low

## 運用ルール

1. 新しい記事候補はまず `idea` で登録する
2. 医療リスクの高いネタは `medical_risk: high` にし、承認を明示する
3. `approved` 以降は記事下書き化の対象にする
4. `drafting` は本文作成中、`reviewed` はレビュー完了、`published` は公開済みを示す
5. `hold` は一時停止・保留の状態として扱う
6. 1 行 1 ネタで管理し、同一 `id` は再利用しない

## AI 連携の考え方

- AI は記事ネタDBを参照して、優先度の高い候補から下書き案を作る
- AI は公開本文を直接正本化せず、まず記事ネタDB の status を進める
- 将来的に Sheets API を追加する場合でも、この CSV スキーマを正本として維持する

