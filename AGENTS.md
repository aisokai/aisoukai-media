<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:aisoukai-media-rules -->
# aisoukai-media 共通ルール

このファイルは Claude Code / Codex / その他 AI エージェントが作業前に読む共通ルール集。
毎回の指示文にこれらを繰り返す必要はない。

---

## 基本方針

- この repo は医療法人藍想会の公開メディア運用 repo
- 医療広告ガイドライン（厚生労働省）を重視し、医療効果の断定表現は禁止
- 公開記事は Human review を必須とする（AI 自動承認はシステム上も禁止）
- 管理画面は裏方用であり、UI polish より安全性と運用性を優先する

---

## 絶対禁止

| 禁止事項 | 理由 |
|---------|------|
| AI 自動 approve | 医療広告ガイドライン・品質保証 |
| 自動 publish | Human review バイパスになるため |
| `reviewed: false` の記事を公開ルートに到達させる | Approval Gate の破綻 |
| Telegram からの approve / publish | 誤操作・なりすましリスク |
| approve API / publish API の実装 | 意図しない自動化の入口になるため |
| cron 完全自動化（現段階） | 運用フローが未成熟なため |
| `git push` | push は人間が手動実行する |

---

## 公開条件（Approval Gate）

以下をすべて満たす記事のみが公開対象。`src/lib/posts.ts` の `isPublishReady()` が判定する。

1. `reviewed: true`
2. `draft: true` でない
3. `publish_at`（設定時）または `date` が今日以前

この条件は以下のすべてに等しく適用する:

- `getAllPosts()` → blog 一覧・トップページ
- `getPostBySlug()` → blog 詳細ページ
- `sitemap.ts` → XML sitemap
- `category/[slug]/page.tsx` → カテゴリページ
- metadata / OGP → 各ページ

rejected 記事（`rejection_reason` あり）は `reviewed: true` にならないため自動除外。
admin 配下のページはすべて `noindex` とし、`robots.txt` でも `/admin/` を disallow。

---

## review 運用

- approve / reject は CLI コマンドで実行（`npm run approve:post` / `npm run reject:post`）
- 管理画面 `/admin/pending-review` はコマンド文字列のコピーまでが役割
- review history（`logs/review-log.jsonl`）は append-only で変更しない
- 誰が・いつ・何を approve/reject したかを必ず記録する

---

## Telegram 通知

- 通知は digest 優先（件数が多い場合は要約）
- 通知から approve / publish を行わない
- Telegram は「確認のトリガー」であり「承認手段」ではない

---

## 作業完了時の報告

作業完了時は必ず以下を報告する:

```
- 変更ファイル（パスと変更概要）
- 実行した検証コマンドと結果
- npm run build の結果
- commit hash
- git status --short --branch
```

---

## 検証コマンド（標準セット）

```bash
npm run validate:posts          # frontmatter 構造チェック（全記事）
npm run validate:publish-ready  # 公開条件チェック（reviewed/date/draft）
npm run build                   # 型チェック + 静的ページ生成
```

`validate:publish-ready` が exit 1 でも、公開記事 0 件は正常（未来日付記事が全件の場合）。

<!-- END:aisoukai-media-rules -->
