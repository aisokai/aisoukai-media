@AGENTS.md

<!-- BEGIN:claude-code-supplement -->
# Claude Code 補足

共通ルールは上記 `@AGENTS.md` を参照。
以下は Claude Code 固有の補足のみ記載する。

## 実装前の確認

- 計画を示してから実装を開始する（`superpowers:writing-plans` 活用）
- 公開条件・絶対禁止リストは AGENTS.md を確認する

## コーディング制約

- API キー・シークレットをコードに含めない
- 医療効果の断定表現を生成しない（「必ず治る」「完全予防できる」等）
- HTML の直接挿入には `remark-html` の `sanitize: true` で処理済みコンテンツのみ使用する

## モデル選択

- 通常作業: デフォルト（Sonnet）
- 多ファイル因果追跡・設計判断: 上位モデルに切り替え

## DMP AI編集部 ショートカット指示

DMP = Dental Media Project。以下の短縮形でタスクを指示できる。

| 指示形式 | 意味 | 実行コマンド |
|---------|------|------------|
| `dmp:blog <テーマ>` | ブログ記事を依頼 | article:manual または generate:draft |
| `dmp:research` | 記事候補調査 | research:trends |
| `dmp:status` | コンテンツ状態確認 | status:content |
| `dmp:pending` | 承認待ち一覧 | list:pending-review |
| `dmp:review <slug>` | 医療広告リスクチェック | validate:publish-ready + 手動確認 |

**SNS / Website / YouTube 指示（Phase 2〜4 以降）**:
- `dmp:sns <テーマ>` — SNS投稿ドラフトを依頼（Phase 2 で実装予定）
- `dmp:youtube <テーマ>` — YouTubeスクリプトを依頼（Phase 4 で実装予定）

詳細は `docs/dmp/` を参照。
<!-- END:claude-code-supplement -->
