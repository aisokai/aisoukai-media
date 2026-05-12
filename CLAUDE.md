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
<!-- END:claude-code-supplement -->
