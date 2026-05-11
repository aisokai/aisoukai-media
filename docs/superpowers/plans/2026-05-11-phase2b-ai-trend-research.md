# Phase 2B: Trend Research Candidate Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AIトレンド調査の最小ワークフローとして、記事候補を調査メモにまとめ、CSV候補を生成するCLIを追加する。既存の `article-topics.sample.csv` には自動追記せず、人間レビュー前提の「候補出力」だけを行う。

**Architecture:** `scripts/research-trends.mjs` は dry-run 前提で動作し、外部API呼び出しを行わない。入力は現在日付とカテゴリ制約だけに絞り、出力は `data/research/` 以下の候補ファイルに限定する。候補は JSON と CSV の両方で保存できる構成にし、ソースURL・調査日・調査メモを残す。AI hallucination を前提に、生成物は必ず人間が確認してから topic DB に手入力する。

**Tech Stack:** Node.js 20 ESM, Node built-ins, 既存 `scripts/csv-parser.mjs` の方針, Next.js プロジェクトの npm scripts

---

### File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `scripts/research-trends.mjs` | dry-run CLI: 調査候補を生成し、JSON/CSV 候補ファイルを書き出す |
| Create | `scripts/prompts/research-trend-prompt.mjs` | 候補の出力ルールと医療安全ガイドラインをまとめる |
| Modify | `package.json` | `research:trends` スクリプトを追加する |
| Modify | `.gitignore` | `data/research/` の扱いを明示するか検討する |
| Create | `docs/superpowers/plans/2026-05-11-phase2b-ai-trend-research.md` | 本計画書 |

---

### Task 1: Phase 2B の設計を固定する

**Files:**
- Create/Modify: `docs/superpowers/plans/2026-05-11-phase2b-ai-trend-research.md`

- [ ] **Step 1: dry-run の境界を明文化する**

```md
- 外部APIは呼ばない
- 既存 CSV へ自動追記しない
- publish / scheduled publish / auto draft generation はしない
- 生成物は候補メモであり、Human review が必須
```

- [ ] **Step 2: 出力フォーマットを明文化する**

```md
出力:
- JSON: `data/research/YYYY-MM-DD-trends.json`
- CSV:  `data/research/YYYY-MM-DD-trends.csv`

各候補に含める項目:
- discovered_at
- source_type
- source_url
- topic
- title_candidate
- category
- target_keyword
- patient_intent
- priority
- medical_risk
- status
- publish_date
- notes
```

- [ ] **Step 3: 人間レビュー条件を明文化する**

```md
- 誇大表現、断定表現、煽り表現は禁止
- 医療安全上あいまいな候補は除外
- source_url が無い候補は notes に根拠メモを残す
- AI hallucination を前提に、候補は必ず人間が再確認する
```

### Task 2: trend research CLI の最小実装

**Files:**
- Create: `scripts/research-trends.mjs`
- Create: `scripts/prompts/research-trend-prompt.mjs`

- [ ] **Step 1: 入力を current date とカテゴリ制約だけに絞る**

```js
function getTodayIso() {
  return new Date().toISOString().slice(0, 10)
}
```

- [ ] **Step 2: 候補データをローカルで組み立てる**

```js
const candidates = [
  {
    discovered_at: today,
    source_type: 'trend',
    source_url: '',
    topic: '...',
    title_candidate: '...',
    category: '予防歯科',
    target_keyword: '...',
    patient_intent: '...',
    priority: 'medium',
    medical_risk: 'low',
    status: 'idea',
    publish_date: today,
    notes: 'dry-run candidate',
  },
]
```

- [ ] **Step 3: JSON と CSV を書き出す**

```js
mkdirSync(RESEARCH_DIR, { recursive: true })
writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf8')
writeFileSync(csvPath, csvText, 'utf8')
```

- [ ] **Step 4: 既存 topic DB への追記を行わない**

```js
// ここで data/article-topics.sample.csv は変更しない
```

### Task 3: npm script と検証手順を追加する

**Files:**
- Modify: `package.json`

- [ ] **Step 1: `research:trends` を追加する**

```json
{
  "scripts": {
    "research:trends": "node scripts/research-trends.mjs"
  }
}
```

- [ ] **Step 2: dry-run 実行を確認する**

```bash
npm run research:trends
```

Expected:
```text
✅ Saved candidate files to data/research/YYYY-MM-DD-trends.json
✅ Saved candidate files to data/research/YYYY-MM-DD-trends.csv
```

- [ ] **Step 3: 既存検証への影響を確認する**

```bash
npm run validate:topics
npm run validate:posts
npm run build
```

Expected: すべて exit 0

### Task 4: 運用メモを整備する

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: research output の保存先とレビュー手順を README に追記する**

```md
1. `npm run research:trends`
2. `data/research/*.json` / `data/research/*.csv` を確認
3. 採用候補だけを手動で `data/article-topics.sample.csv` に追記
```

- [ ] **Step 2: 調査履歴の扱いを決める**

```md
- 調査成果物を git 管理するなら `data/research/` を明示的に追加対象にする
- まだ保留なら `.gitignore` に追加して運用負荷を下げる
```

---

## Self-Review

- 既存 CSV を自動更新しないことを明文化した
- 外部APIなしの dry-run 前提になっている
- source_url / 調査日 / notes を保持する
- Human review を必須としている
- publish / scheduled publish / auto draft generation に触れていない

