# Media Automation Core v1 — Commit分離プラン

- 作成日: 2026-06-11
- 目的: Codex最終レビュー(Blockingなし・commit分離推奨)に基づくcommit手順の正本
- **commit / push は先生のみが実行する。AIは実行しない。**

---

## 全体方針

未commitの作業ツリーには「SNS雛形系(従来作業)」と「Media Automation Core v1(今回作業)」が混在している。3つのcommitに分離する。

- **Commit A**: SNS雛形系(sns-drafts基盤・dmp docs)
- **Commit B**: Media Automation Core v1(queue / generator / validator / config / schema / tests)
- **Commit C**: Media Automation docs(設計書・運用ガイド・本プラン)

`package.json` はAとBの両方の変更を含むため `git add -p package.json` でhunk単位に分割する(hunk 1 = sns 2行 → A、hunk 2 = media:* 16行 → B)。

## Commit A: SNS雛形系

```
git add -p package.json        # hunk 1 (sns:validate / sns:list-pending-review) のみ y
git add README.md \
  docs/dmp/dmp-ai-editorial-company.md \
  docs/dmp/dmp-channel-template.md \
  docs/dmp/dmp-sns-expansion-plan.md \
  scripts/lib/sns-drafts.mjs \
  scripts/validate-sns-drafts.mjs \
  scripts/list-sns-pending-review.mjs \
  tests/sns-drafts.test.mjs \
  content/sns-drafts/README.md
```

commit message案:

```
feat: add SNS drafts scaffold (manual-only publish, validator, pending list)

- content/sns-drafts/ scheme: publish_mode manual_only のみ許可
- sns:validate / sns:list-pending-review scripts
- DMP横展開docs (channel template / sns expansion plan)
```

## Commit B: Media Automation Core v1

```
git add -p package.json        # hunk 2 (media:* scripts) のみ y
git add .gitignore \
  config/media-gate.json \
  schemas/ \
  scripts/lib/media-queue.mjs \
  scripts/lib/review-rules.mjs \
  scripts/lib/gmb-adapter.mjs \
  scripts/generate-emergency-notice.mjs \
  scripts/generate-sns-from-post.mjs \
  scripts/generate-gmb-draft.mjs \
  scripts/gmb-review-watcher.mjs \
  scripts/lineworks-intake-dry-run.mjs \
  scripts/telegram-instruction-dry-run.mjs \
  scripts/validate-media-queue.mjs \
  scripts/list-media-queue.mjs \
  scripts/validate-emergency-drafts.mjs \
  scripts/validate-gmb-drafts.mjs \
  scripts/validate-gmb-reviews.mjs \
  scripts/media-status.mjs \
  scripts/media-health.mjs \
  tests/media-queue.test.mjs \
  tests/emergency-notice.test.mjs \
  tests/sns-from-post.test.mjs \
  tests/gmb-drafts.test.mjs \
  tests/gmb-reviews.test.mjs \
  tests/lineworks-intake.test.mjs \
  tests/telegram-instruction.test.mjs \
  tests/media-health.test.mjs \
  content/media-queue/README.md \
  content/emergency-drafts/README.md \
  content/gmb-drafts/README.md \
  content/gmb-reviews/README.md \
  content/gmb-reviews/sample/mock-reviews.json \
  content/lineworks-requests/README.md
```

commit message案:

```
feat: add Media Automation Core v1 (local-only queue, generators, validators)

- media queue: 固定enum / gate表引き / status遷移表 / immutable fields
- generators: emergency notice / SNS repurpose / GMB draft / review watcher (mock)
- LINE WORKS / Telegram instruction intake stubs (送信機能なし)
- config/media-gate.json: 自動実行フラグ全OFF (全外部送信Human Gate)
- GMB/LINE WORKS/Telegramの実API接続コードは実装済み。ただし全flag初期OFFで、default launchdはread-only/dry-runのみ
- 生成物 (mj-* / lw-* / snapshots / replies / jsonl) はgitignore
```

## Commit C: Media Automation docs

```
git add docs/media-automation-system-plan.md \
  docs/media-automation-human-gate.md \
  docs/gmb-review-automation-plan.md \
  docs/media-automation-operator-guide.md \
  docs/media-automation-roadmap.md \
  docs/media-automation-commit-plan.md
```

commit message案:

```
docs: add media automation design, human gate policy, operator guide, roadmap
```

## commitに含めないもの(生成物・ログ)

以下は `.gitignore` 済みでgit対象外。誤ってadd しないこと。

- `content/media-queue/mj-*.json` (queue実データ)
- `content/gmb-drafts/mj-*` (GMB下書き実データ)
- `content/gmb-reviews/snapshots/` / `replies/` / `processed-ids.json` (口コミraw_text含む)
- `content/emergency-drafts/mj-*` (緊急お知らせ実データ)
- `content/lineworks-requests/lw-*.json`
- `logs/media-automation.jsonl`

**未ignoreだがcommit非推奨(先生判断):**

- `content/sns-drafts/2026-06-11-*-monthly-202606topic010.md` 3件 — Core v1動作確認で生成したサンプル。実運用ドラフトとして使うならCommit A後に通常フローでcommit、不要なら先生が削除。

## 注意

- push は先生のみ。AGENTS.md の「git push は原則禁止」に従う。
- commit前に `npm run lint && npm run build && node --test tests/*.test.mjs` で全green確認を推奨。
- `generate-gmb-draft.mjs` の `SITE_URL` は example ドメインのまま (TODOコメント付き)。本番URL化は別commit。
