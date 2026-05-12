# 次フェーズ改善候補

初回 AI 支援運用サイクル（2026-05-12）を踏まえた改善・拡張候補。
優先度は「運用安定 → 品質向上 → 拡張」の順で整理している。

---

## Phase 3A — 運用フロー改善（優先度: 高）

### 1. `generate:draft` の `--force` オプション追加

**問題**: `import:topic` でスタブを作成した後に `generate:draft` を実行すると
「既存ファイルあり」エラーになり、手動削除が必要。

**改善案**:
- `generate:draft` に `--force` フラグを追加してスタブを上書き可能にする
- または「`import:topic` は使わず `generate:draft` を直接呼ぶ」を運用手順に明記して
  `import:topic` コマンドを非推奨化する

---

### 2. `publish_at` と `date` の二重管理解消

**問題**: `date: 2026-05-26`（未来）でも `publish_at` 未設定なら今日から公開対象になる。
ユーザーが `date` を公開制御日と誤解するリスクがある。

**改善案 A（推奨）**: `generate:draft` / `import:topic` 生成時に `publish_at` を `date` と
同じ値で自動セットする。

**改善案 B**: `isPublishReady()` で `date` も公開制御に使う（`date > today` なら非公開）。
ただしこれは既存記事の挙動を変えるため移行コストあり。

---

### 3. `research:trends → CSV追記` の半自動化

**問題**: `research:trends` の出力を手動で `data/article-topics.sample.csv` に
追記してから `validate:topics` を呼ぶ手順が冗長。

**改善案**: `research:trends` に `--import` フラグを追加し、承認した候補 ID を
指定すると CSV に自動追記する。

```bash
npm run research:trends -- --import TOPIC-20260512-031
```

Human レビューは生成された JSON を確認する形で代替可能。

---

## Phase 3B — 品質向上（優先度: 中）

### 4. AI 下書き品質改善

- プロンプトに「3〜6ヶ月ごと」のような具体的な数値根拠の明示を要求する
- 見出し構成のテンプレートを強制してばらつきを減らす
- excerpt の自動生成をプロンプトで制御する（現在は frontmatter 固定文字列）

### 5. 医療広告チェック補助

`validate:publish-ready` に医療広告チェック項目を追加する。

```
- 断定的表現（「必ず〜」「確実に〜」「100%〜」）の検出
- 過度な不安語（「放置すると〜になる」等）の検出
- 比較優位表現（「最先端」「業界最高」等）の検出
```

正規表現ベースで warning / blocker を追加できる。

### 6. Search Console / Analytics 連携

- Vercel deploy 後に Google Search Console へ URL 登録を促す手順を追加
- GA4 または Vercel Analytics の設定ガイドを `docs/` に追加

---

## Phase 3C — 拡張（優先度: 低）

### 7. Review Dashboard UI

`list:pending-review` の出力をブラウザで確認できる簡易ページ。
`/admin/pending-review`（アクセス制限必須）。

### 8. Multi-site 化

複数クリニック向けにリポジトリ設定（`SITE_NAME`、カテゴリ定義、スタイル）を
外部設定ファイルに移す。

### 9. MitaniOS 連携

MitaniOS の患者 FAQ データやスタッフ向けメモを `research:trends` の入力ソースとして
取り込む連携インターフェース。

---

## 対応状況

| # | タイトル | フェーズ | 状態 |
|---|---------|---------|------|
| 1 | generate:draft --force オプション | 3A | 完了 |
| 2 | publish_at と date の二重管理解消 | 3A | 完了 |
| 3 | research:trends --import フラグ | 3A | 未着手 |
| 4 | AI下書き品質改善 | 3B | 未着手 |
| 5 | 医療広告チェック補助 | 3B | 未着手 |
| 6 | Search Console / Analytics | 3B | 未着手 |
| 7 | Review Dashboard UI | 3C | 未着手 |
| 8 | Multi-site 化 | 3C | 未着手 |
| 9 | MitaniOS 連携 | 3C | 未着手 |
