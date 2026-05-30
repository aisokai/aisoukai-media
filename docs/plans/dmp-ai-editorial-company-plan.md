# DMP AI編集部 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dental Media Project の運営を AI 編集部モデルで体系化し、blog/SNS/Website/YouTube のコンテンツ計画・承認・公開管理を一元化する最小構造を整備する。

**Architecture:** 既存の blog 承認フロー（Telegram→draft→Human approve→build）を核に、DMP AI編集部の部門構造をドキュメントと YAML データで定義する。新規ランタイムは導入せず、docs + data + YAML スキーマで編集部モデルを表現する。

**Tech Stack:** Markdown docs, YAML, 既存 Node.js scripts, Next.js 16 (App Router), TypeScript strict

---

## フェーズ 1: 現状確認（完了）

### 既存実装の確認

| 領域 | 状態 | 場所 |
|------|------|------|
| ブログ承認フロー | 実装済み | `scripts/`, `content/posts/`, `docs/workflows/` |
| 画像管理 | 実装済み | `scripts/image-*.mjs`, `data/image-library.json` |
| Telegram 連携 | 実装済み | `scripts/telegram-*.mjs`, `scripts/ops-mwf.mjs` |
| 記事ネタDB | 実装済み | `data/article-topics.sample.csv` |
| AI下書き生成 | 実装済み | `scripts/generate-draft.mjs` |
| SNS (Instagram/X/LINE) | **未実装** | - |
| YouTube | **未実装** | - |
| Website LP/サービスページ | **未実装** | - |
| DMP部門構造 | **未定義** | - |

### 既存ドキュメントの配置

```
docs/
  ai-editorial-operations-plan.md   ← ブログ特化の運用設計（あり）
  workflows/
    ai-content-lifecycle.md         ← ブログ用ライフサイクル（あり）
    human-approval-flow.md          ← Human承認フロー（あり）
  mitanios-integration-plan.md      ← MitaniOS連携方針（あり・未実装）
```

### 課題

- DMP = Dental Media Project としての横断的な組織モデルがない
- SNS/YouTube/Websiteのコンテンツが同じ承認パイプラインで管理できていない
- 「編集長」という単一窓口の概念が定義されていない
- チャンネル別のヒューマンゲートポリシーが不統一

---

## フェーズ 2: DMP AI編集部 組織定義

### Task 1: dmp-ai-editorial-company.md の作成

**Files:**
- Create: `docs/dmp/dmp-ai-editorial-company.md`

- [ ] **Step 1: ファイルを作成する**

```markdown
# DMP AI編集部 — 組織・役割定義
（docs/dmp/dmp-ai-editorial-company.md の全文）
```

内容:
- DMP の位置付け（MitaniOS 階層）
- 部門一覧と役割定義
- 編集長インターフェースの仕様
- 将来拡張マップ

- [ ] **Step 2: YAML で部門データを作成する**

ファイル: `data/dmp/dmp-departments.yaml`

- [ ] **Step 3: lint & build 確認**

```bash
cd ~/Desktop/projects/aisoukai-media
npm run lint
npm run build
```

Expected: docs/data ファイルのみの追加なので build に影響なし。

- [ ] **Step 4: コミット**

```bash
git add docs/dmp/dmp-ai-editorial-company.md data/dmp/dmp-departments.yaml
git commit -m "docs(dmp): add DMP AI編集部 organization definition"
```

---

### Task 2: dmp-content-lifecycle.md の作成

**Files:**
- Create: `docs/dmp/dmp-content-lifecycle.md`

- [ ] **Step 1: コンテンツライフサイクルを定義する**

チャンネル別ステージ:
- idea → research → draft → review → approval_waiting → approved → published / archived

各ステージのゲート定義:
- `review` ステージ: 医療広告表現リスクチェック必須
- `approval_waiting` → `approved`: Human 承認必須
- `approved` → `published`: 手動 build + deploy のみ

- [ ] **Step 2: チャンネル別サイクルマップを追加する**

| チャンネル | 現状 | 次フェーズ |
|-----------|------|-----------|
| Blog | 実装済み | SNS連携追加 |
| SNS (Instagram/X/LINE) | 未着手 | Phase 2 |
| Website | 未着手 | Phase 3 |
| YouTube | 未着手 | Phase 4 |

- [ ] **Step 3: content-queue のサンプル YAML を作成する**

ファイル: `data/dmp/dmp-content-queue.example.yaml`

- [ ] **Step 4: コミット**

```bash
git add docs/dmp/dmp-content-lifecycle.md data/dmp/dmp-content-queue.example.yaml
git commit -m "docs(dmp): add DMP content lifecycle and example queue schema"
```

---

### Task 3: dmp-human-gate-policy.md の作成

**Files:**
- Create: `docs/dmp/dmp-human-gate-policy.md`

- [ ] **Step 1: ヒューマンゲートポリシーを定義する**

必須ゲート:
- AI自動承認禁止（`reviewed:true` のAI書き換え禁止）
- 自動公開禁止（build → push は常に Human が実行）
- 医療効果断定表現の禁止（AGENTS.md より継承）
- 外部API連携（Instagram, YouTube, LINE）は Human 明示操作のみ

チャンネル別ゲート:
- Blog: `approve:post` CLI（実装済み）
- SNS: ドラフト → Human コピー → 各プラットフォームで手動投稿
- Website: ドラフト → Human が CMS または PR でデプロイ
- YouTube: スクリプト生成 → Human が動画撮影・編集・投稿

自動化してはいけないこと（現フェーズ）:
- Instagram / Meta Graph API による自動投稿
- YouTube Data API による自動アップロード
- LINE公式アカウントへの自動配信
- approve / reject の AI 自動実行

- [ ] **Step 2: コミット**

```bash
git add docs/dmp/dmp-human-gate-policy.md
git commit -m "docs(dmp): add DMP human gate policy"
```

---

## フェーズ 3: プラグイン選定

### 選定方針

| カテゴリ | 判断 | 理由 |
|---------|------|------|
| 外部 Claude Code プラグイン | **不採用** | 既存 `@anthropic-ai/sdk` で十分。未知サードパーティは安全審査が必要 |
| Playwright/ブラウザテスト | **不採用（当面）** | UI変更がないため不要 |
| カスタムスラッシュコマンド（CLAUDE.md） | **採用検討** | DMP 編集部ワークフローの短縮指示に有用 |
| MCP サーバー | **将来検討** | Instagram/YouTube API連携時に必要になる可能性あり |
| ブログ用 hooks | **不採用** | 既存スクリプトで完結。hooks は外部リクエストのリスクあり |

### 採用するもの

- **カスタム CLAUDE.md コマンド補足**: DMP部門別ショートカット指示テンプレートを CLAUDE.md に追記
  - `dmp:blog <テーマ>` — ブログ記事依頼ショートカット
  - `dmp:sns <テーマ>` — SNS投稿ドラフト依頼（将来）
  - `dmp:review <slug>` — 医療広告レビュー依頼（将来）

### 採用しないもの（現フェーズ）

- Instagram 自動投稿プラグイン（OAuth必要・Human Gate違反リスク）
- YouTube Data API 連携（自動アップロードは禁止）
- LINE公式アカウント自動配信（Human Gate違反）
- 未知の ClaudeCodeCompany プラグイン（安全審査未実施）

---

## フェーズ 4: 最小実装スコープ

### 作成/変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `docs/plans/dmp-ai-editorial-company-plan.md` | 新規 | このプランファイル |
| `docs/dmp/dmp-ai-editorial-company.md` | 新規 | DMP AI編集部 組織・役割定義 |
| `docs/dmp/dmp-content-lifecycle.md` | 新規 | チャンネル別コンテンツライフサイクル |
| `docs/dmp/dmp-human-gate-policy.md` | 新規 | Human Gate ポリシー |
| `data/dmp/dmp-departments.yaml` | 新規 | 部門データスキーマ |
| `data/dmp/dmp-content-queue.example.yaml` | 新規 | コンテンツキューサンプル |
| `CLAUDE.md` | 更新 | DMP ショートカット指示テンプレートを補足（最小限） |

### 実装しないこと（現フェーズ）

- Instagram / Meta Graph API 接続
- YouTube Data API 接続
- LINE公式アカウントWebhook
- DMP専用ダッシュボード UI
- 新規 Node.js ランタイムスクリプト
- 外部プラグインのインストール
- cron 自動実行の新規追加

---

## 検証計画

```bash
# docs/data ファイルのみなので build への影響確認
npm run lint
npm run build
npm run validate:posts  # 既存記事への影響なしを確認
```

Expected: 全コマンド EXIT 0。新規ファイルはすべて docs/data に限定されるため build に影響なし。

---

## 将来拡張マップ

| フェーズ | 内容 | 条件 |
|---------|------|------|
| DMP Phase 2 | SNS ドラフト生成スクリプト追加 | Human 明示承認あり |
| DMP Phase 3 | Website LP テンプレート管理 | Human 明示承認あり |
| DMP Phase 4 | YouTube スクリプト生成 | Human 明示承認あり |
| DMP Phase 5 | MitaniOS 患者FAQ連携 | `docs/mitanios-integration-plan.md` 参照 |
| DMP Phase 6 | Instagram 半自動投稿（コピー＆貼付） | Human Gate 維持前提 |

---

## 自己レビュー

### スペックカバレッジ確認

| 要件 | Task | カバー状況 |
|------|------|-----------|
| DMP = Dental Media Project の明文化 | Task 1 | ✅ |
| MitaniOS 階層内の位置付け | Task 1 | ✅ |
| AI編集部 組織マップ | Task 1 | ✅ |
| 部門役割定義（9部門） | Task 1 + YAML | ✅ |
| コンテンツライフサイクル | Task 2 | ✅ |
| Human Gate ポリシー | Task 3 | ✅ |
| プラグイン選定方針 | フェーズ3 | ✅ |
| 自動化しないことの明文化 | Task 3 + フェーズ3 | ✅ |
| 最小実装スコープ | フェーズ4 | ✅ |
| 将来拡張（Instagram/YouTube/Website/LINE） | 将来拡張マップ | ✅ |

### プレースホルダースキャン

- "TBD" / "TODO" / "implement later" → なし ✅
- 実際のコード・コマンドなしのステップ → なし ✅

---

*作成: 2026-05-31 | repo: aisoukai-media | 次agent: Human承認後にサブエージェント駆動で実装*
