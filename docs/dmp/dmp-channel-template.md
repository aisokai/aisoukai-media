# DMP チャンネル横展開テンプレート

> DMP ブログ自動更新システムを、Instagram / X / LINE / YouTube / Website へ横展開するための共通雛形。
> Human Gate・自動公開禁止・AI自動承認禁止は [dmp-human-gate-policy.md](./dmp-human-gate-policy.md) を正本とする。

---

## 基本思想

DMP の各チャンネルは、媒体ごとの差分を持ちながらも、同じ運用骨格で管理する。

```
ネタ候補
  -> AI下書き生成
  -> 素材・表現チェック
  -> review待ち
  -> Telegram通知
  -> Human承認
  -> 手動公開または手動デプロイ
  -> 監査ログ
```

AI が担当するのは、候補整理・下書き・補助チェック・通知まで。
承認、公開、外部SNSへの投稿、git push、Vercel反映判断は Human が行う。

---

## 共通コンポーネント

| 領域 | 役割 | Blogでの実装 | 横展開時の扱い |
|------|------|--------------|----------------|
| Topic Queue | ネタ候補の管理 | `data/article-topics.sample.csv` | チャンネル別 topic DB を追加 |
| Draft Generator | AI下書き生成 | `scripts/generate-draft.mjs` / `scripts/scheduled-article-flow.mjs` | チャンネル別 prompt と schema を追加 |
| Asset Support | 画像・素材の割当 | `data/image-library.json` / `scripts/image-*.mjs` | Instagram画像案・YouTubeサムネ案にも流用 |
| Review Queue | Human確認待ち | `content/posts/*.md` の `reviewed:false` | `content/<channel>-drafts/*.md` または `data/dmp/<channel>/` |
| Notification | Telegram通知 | `notify-pending-review.mjs` | チャンネル別通知を追加 |
| Human Gate | 承認・差し戻し | admin UI / CLI | 各チャンネルで公開前承認を必須化 |
| Publish/Export | 公開または投稿準備 | build + git push | SNSは手動投稿用Markdownを出力 |
| Audit Log | 履歴管理 | `logs/review-history.md` | チャンネル名つきで追記 |

---

## チャンネル追加時の標準設計

新しいチャンネルを追加する場合は、次の要素を必ず定義する。

| 項目 | 内容 |
|------|------|
| Channel ID | `blog`, `instagram`, `x`, `line`, `youtube`, `website` など |
| Source Topics | どこからネタを取得するか |
| Draft Schema | 生成物の必須フィールド |
| Review Criteria | 医療広告表現・媒体固有リスク |
| Notification Format | Telegramに送る要約 |
| Approval Method | CLI / admin UI / 手動確認 |
| Publish Method | 手動投稿・手動デプロイ・コピー用出力 |
| Forbidden Automation | 自動投稿・自動承認などの禁止事項 |

---

## 推奨ディレクトリ

```
data/dmp/
  sns-topics.csv
  instagram/
    drafts/
    published-log.json
  x/
    drafts/
    published-log.json
  line/
    drafts/
    published-log.json
  youtube/
    scripts/
    published-log.json

content/
  posts/
  sns-drafts/
  youtube-scripts/

docs/dmp/
  dmp-channel-template.md
  dmp-sns-expansion-plan.md
```

Markdownドラフトは人間が読みやすく、Git差分で監査しやすい。
外部SNS APIに直接投稿するためのトークンは、当面導入しない。

---

## 共通フラグ

チャンネル横断のドラフトには、以下のような状態フィールドを持たせる。

```yaml
channel: instagram
platform: instagram
date: "2026-06-15"
status: pending_review
reviewed: false
approved_for_manual_post: false
ai_generated: true
medical_risk: low
source_topic_id: SNS-202606-001
publish_mode: manual_only
```

`reviewed:true` または `approved_for_manual_post:true` は Human 操作でのみ設定する。
SNS API 投稿を実装する場合も、別途明示承認を得るまでは `publish_mode: manual_only` を維持する。

---

## 横展開の優先順位

1. Instagram
   - ブログ内容を短く再編集し、画像・カルーセル案・キャプション・ハッシュタグを生成する。
   - 最初は手動投稿用Markdownの生成まで。

2. X
   - 1投稿またはスレッド案を生成する。
   - 文字数・誤解リスク・過度な煽り表現をチェックする。

3. LINE
   - 既存患者向けの短文告知・リマインド文を生成する。
   - 医療広告よりも患者コミュニケーション文脈を重視する。

4. YouTube
   - Shorts台本、通常動画台本、サムネイル文言案を生成する。
   - 撮影・編集・投稿はHumanが行う。

5. Website / LP
   - キャンペーン告知や固定ページのコピー案を生成する。
   - CMS反映やデプロイはHumanが行う。

