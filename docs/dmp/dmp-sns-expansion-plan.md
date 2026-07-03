# DMP SNS横展開プラン

> ブログ自動更新システムを雛形に、Instagram / X / LINE へ展開するための実装計画。

---

## 目的

DMPブログで完成した次の仕組みを、SNS運用にも使えるようにする。

- 定期的なネタ生成
- AIによるドラフト作成
- 画像・表現の補助チェック
- review待ちキュー
- Telegram通知
- Human Gate
- 手動公開を前提とした監査ログ

SNSでは外部APIによる自動投稿は行わない。
最初の完成形は「投稿担当者がそのままコピーして使える投稿パッケージ」を作ること。

---

## Phase 2A: Instagramドラフト生成

### 生成物

`content/sns-drafts/YYYY-MM-DD-instagram-<topic-id>.md`

```yaml
---
channel: instagram
platform: instagram
title: "投稿管理用タイトル"
date: "2026-06-15"
status: pending_review
reviewed: false
approved_for_manual_post: false
ai_generated: true
medical_risk: low
source_topic_id: SNS-202606-001
publish_mode: manual_only
image_direction: "清潔感のある歯ブラシと洗面台"
---
```

本文構成:

```markdown
## 投稿目的

## 1枚投稿案

## カルーセル構成

1. 表紙
2. 課題
3. 原因
4. セルフケア
5. 受診目安
6. 藍想会からの案内

## キャプション

## ハッシュタグ

## 医療広告チェックメモ

## 手動投稿チェックリスト
```

### 初期コマンド案

| コマンド | 役割 |
|---------|------|
| `npm run sns:instagram:draft -- <topic-id>` | Instagram下書きを生成 |
| `npm run sns:list-pending-review` | SNS review待ち一覧 |
| `npm run sns:notify-pending-review` | SNS review待ちをTelegram通知 |
| `npm run sns:approve -- <slug> --reviewed-by "氏名"` | 手動投稿可として承認 |
| `npm run sns:reject -- <slug> --reason "理由"` | 差し戻し |

### 実装状況 (2026-07-03)

| コマンド | 状態 |
|---------|------|
| `npm run sns:instagram:draft -- --topic <topic-id>` | 実装済み (`scripts/generate-instagram-draft.mjs`) |
| `npm run sns:list-pending-review` | 実装済み |
| `npm run sns:notify-pending-review` | 実装済み (`scripts/notify-sns-pending-review.mjs`) |
| `npm run sns:approve -- <slug> --reviewed-by "氏名"` | 実装済み (Human 専用, `scripts/approve-sns-draft.mjs`) |
| `npm run sns:reject -- <slug> --reviewed-by "氏名" --reason "理由"` | 実装済み (Human 専用) |
| `npm run media:sns:from-post` (Phase 2B) | 実装済み (`scripts/generate-sns-from-post.mjs`) |
| `ops:sns-weekly` / `ops:sns-daily-status` (Phase 2C) | 未実装 |

---

## Phase 2B: ブログ記事からSNSへの再編集

公開済みブログ記事をSNS用に再編集する。

入力:

- `content/posts/*.md`
- 記事タイトル
- category / tags
- description
- 本文
- image / image_alt

出力:

- Instagram用キャプション
- Instagramカルーセル案
- X用短文投稿
- LINE配信用短文

候補コマンド:

| コマンド | 役割 |
|---------|------|
| `npm run sns:from-post -- <blog-slug> --platform instagram` | ブログからInstagram案を生成 |
| `npm run sns:from-post -- <blog-slug> --platform x` | ブログからX案を生成 |
| `npm run sns:from-post -- <blog-slug> --platform line` | ブログからLINE案を生成 |

---

## Phase 2C: SNS定期運用

ブログの `ops:mwf` と同じ考え方で、SNSの定期運用を追加する。

候補コマンド:

| コマンド | 頻度 | 役割 |
|---------|------|------|
| `npm run ops:sns-weekly` | 週1回 | 今週分のSNSドラフトを生成・通知 |
| `npm run ops:sns-daily-status` | 毎日 | review待ち・投稿待ちを通知 |

定期実行はMac miniで行う。
ただし投稿そのものはHumanがInstagramアプリ、X、LINE公式アカウント管理画面で手動実行する。

---

## Phase 2D: 管理画面への統合

ブログの `/admin/pending-review` と同じ承認導線をSNSにも拡張する。

必要な画面:

| 画面 | 内容 |
|------|------|
| `/admin/sns` | SNSドラフト一覧 |
| `/admin/sns/[slug]` | 投稿本文・画像案・チェック項目 |
| `/admin/sns/calendar` | 投稿予定カレンダー |

初期実装ではCLIとMarkdownで十分。
運用が安定してから管理画面に統合する。

---

## 医療広告・SNS固有の注意点

SNSは短文で誤解が起きやすいため、ブログよりも表現を抑える。

禁止:

- 「必ず改善」
- 「誰でも白くなる」
- 「放置すると必ず悪化」
- before/afterで効果保証に見える表現
- 治療結果を保証するハッシュタグ
- 不安を煽って受診を促す表現

推奨:

- 「気になる場合は相談」
- 「状態により異なります」
- 「セルフケアと定期チェックが大切」
- 「診断・治療方針は個別に確認」

---

## 最初に作るべきもの

1. `content/sns-drafts/` のドラフト置き場
2. SNSドラフトschema
3. Instagram投稿生成prompt
4. `sns:from-post` コマンド
5. `sns:list-pending-review` コマンド
6. Telegram通知

この順序なら、既存ブログ記事をすぐSNS素材に変換でき、運用価値が出る。

