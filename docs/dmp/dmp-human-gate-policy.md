# DMP Human Gate ポリシー

> 共通ルールは [../../CLAUDE.md](../../CLAUDE.md) / [../../AGENTS.md](../../AGENTS.md) を正本とする。
> このドキュメントは DMP 固有のゲートポリシーを定義する。

---

## 絶対ルール

以下は DMP のどのフェーズ・どのチャンネルでも守る。

| ルール | 根拠 |
|-------|------|
| AI が `reviewed: true` を書き換えることは禁止 | AGENTS.md・ai-editorial-operations-plan.md |
| AI の自動承認は `auto_approved: true` として Human 承認と区別する | AGENTS.md・auto-publish-agent-system-plan.md |
| Auto Publish Policy を満たさない自動公開は禁止 | AGENTS.md・auto-publish-agent-system-plan.md |
| AI による `publish_at` の過去日付操作は禁止 | AGENTS.md |
| `reviewed: true` または `auto_approved: true` 以外の記事はビルドに含まれない | 実装レベルで保証 |
| 承認済みでも `publish_at` または `date` が未来の場合は即時公開しない | dmp-content-lifecycle.md |
| approve 操作は Human が CLI または明示的 UI 操作でのみ実行 | AGENTS.md |
| git push は Human が手動実行 | AGENTS.md・CLAUDE.md |
| SNS（Instagram / Facebook / X / Threads）への投稿は、AGENTS.md の `sns-mutual-review-20261106` 節に定める AI 相互監視・レビュー証拠・対象 flags ON の条件をすべて満たす場合に限り、Muse が実行できる | AGENTS.md（2026-11-06 明示変更） |
| YouTube / LINE への自動投稿は禁止 | AGENTS.md |

---

## チャンネル別 Human Gate

### Blog

| 操作 | 実行者 | コマンド |
|------|-------|---------|
| 承認 | Human のみ | `npm run approve:post -- <slug> --reviewed-by "氏名"` |
| 差し戻し | Human のみ | `npm run reject:post -- <slug>` |
| 自動承認 | Auto Publish Agent | `npm run article:auto-review -- <slug>` |
| ビルド | Human のみ | `npm run build` |
| デプロイ | Human のみ | `git push origin main` |
| 再提出 | Human のみ | `npm run resubmit:post -- <slug> --reviewed-by "氏名" --reason "理由"` |

### SNS（Phase 2 以降）

2026-11-06 の明示変更により、SNS は AGENTS.md の `sns-mutual-review-20261106` 節を正本として運用する。対象は医療法人藍想会の公式アカウントと Instagram / Facebook / X / Threads のみであり、治理文書の反映だけで未実装のドラフト規格・`publish_mode`・チャンネル機能が利用可能になるわけではない。

| 操作 | 実行者 | 方法 |
|------|-------|------|
| ドラフト作成 | 作成AI（初期値: Claude 系統） | repo の SNS ドラフト規格に沿って作成し、例外カテゴリ（患者特定・個別相談・クレーム対応）に当たらないか自己点検する |
| レビュー | レビューAI（初期値: ChatGPT 系統） | 作成とは別の実際の実行 identity が最終コンテンツをチェックする。作成AI自身によるレビューで代替しない |
| レビュー証拠の記録 | レビューAI / Muse | 対象コンテンツの hash、作成 identity、レビュー identity、チェック結果、判定、日時、policy version を結び付けて append-only で記録する |
| 投稿 | Muse | レビュー通過、投稿直前の hash 一致、対象 flags が先生の操作で ON、対象チャンネルの実装完了をすべて満たす場合だけ実行する。結果を監査ログへ記録する |
| 例外カテゴリ | Human | 患者が特定され得る内容、個別の症状・治療相談への対応、クレーム・苦情への対応は投稿前に先生へエスカレーションする |
| 投稿後巡回 | Muse | 投稿直後と1日1回、コメント・メンション・プラットフォーム通知を確認し、結果を定期報告へ含める |
| 削除・修正 | Muse / Human | 実行経路はブラウザ経由。Muse が即時削除できるのは明らかな誤投稿または医療広告ガイドライン抵触に限る。それ以外は先生へ確認する |
| お知らせ投稿 | Human Gate（当面） | 臨時休診・診療時間変更は通常投稿とは別 flags で制御する。お知らせ用 flags の初期値は OFF とし、当面は自動化しない |
| LINE 公式アカウント自動配信 | **禁止** | 本変更の対象外 |

### GMB口コミ返信（2026-11-06 新設）

Google 口コミへの返信は、取得・監視・下書き生成と、返信送信を分けて扱う。送信は常に human gate とし、`config/media-gate.json` の gate と flag_bindings による二重ロックを維持する。

| 操作 | 実行者 | 方法 |
|------|-------|------|
| 取得・監視 | 既存 watcher（自動） | 実口コミを取得し、未返信分を検出する |
| 分類・下書き | 既存システム / Muse | 返信案を自動生成する。低評価・クレーム性の口コミは承認提示時に優先的かつ明示的に分かるよう印を付ける |
| 承認提示 | Muse | Muse とのチャットで、対象口コミの概要（評価・要点）、返信案の全文、対象拠点を提示する。患者個人を特定する情報の扱いは最小限とする |
| 承認・却下 | Human | ユーザーが承認／修正指示／却下を行う。承認されていない返信は、テンプレート定型文であっても送信しない |
| 承認の記録 | Human | `npm run media:approve -- <mj-id> --by "氏名"` で queue item を承認する。チャット上の承認だけでは外部送信しない |
| 実行 | Human | `npm run media:gmb:apply -- <mj-id>` で dry-run を確認し、Human が `npm run media:gmb:apply -- <mj-id> --apply --by "氏名"` を明示実行する。対象は承認済み queue item のみ |
| 記録・報告 | Muse | 送信済み・承認待ち・却下の状態を台帳に残し、承認待ちの滞留は定期報告で知らせる |
| 緊急時の通知 | Muse | 健康被害の申告等、緊急性の高い口コミは下書き提示を待たず即時に先生へ知らせる |

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
| low risk 記事の自動承認（`auto_approved: true`） | Auto Publish Policy を全通過 |
| 調査候補 JSON/CSV 生成（dry-run） | 外部 API 不使用 |
| Telegram 通知送信 | `TELEGRAM_BOT_TOKEN` 設定済み |
| 医療広告リスク評価レポート生成 | dry-run のみ |
| SNS 投稿ドラフト Markdown 生成 | ファイル出力のみ。作成時の例外カテゴリ自己点検を含む |
| SNSレビュー証拠・監査ログの記録 | 作成とは別系統のレビュー完了後、対象 hash に結び付けて append-only で記録する |
| SNS投稿の実行 | Muse が、AGENTS.md の `sns-mutual-review-20261106` 節の全条件を満たす場合に限る |
| GMB口コミの取得・分類・返信案の下書き生成 | 外部送信を行わない範囲で自動可 |
| YouTube スクリプト Markdown 生成 | ファイル出力のみ |
| コンテンツキュー YAML 更新 | `reviewed` / `approved` フラグ変更禁止 |
| git commit（docs/data のみの変更） | push は Human のみ |

---

## 自動化してはいけないこと（現フェーズ）

以下はいかなる理由があっても現フェーズで自動化しない。

- AI 相互監視を通過していない SNS 投稿、レビュー証拠がない SNS 投稿、投稿直前の hash が証拠と一致しない SNS 投稿
- 対象 flags が OFF の SNS 投稿、および患者特定・個別相談・クレーム対応に当たる SNS 投稿の自動実行
- GMB口コミ返信の AI 自動送信、ならびに `review_reply.gmb` の gate と flag_bindings による human gate の二重ロックを緩める変更
- YouTube Data API による自動アップロード
- LINE 公式アカウントへの自動配信
- `approve:post` / `reject:post` の AI 自動実行
- `git push` の AI 実行
- `firebase deploy` / `vercel deploy` の AI 実行
- Human 承認ステータス（`reviewed`）の AI 書き換え
- 公開日時（`publish_at`）の AI による過去日付設定

---

## ゲート強化が必要な将来ケース

将来チャンネルを追加する際は、以下を必ず確認・更新する。

1. 新チャンネルの Human Gate 手順をこのドキュメントに追記する
2. AGENTS.md の絶対禁止リストを新チャンネルにも適用することを確認する
3. 外部 API 連携が必要な場合は、OAuth・シークレット管理を `.env.local` に限定する
4. 自動投稿フロー実装前に Human 明示承認を得る

---

*最終更新: 2026-11-06*
