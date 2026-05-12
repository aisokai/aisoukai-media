# MitaniOS 連携 実装方針

MitaniOS の患者 FAQ データやスタッフ向けメモを `research:trends` の
入力ソースとして取り込む連携インターフェースの設計方針。
現時点では実装せず、将来の拡張時に参照するドキュメント。

---

## 目的

`research:trends` は現在、静的サンプル候補（5件固定）を返す dry-run 実装。
MitaniOS のデータを入力ソースとして連携することで、
クリニック固有の患者ニーズに基づく記事候補生成が可能になる。

---

## 連携対象データ

| MitaniOS データ | 活用方法 |
|----------------|---------|
| 患者 FAQ（問い合わせ履歴） | `patient_intent` / `target_keyword` の実データとして使用 |
| スタッフ向けメモ | `notes` / `topic` の補足情報として使用 |
| 受診理由の分類 | `category` / `source_type` の決定に使用 |

---

## 方針: アダプター経由のデータ取込

### 1. データ取込スクリプト（`scripts/mitanios-adapter.mjs`）

MitaniOS から取得したデータを `research:trends` と同じ形式に変換する。

```js
// scripts/mitanios-adapter.mjs（概念コード）
import { writeFIleSync } from 'node:fs'

export async function fetchMitaniOsCandidates(apiBase, apiKey) {
  // MitaniOS の FAQ エンドポイントから候補を取得
  const res = await fetch(`${apiBase}/api/faq-topics`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const data = await res.json()

  // research:trends のCandidates形式に変換
  return data.items.map((item) => ({
    researched_at:   new Date().toISOString().slice(0, 10),
    source_type:     'patient_question',
    source_url:      '',
    topic:           item.topic,
    title_candidate: item.suggestedTitle ?? item.topic,
    category:        item.category,
    target_keyword:  item.keyword,
    patient_intent:  item.intent,
    priority:        item.priority ?? 'medium',
    medical_risk:    item.medicalRisk ?? 'medium',
    confidence:      'medium',
    status:          'idea',
    publish_date:    addDays(today, 14),
    reason:          `MitaniOS FAQ取込: ${item.sourceRef}`,
    notes:           item.notes ?? '',
  }))
}
```

### 2. `research:trends` への `--source mitanios` フラグ追加

```bash
# 通常 dry-run（現状）
npm run research:trends

# MitaniOS データを入力ソースとして使用（将来）
npm run research:trends -- --source mitanios
```

内部では `mitanios-adapter.mjs` を呼び出し、同じ JSON/CSV 形式で出力する。
Human レビューと `--import` フローは既存のまま維持する。

---

## 環境変数（追加予定）

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `MITANIOS_API_BASE` | `--source mitanios` 使用時 | MitaniOS API のベース URL |
| `MITANIOS_API_KEY` | `--source mitanios` 使用時 | API 認証キー。`.env.local` に記述し commit 禁止 |

---

## 実装手順（将来）

1. MitaniOS 側で FAQ データを取得できる API エンドポイントを確認・設計
2. `scripts/mitanios-adapter.mjs` を実装し、ローカルで形式変換を確認
3. `research:trends` に `--source` フラグを追加し、アダプターを呼び出す分岐を追加
4. `.env.local.example` に `MITANIOS_API_BASE` / `MITANIOS_API_KEY` を追記
5. `data/research/` 出力と `--import` フローで既存パイプラインと接続

---

## 留意事項

- **患者データの取扱**: FAQ データに個人を特定できる情報が含まれないことを事前確認する
- **AI hallucination 対策**: MitaniOS 由来の候補も必ず Human レビューを経てから CSV に追記する
- **医療広告ガイドライン**: MitaniOS データ由来の表現も `validate:publish-ready` の医療広告チェック対象になる
- **API 未提供の場合**: MitaniOS から CSV エクスポートして `research:trends` の代わりに直接 `--import` する運用でも代替可能
