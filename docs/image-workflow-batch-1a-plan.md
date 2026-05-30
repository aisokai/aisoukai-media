# Blog Image Workflow Batch 1-A Plan
# inbox 画像のライブラリインポート

作成日: 2026-05-30
担当: Claude Code
ステータス: 完了（前セッションで実施済みと判明）

---

## Current problem

`public/images/library/inbox/` に5バッチ・計44枚の画像が放置されており、
`data/image-library.json` に未登録のため画像スコアリングの対象外になっている。
既存の `image-import-inbox.mjs` スクリプトで安全にインポートできる状態。

### inbox 内の現状

| バッチフォルダ | 枚数 |
|---|---|
| 20260513013850_photo | 10枚 |
| 20260513014006_photo | 9枚 |
| 20260513014136_photo | 10枚 |
| 20260513014332_photo | 10枚 |
| 20260515081649_photo | 5枚 |
| **合計** | **44枚** |

### 分類上の注意

ファイル名は Pixta の数字 ID（例: `34130816_s.jpg`）のみで、カテゴリキーワードを含まない。
フォルダ名もタイムスタンプ形式のため、スクリプトの自動分類はすべて `general` になる。

これは許容範囲内。Batch 1-B でタグ・alt の改善、Batch 1-C で画像の再割当を予定しており、
まず「ライブラリに登録されている状態」にすることが本 Batch のゴール。

---

## Target files

| ファイル | 変更内容 |
|---|---|
| `data/image-library.json` | 44エントリ追加 |
| `public/images/library/general/` | 44枚の画像ファイルコピー |

### 変更しないファイル

- `content/posts/*.md`（記事 MD は一切触らない）
- `scripts/*.mjs`（スクリプト変更なし）
- `scripts/lib/image-scoring.mjs`（スコアリングロジック変更なし）
- `scripts/telegram-ops.mjs`（Telegram ロジック変更なし）

---

## Dry-run command

```bash
cd ~/Desktop/projects/aisoukai-media
npm run image:import-inbox
# デフォルト = --dry-run。ファイル変更なし。処理内容を表示するだけ。
```

---

## Apply command

dry-run 確認後に実行:

```bash
npm run image:import-inbox -- --apply
```

`--move` は使わない（inbox 原本を保持する）。

---

## Validation commands

```bash
npm run image:check
npm run image:usage
npm run build
git status --short
```

---

## Rollback notes

`--apply` は以下の操作のみ行う:
- `public/images/library/general/` へのファイルコピー（元 inbox は削除しない）
- `data/image-library.json` への追記

コピーなので inbox は残る。
`git checkout -- data/image-library.json` と `rm public/images/library/general/general-XXXXXX.jpg`
で完全ロールバック可能。コミット前であれば `git checkout -- .` も使用可能。

---

## Out-of-scope items

以下は本 Batch 1-A の対象外:

- **Batch 1-B**: `general` カテゴリのタグ・alt 改善、重複 ID 整理
- **Batch 1-C**: `その他` カテゴリ記事の画像再割当
- inbox 画像の手動カテゴリ再分類（Batch 1-B で実施）
- フィードバック運用フローの整備
- `root-canal` / `periodontal` / `wisdom-tooth` への画像追加
- スコアリングロジックの変更
- Telegram ロジックの変更
- 記事 MD の編集
- git push

---

## 実行ログ

### 2026-05-30 調査結果

- dry-run 実施: 完了
- apply 実施: **実施しない（理由: 全44枚が既にライブラリ登録済みのため）**

#### 調査詳細

dry-run 結果を検証した結果、inbox の全44枚が `data/image-library.json` に既登録であることを確認。

| バッチ | 内訳 |
|---|---|
| 第1〜4バッチ（39枚） | 各 Pixta ID が2エントリ登録済み（proper category + general/-2） |
| 第5バッチ（5枚） | 各 Pixta ID が1エントリ登録済み（general、汎用 alt） |

apply を実行した場合:
- 低解像度（`_s` = small）の重複コピーが `general/` に作成される
- `image-library.json` に `-3` suffix の重複エントリが44件追加される
- 既存の適切な alt・カテゴリ情報が希薄化される

→ **apply は実施しない。inbox は前回セッションで処理済み（削除しなかっただけ）。**

#### 次のアクション

Batch 1-A は前セッション完了済み。真の改善ポイントは Batch 1-B:
1. `general-XXXXXX-2` エントリ（汎用 alt 44件）の alt・tags・category を修正
2. 第5バッチ5枚（`general-26207715` 等）も汎用 alt のみ → 同様に修正対象
3. inbox フォルダは Human が確認後にアーカイブまたは削除
