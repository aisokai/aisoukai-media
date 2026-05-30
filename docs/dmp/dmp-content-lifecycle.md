# DMP コンテンツライフサイクル

> 共通ルールは [../../CLAUDE.md](../../CLAUDE.md) / [../../AGENTS.md](../../AGENTS.md) を正本とする。
> Human Gate・自動公開禁止は絶対ルール。

---

## 共通ステージ定義

すべてのチャンネル（Blog / SNS / Website / YouTube）は以下のステージを通る。

```
idea
  │  調査部がキーワード・患者ニーズを収集
  ▼
research
  │  Human レビュー → 採用 or 却下
  ▼
draft
  │  ブログ部・SNS部・YouTube部 etc. がドラフトを生成
  ▼
review                  ← [GATE] 医療広告表現リスクチェック（レビュー部）
  │  問題なし → 次へ / 問題あり → draft に差し戻し
  ▼
approval_waiting        ← [GATE] Human 承認待ち
  │  Human が approve or reject
  ▼
approved
  │  Human が手動 build / 手動投稿 を実施
  ▼
published_manually      ← 公開済み（手動操作のみ）
  または
archived                ← 不採用・保留の最終状態
```

---

## ステージ別ルール

| ステージ | AI実行可否 | Human操作 | 主担当部門 |
|---------|-----------|-----------|-----------|
| `idea` | ✅ AI 生成可 | 任意で追加・削除 | 編集長 / 調査部 |
| `research` | ✅ AI 調査可 | 候補の承認・却下 | 調査部 |
| `draft` | ✅ AI 下書き生成可 | 任意で本文修正 | ブログ部 / SNS部 / etc. |
| `review` | ✅ AI リスク評価可 | 評価結果を確認 | レビュー部 |
| `approval_waiting` | ❌ AI 操作禁止 | approve / reject を明示実行 | Human |
| `approved` | ❌ AI 操作禁止 | build / publish を明示実行 | Human |
| `published_manually` | ❌ AI 操作禁止 | 必要に応じて更新 | Human |
| `archived` | ✅ AI がアーカイブ提案可 | 最終承認は Human | Human |

---

## チャンネル別ライフサイクル

### Blog（実装済み）

```
idea → research（npm run research:trends）
  → draft（npm run generate:draft / article:manual）
  → review（validate:publish-ready / 手動確認）
  → approval_waiting（list:pending-review で確認）
  → approved（npm run approve:post -- <slug> --reviewed-by "氏名"）
  → published（npm run build → Human が git push）
```

関連ファイル:
- `content/posts/*.md` — 記事本文
- `data/article-topics.sample.csv` — 記事ネタDB
- `data/article-requests.json` — Telegram リクエスト

### SNS — Instagram / X / LINE（Phase 2 以降）

```
idea → research
  → draft（data/dmp/sns-drafts/YYYY-MM-DD-<channel>-<slug>.md）
  → review（医療広告チェック）
  → approval_waiting
  → approved（Human がドラフトをコピー）
  → published_manually（各プラットフォームで Human が手動投稿）
```

制約:
- Meta Graph API / Twitter API による自動投稿は禁止
- LINE公式アカウントへの自動配信は禁止
- ドラフト生成のみ AI が担当

### Website — LP・サービスページ（Phase 3 以降）

```
idea → draft（テキストドラフト Markdown）
  → review（医療広告チェック + SEO確認）
  → approval_waiting
  → approved
  → published_manually（Human が CMS または PR でデプロイ）
```

### YouTube（Phase 4 以降）

```
idea → research（検索需要・競合調査）
  → draft（data/dmp/youtube-scripts/YYYY-MM-DD-<slug>.md）
  → review（医療情報正確性チェック）
  → approval_waiting
  → approved（Human がスクリプトを確認）
  → published_manually（Human が撮影・編集・YouTube Studio で投稿）
```

---

## コンテンツキュー

コンテンツキューのサンプルスキーマは `data/dmp/dmp-content-queue.example.yaml` を参照。

### status フィールドの意味

| status | 説明 | 次のアクション |
|--------|------|--------------|
| `idea` | アイデア段階 | 調査 or 却下 |
| `research` | 調査中 | Human がレビュー・採用判断 |
| `draft` | AI下書き生成済み | 本文確認 → review |
| `review` | 医療広告チェック中 | PASS → approval_waiting / FAIL → draft差し戻し |
| `approval_waiting` | Human承認待ち | approve or reject |
| `approved` | 承認済み | 手動 build / 手動投稿 |
| `published` | 公開済み | 必要に応じて更新 |
| `rejected` | 差し戻し | 修正後に resubmit |
| `archived` | 最終状態 | なし（データ保持） |

---

## 医療広告チェックリスト（レビュー部 必須）

すべてのコンテンツは公開前に以下をチェックする。

- [ ] 断定的表現（「必ず治る」「完全予防」）が含まれていないか
- [ ] 過度な不安煽り表現が含まれていないか
- [ ] 根拠のない比較・誇大表現が含まれていないか
- [ ] before/after 効果保証描写が含まれていないか
- [ ] 患者個人を特定できる情報が含まれていないか
- [ ] 保険外診療の費用表示に問題がないか（記載がある場合）
- [ ] 医師法・医療法・薬機法上の問題がないか

---

*最終更新: 2026-05-31*
