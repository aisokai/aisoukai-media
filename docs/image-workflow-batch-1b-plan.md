# Blog Image Workflow Batch 1-B Plan
# 画像メタデータ品質改善（alt・tags・category 修正）

作成日: 2026-05-30
担当: Claude Code
ステータス: 実行中

---

## Current problem

`data/image-library.json` に 44 件のエントリが汎用 alt `"歯科診療に関するイメージ"` および
汎用 tags `["歯科", "歯科診療"]` のままになっており、スコアリングが機能していない。

### 問題エントリの内訳

| 種別 | 件数 | 説明 |
|---|---|---|
| `-2` suffix エントリ | 39 件 | proper エントリと同じ Pixta ID の `general/` コピー |
| standalone 汎用エントリ | 5 件 | `general-2XXXXXXX` 系（新規 Pixta 購入分） |
| **合計** | **44 件** | |

### 39 件 `-2` エントリの問題

各 `-2` エントリには対応する proper エントリ（正確な alt・tags・category あり）が存在する。
proper エントリのメタデータを `-2` エントリにコピーすることで即座に修正できる。

### 5 件 standalone エントリの問題（目視確認済み）

| ID | 確認した内容 | 修正後カテゴリ |
|---|---|---|
| `general-26207715` | 虫歯進行5段階の断面イラスト（横長パノラマ形式） | `cavity` |
| `general-26207716` | 神経に達した重度虫歯の断面カラーイラスト | `root-canal` |
| `general-2695411` | 根管治療用ファイル（Kファイル）赤青黄・接写 | `root-canal` |
| `general-2695413` | 根管治療用ファイル・別角度・接写 | `root-canal` |
| `general-2883393` | ラバーダムクランプをフォーセップスで把持・接写 | `root-canal` |

---

## Target files

| ファイル | 変更内容 |
|---|---|
| `data/image-library.json` | 44 エントリの alt・tags・category を更新 |

### 変更しないファイル

- `public/images/library/**` （画像ファイルは一切変更しない）
- `content/posts/*.md`
- `scripts/*.mjs`（スコアリング・Telegram ロジック変更なし）

---

## 変更戦略

### 39 件 `-2` エントリ

proper エントリ（`-2` を除いた ID）から alt・tags・category を**コピー**。
`id` と `path` と `license_*` は変更しない。

### 5 件 standalone エントリ

目視確認した内容を元に直接設定。

| ID | alt | tags | category |
|---|---|---|---|
| `general-26207715` | 虫歯の進行5段階を示す歯の断面イラスト（健康から末期まで） | 虫歯/治療/歯科/断面/イラスト/進行/段階 | `cavity` |
| `general-26207716` | 重度の虫歯が神経に達した歯の断面カラーイラスト（根管治療適応例） | 根管治療/歯髄/虫歯/神経/歯科/断面/イラスト | `root-canal` |
| `general-2695411` | 根管治療用ファイル（Kファイル）3本の接写（赤・青・黄のハンドル） | 根管治療/ファイル/Kファイル/歯科器具/治療/歯科 | `root-canal` |
| `general-2695413` | 根管治療用ファイル（Kファイル）3本の接写・別角度（赤・青・黄のハンドル） | 根管治療/ファイル/Kファイル/歯科器具/治療/歯科 | `root-canal` |
| `general-2883393` | ラバーダムクランプをクランプフォーセップスで把持しているイメージ | 根管治療/ラバーダム/歯科器具/治療/歯科 | `root-canal` |

---

## 実装手順

1. `data/image-library.json` を Node.js スクリプト（inline）で更新
2. `npm run image:check` で整合性確認
3. `npm run build` でビルド確認
4. `git status --short` 確認
5. `git add data/image-library.json` → `git commit`

---

## Rollback notes

`data/image-library.json` のみの変更。

```bash
git checkout -- data/image-library.json
```

で即時ロールバック可能。

---

## Out-of-scope items

- Batch 1-C（記事への再割当）
- 画像ファイルの移動・削除
- スコアリングロジックの変更
- `root-canal` / `periodontal` / `wisdom-tooth` ディレクトリへの画像追加
- `-2` エントリの削除（重複排除はスコープ外）
- git push

---

## 実行ログ（実行後に記入）

- 実装実施: 未実施
- 更新件数: -
- image:check 結果: -
- build 結果: -
- commit hash: -
