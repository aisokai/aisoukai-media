# Blog Image Workflow Batch 1-C Plan
# 記事画像誤割当の修正

作成日: 2026-05-30
担当: Claude Code
ステータス: 完了

---

## Current problem

Batch 1-B でライブラリメタデータを改善した結果、`image:misassign` で 12 件の誤割当を検出。
カテゴリ不一致・スコア 0 の画像が複数の公開記事に割り当てられている。

---

## 検出された誤割当（12件）全評価

| 記事 slug | カテゴリ | 現割当画像 | 現スコア | 判定 |
|---|---|---|---|---|
| 2026-02-05-root-canal | 根管治療 | general-34431026（ゴールドクラウン） | 1 | **要修正** |
| 2026-05-13-cadcam | 虫歯治療 | general-34407493（歯ブラシ女性） | 0.5 | **要修正** |
| 2026-05-14-req-145026175 | 虫歯治療 | general-34621196（X線機器） | 0.5 | **要修正** |
| 2026-05-15-req-145026191 | その他 | general-34197349（ホワイトニングトレー） | 0.5 | **要修正** |
| 2026-05-15-req-145026188 | 歯周病治療 | general-33909232（部分義歯） | 0 | **要修正** |
| 2026-03-20-wisdom-tooth | 親知らず | general-34430968（切削バー） | 0 | **要修正** |
| 2026-01-20-cavity-treatment | 虫歯治療 | general-3291061（頬押さえ女性） | 1 | 保留（後述） |
| 2026-02-15-periodontal-disease | 歯周病治療 | general-34130816（歯科スタッフ説明） | 1 | **保留**（歯周病専用画像なし） |
| 2026-05-14-req-145026178 | 歯周病治療 | general-34660571（笑顔女性） | 0.5 | **保留**（歯周病専用画像なし） |
| 2026-05-14-req-145026183 | その他 | general-34674550（3人笑顔） | 1 | **維持**（定期検診記事に適切） |
| 2026-05-22-topic-20260511-007 | 虫歯治療 | general-3798978（ジオラマ） | 1.5 | **維持**（cavity 適切・個性的） |
| 2026-05-24-topic-20260511-002 | 予防歯科 | general-27785292（フッ素男の子） | 1 | **維持**（小児歯科健診に最適） |

---

## 修正対象 6 件の割当計画

| 記事 | 変更前 | 変更後 | スコア変化 | 根拠 |
|---|---|---|---|---|
| 2026-02-05-root-canal | general-34431026 | **general-26207716** | 1→3 | root-canal 専用断面イラスト |
| 2026-05-13-cadcam | general-34407493 | **general-34431025-2** | 0.5→6 | CAD/cam タグ一致・スコア最高 |
| 2026-05-14-req-145026175 | general-34621196 | **general-34430968-2** | 0.5→4.5 | CAD/cam 切削バー・直接関連 |
| 2026-05-15-req-145026191 | general-34197349 | **general-34431025** | 0.5→4 | ジルコニア/セラミッククラウン |
| 2026-05-15-req-145026188 | general-33909232 | **general-26207715** | 0→1.5 | 部分義歯より歯科断面イラストが優位 |
| 2026-03-20-wisdom-tooth | general-34430968 | **general-3291061-2** | 0→1 | 歯の痛み表現・親知らず関連 |

### 保留 3 件の理由

- **2026-02-15-periodontal-disease**: 歯周病専用画像がライブラリにない。現在の歯科スタッフ説明画像のほうが `general-26207715`（虫歯断面）より文脈的に適切。
- **2026-05-14-req-145026178**: 同上。糖尿病×歯周病の記事に cavity 画像を当てるより現状維持。
- **2026-01-20-cavity-treatment**: 虫歯治療記事に cavity 画像（スコア 1）は許容範囲。`general-26207715` は他記事に使用。

---

## Target files

| ファイル | 変更内容 |
|---|---|
| `content/posts/2026-02-05-root-canal.md` | image / image_alt 更新 |
| `content/posts/2026-05-13-cadcam.md` | image / image_alt 更新 |
| `content/posts/2026-05-14-req-145026175.md` | image / image_alt 更新 |
| `content/posts/2026-05-15-req-145026191.md` | image / image_alt 更新 |
| `content/posts/2026-05-15-req-145026188.md` | image / image_alt 更新 |
| `content/posts/2026-03-20-wisdom-tooth.md` | image / image_alt 更新 |

### 変更しないファイル

- `data/image-library.json`（Batch 1-B 完了済み）
- `scripts/*.mjs`
- 記事本文（frontmatter の image/image_alt フィールドのみ変更）

---

## Detection commands

```bash
npm run image:misassign
npm run image:suggest -- <slug>
```

---

## Fix strategy

`npm run image:assign` スクリプトを使用。`reviewed` / `draft` 等は変更しない。

```bash
npm run image:assign -- 2026-02-05-root-canal      --image general-26207716
npm run image:assign -- 2026-05-13-cadcam           --image general-34431025-2
npm run image:assign -- 2026-05-14-req-145026175    --image general-34430968-2
npm run image:assign -- 2026-05-15-req-145026191    --image general-34431025
npm run image:assign -- 2026-05-15-req-145026188    --image general-26207715
npm run image:assign -- 2026-03-20-wisdom-tooth     --image general-3291061-2
```

---

## Validation commands

```bash
npm run image:check
npm run image:usage
npm run validate:posts
npm run build
git status --short
```

---

## Rollback notes

記事 frontmatter の image / image_alt のみ変更。

```bash
git checkout -- content/posts/
```

で全記事を一括ロールバック可能。

---

## Out-of-scope items

- 歯周病専用・親知らず専用の画像追加購入（ライブラリ拡充）
- Batch 1-A/1-B の変更
- `reviewed` / `draft` フラグの変更
- スコアリングロジックの変更
- Telegram ロジックの変更
- git push

---

## 実行ログ（2026-05-30）

- 実装実施: 完了
- 修正件数: 7件（6件 + req-145026191 の共用解消で再割当 1件）
- validate:posts: ✅ All posts valid (24件)
- image:check: エラーなし（警告は license / 歯周病・親知らず画像不足のみ）
- image:usage: 画像共用 0件・未割当 0件
- npm run build: ✓ Compiled successfully
- reviewed / draft 変更なし: 確認済み
