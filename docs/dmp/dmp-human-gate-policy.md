# DMP Human Gate ポリシー

> 共通ルールは [../../CLAUDE.md](../../CLAUDE.md) / [../../AGENTS.md](../../AGENTS.md) を正本とする。
> このドキュメントは DMP 固有のゲートポリシーを定義する。

---

## 絶対ルール（変更禁止）

以下は DMP のどのフェーズ・どのチャンネルにおいても変更してはならない。

| ルール | 根拠 |
|-------|------|
| AI が `reviewed: true` を書き換えることは禁止 | AGENTS.md・ai-editorial-operations-plan.md |
| AI による自動公開は禁止 | AGENTS.md |
| AI による `publish_at` の過去日付操作は禁止 | AGENTS.md |
| `reviewed: false` の記事はビルドに含まれない | 実装レベルで保証済み |
| approve 操作は Human が CLI または明示的 UI 操作でのみ実行 | AGENTS.md |
| git push は Human が手動実行 | AGENTS.md・CLAUDE.md |
| 外部 API（Meta/YouTube/LINE）への自動投稿は禁止 | AGENTS.md |

---

## チャンネル別 Human Gate

### Blog

| 操作 | 実行者 | コマンド |
|------|-------|---------|
| 承認 | Human のみ | `npm run approve:post -- <slug> --reviewed-by "氏名"` |
| 差し戻し | Human のみ | `npm run reject:post -- <slug>` |
| ビルド | Human のみ | `npm run build` |
| デプロイ | Human のみ | `git push origin main` |
| 再提出 | Human のみ | `npm run resubmit:post -- <slug> --reviewed-by "氏名" --reason "理由"` |

### SNS（Phase 2 以降）

| 操作 | 実行者 | 方法 |
|------|-------|------|
| ドラフト確認 | Human | ドラフトファイルを直接確認 |
| 投稿 | Human のみ | 各プラットフォームで手動コピー&ペースト投稿 |
| Meta Graph API 投稿 | **禁止** | — |
| Twitter API 投稿 | **禁止** | — |
| LINE 公式アカウント自動配信 | **禁止** | — |

### Website（Phase 3 以降）

| 操作 | 実行者 | 方法 |
|------|-------|------|
| テキスト確認 | Human | ドラフトファイルを直接確認 |
| CMS 更新 | Human のみ | CMS 管理画面で手動適用 |
| デプロイ | Human のみ | `git push` または CMS デプロイボタン |

### YouTube（Phase 4 以降）

| 操作 | 実行者 | 方法 |
|------|-------|------|
| スクリプト確認 | Human | スクリプトファイルを直接確認 |
| 動画撮影・編集 | Human のみ | — |
| YouTube Studio 投稿 | Human のみ | YouTube Studio で手動アップロード |
| YouTube Data API 自動アップロード | **禁止** | — |

---

## AI が実行してよい操作

| 操作 | 条件 |
|------|------|
| 記事ドラフト生成（`reviewed: false`） | API キーが設定済み |
| 調査候補 JSON/CSV 生成（dry-run） | 外部 API 不使用 |
| Telegram 通知送信 | `TELEGRAM_BOT_TOKEN` 設定済み |
| 医療広告リスク評価レポート生成 | dry-run のみ |
| SNS 投稿ドラフト Markdown 生成 | ファイル出力のみ |
| YouTube スクリプト Markdown 生成 | ファイル出力のみ |
| コンテンツキュー YAML 更新 | `reviewed` / `approved` フラグ変更禁止 |
| git commit（docs/data のみの変更） | push は Human のみ |

---

## 自動化してはいけないこと（現フェーズ）

以下はいかなる理由があっても現フェーズで自動化しない。

- Instagram / Meta Graph API による自動投稿
- YouTube Data API による自動アップロード
- LINE 公式アカウントへの自動配信
- X（Twitter）API による自動投稿
- `approve:post` / `reject:post` の AI 自動実行
- `git push` の AI 実行
- `firebase deploy` / `vercel deploy` の AI 実行
- 承認ステータス（`reviewed`）の AI 書き換え
- 公開日時（`publish_at`）の AI による過去日付設定

---

## ゲート強化が必要な将来ケース

将来チャンネルを追加する際は、以下を必ず確認・更新する。

1. 新チャンネルの Human Gate 手順をこのドキュメントに追記する
2. AGENTS.md の絶対禁止リストを新チャンネルにも適用することを確認する
3. 外部 API 連携が必要な場合は、OAuth・シークレット管理を `.env.local` に限定する
4. 自動投稿フロー実装前に Human 明示承認を得る

---

*最終更新: 2026-05-31*
