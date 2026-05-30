# ブログ承認フロー 再設計プラン

> **正本ファイル** — 実装はこのドキュメントを唯一の根拠とする。
> 更新日: 2026-05-30

---

## 1. 現状の問題点

### P1: Telegram通知が来ない（根本原因）
- プロジェクトが `~/Desktop/aisoukai-media` → `~/Desktop/projects/aisoukai-media` に移動されたが、launchd plist のパスが更新されていない
- `telegram-ops` launchd: `cd /Desktop/aisoukai-media && npm run...` → package.json なし → 毎3分失敗（LastExitStatus=65024）
- `ops-mwf` launchd: `node /Desktop/aisoukai-media/scripts/ops-mwf.mjs` → MODULE_NOT_FOUND → 月水金 08:30 に毎回失敗（LastExitStatus=256）
- `--status` コマンドは plist の存在しか確認せず「✅ 登録済み」と誤表示
- 最後に成功した実行: 2026-05-22（8日以上前）
- エラーログ `telegram-ops-error.log` が 4.9MB まで蓄積中

### P2: 複数 review 待ちから承認対象を選べない
- `jp_approve`（「承認」と送る）は**常に最後に追加した pending 記事を固定採用**
  ```js
  const target = pendingItems[pendingItems.length - 1]
  ```
- 特定記事を承認するには `approve <slug> by <名前>` が必要だが、通知文が 3件 + "...他N件" で slug が全件表示されないため打てない

### P3: 重複記事が溜まっている
- 「定期検診・頻度」テーマの類似記事が 4件 review 待ち（うち 2件はタイトル完全重複）
- 重複フィルタが同一セッション内で機能しなかった

### P4: 全体的な運用体験の不快さ
- slug を毎回手打ちする必要がある
- 通知が来ない → 気づかない → 記事が溜まる → どれを承認すべきか分からない
- CLI コマンドはスマホ操作を前提としていない

---

## 2. 採用方針

| 方針 | 理由 |
|------|------|
| **Telegram は通知と入口に限定する** | スマホ Telegram でのコマンド操作は快適でない |
| **承認/却下は `/admin/pending-review` 管理画面で行う** | ボタン操作・本文プレビュー・画像確認を一画面で完結させる |
| **管理画面をスマホファーストで再設計する** | 運用者はスマホ操作が主 |
| **slug 手打ちを廃止する** | 承認ボタンが slug を自動送信する |
| **通知は「今やること」を一目で分かる形にする** | 件数最上部・全件表示・管理画面リンク |
| **launchd パスを自動検出する** | プロジェクト移動時に壊れない設計にする |
| **status コマンドが実態を反映する** | 失敗しているのに OK 表示しない |

---

## 3. 非採用方針

| 方針 | 理由 |
|------|------|
| Telegram から直接承認する | AGENTS.md 禁止事項・誤承認リスク |
| 「承認」単独で直近 draft を自動採用する挙動を継続 | 複数 pending 時に意図しない記事が承認される |
| 大規模 DB 導入 | 現在のファイルベース運用で十分 |
| SNS/LINE/YouTube 連携 | スコープ外 |
| 承認の完全自動化 | reviewed:false の公開禁止・Human review 必須 |

---

## 4. UX 完成形

### Telegram 通知（月水金 08:30）

```
📋 review待ち 5件

① 歯科医院の定期検診は何ヶ月ごとに受けるべき？（2026-05-14）
② 歯の定期検診はどのくらいの頻度で受けるのが目安？（2026-05-15）
③ 歯の定期検診はどのくらいの頻度で受けるのが目安？（2026-05-15）← ⚠️ ②と重複
④ 歯の定期検診はどのくらいの頻度で受けるべき？（2026-05-15）
⑤ インプラント治療の最新トレンド（2026-05-15）

承認・却下は管理画面から:
https://aisoukai-media.vercel.app/admin/pending-review
```

### 管理画面 `/admin/pending-review`

- 記事カード形式（タイトル・日付・カテゴリ・本文冒頭 100文字・画像候補）
- 各カードに「**承認**」「**却下**」「**保留**」ボタン
- 重複候補はカードにバッジ表示
- slug は折りたたみで補助情報として表示
- iPhone 幅（375px〜）で操作しやすいレイアウト

### Telegram「承認」送信時（複数 pending の場合）

```
管理画面から承認してください:
https://aisoukai-media.vercel.app/admin/pending-review

現在 5件の review 待ち記事があります。
```

---

## 5. フェーズ構成

```
Phase 1 → Phase 2
       ↘ Phase 3
       ↘ Phase 4 → Phase 5
```

| # | タイトル | 優先度 | 依存 |
|---|---------|--------|------|
| Phase 1 | 緊急修正: launchd パス修正 + status 正確化 | 最高 | なし |
| Phase 2 | Telegram 通知文の再設計 | 高 | Phase 1 |
| Phase 3 | /admin/pending-review スマホ承認 UI 改善 | 高 | Phase 1 |
| Phase 4 | 承認対象管理の明確化（jp_approve 直近固定廃止） | 高 | Phase 2 |
| Phase 5 | 重複記事検出と整理 UX | 中 | Phase 3, 4 |
| Phase 6 | 検証と運用確認 | 高 | 全フェーズ |

---

## 6. フェーズ詳細

### Phase 1: 緊急修正 — launchd パス修正 + status 正確化

**目的**: プロジェクト移動後に止まった Telegram 通知の自動実行を復旧できる状態にする

**変更ファイル**:
- `scripts/setup-launchd-telegram-ops.mjs`
- `scripts/setup-launchd-mwf.mjs`

**実装内容**:
1. plist 生成時のパスを `__dirname` ベースの相対解決（`ROOT = dirname(dirname(fileURLToPath(import.meta.url)))`）に変更し、プロジェクト移動後もパスが正しく生成される
2. `--status` コマンドで `launchctl list <label>` を実行し、実際の `LastExitStatus` を表示する
3. `LastExitStatus` が非ゼロなら「❌ エラー終了（コード: XX）」と表示
4. ログファイルの最終更新日時を表示し、"最後の成功実行" が確認できる

**完了条件**:
- `npm run telegram:ops:status` が実際の動作状態（LastExitStatus）を表示する
- `npm run ops:mwf:status` が実際の動作状態を表示する
- `--install` 実行後に生成される plist が現在の正しいプロジェクトパスを持つ
- 既存の launchd 再登録は Human が手動で実行（AI は行わない）

**検証コマンド**:
```bash
node scripts/setup-launchd-telegram-ops.mjs --status
node scripts/setup-launchd-mwf.mjs --status
# dry-run: --install の plist 生成内容確認
```

**Human Gate**: `npm run telegram:ops:install` / `npm run ops:mwf:install` の実行（本番再登録）

---

### Phase 2: Telegram 通知文の再設計

**目的**: 通知を受け取った瞬間に「何をすべきか」が分かる内容にする

**変更ファイル**:
- `scripts/notify-pending-review.mjs`
- `scripts/lib/content-status.mjs`（`buildReviewSummary` 関数）
- `scripts/notify-posting-reminder.mjs`（必要に応じて）

**実装内容**:
1. `buildReviewSummary` の通知文フォーマットを変更:
   - 最上部に件数を太字で表示: `📋 review待ち N件`
   - pending 0件: `✅ review待ちはありません`
   - pending 1件: タイトル + 管理画面リンク
   - pending 複数件: 番号付きリスト（最大 5件）+ 重複候補バッジ + 管理画面リンク
2. 重複候補の表示: タイトル類似度が高いペアに `← ⚠️ X番と重複候補` を付与
3. slug 手打ちを前提とした文言（`npm run approve:post -- <slug>` 等）を削除
4. 管理画面 URL を常に末尾に表示

**完了条件**:
- `npm run notify:pending-review` を実行して通知文を確認
- slug が表示されない（or 折りたたみ扱い）
- 管理画面 URL が末尾にある
- 5件まで全件番号付き表示される

**検証コマンド**:
```bash
npm run notify:pending-review  # Telegram送信なし(dry-run相当)でconsole出力確認
npm run status:content
```

---

### Phase 3: /admin/pending-review スマホ承認 UI 改善

**目的**: スマホ画面で迷わず記事を選んで承認・却下できる管理画面にする

**制約**: AGENTS.md により `approve API / publish API の実装は禁止`。
承認操作は引き続き CLI コマンドで行う。管理画面はコマンドの**ワンタップコピー**を提供する。

**変更ファイル**:
- `src/app/admin/pending-review/page.tsx`
- `src/app/admin/pending-review/CopyButton.tsx`（改善）
- `src/app/admin/pending-review/PostBodyPreview.tsx`（既存、必要に応じて）

**実装内容**:
1. 記事カード化（モバイルファースト）:
   - タイトル（大）/ 日付・カテゴリ（小）
   - 本文冒頭プレビュー（既存の PostBodyPreview を活用）
   - 画像サムネイル表示（`post.image` フィールドから）
   - slug は `<details>` で折りたたみ（補助情報に降格）
   - 重複候補は `⚠️ 重複候補` バッジ（findDuplicateThemes を活用）
2. 操作ボタン（コピー方式）:
   - `✅ 承認コマンドをコピー` ボタン → クリップボードに `npm run approve:post -- <slug> --reviewed-by "氏名"` をコピー
   - `❌ 却下` ボタン → 却下理由入力 → `npm run reject:post -- <slug> --reason "理由"` をコピー
   - `⏸ 保留` ボタン → そのカードを UI 上で一時非表示（localStorage で管理）
   - ボタンは iPhone タップ領域（44px+）
3. reviewer 名は localStorage に保存（一度入力すれば毎回入力不要）
4. スマホ幅（375px〜）で縦1列レイアウト

**完了条件**:
- iPhone 幅でカードが見やすい
- 承認ボタンタップでコマンドがコピーされる
- 重複候補バッジが表示される
- `npm run build` が通る

**検証コマンド**:
```bash
npm run build
npm run validate:posts
```

---

### Phase 4: 承認対象管理の明確化

**目的**: 「承認」と送ったとき意図しない記事が承認されないようにする

**変更ファイル**:
- `scripts/telegram-ops.mjs`（`jp_approve` ロジック）

**実装内容**:
1. pending が 1件: 現行通り承認（変更なし）
2. pending が 0件: 「承認対象の下書きがありません」（現行通り）
3. pending が **2件以上**: 直近固定採用を廃止し、管理画面誘導メッセージを返す
   ```
   複数の review 待ち記事があります。
   管理画面から承認してください:
   https://aisoukai-media.vercel.app/admin/pending-review
   
   現在 N件:
   ① タイトル1
   ② タイトル2
   ...
   ```

**完了条件**:
- pending 2件以上のとき「承認」と送ると管理画面誘導メッセージが返る
- pending 1件のとき「承認」と送ると承認される（既存動作）
- 明示 `approve <slug>` コマンドは引き続き動作する

**検証コマンド**:
```bash
npm run telegram:ops -- --dry-run  # dry-run でメッセージ内容を確認
```

---

### Phase 5: 重複記事検出と整理 UX

**目的**: 類似記事が溜まる問題を抑制し、溜まった重複を整理できる仕組みを作る

**変更ファイル**:
- `scripts/telegram-ops.mjs`（テーマ候補生成時の重複チェック強化）
- `src/app/admin/pending-review/page.tsx`（重複記事の削除/アーカイブ UI）
- `scripts/request-archive.mjs`（必要に応じて削除機能追加）

**実装内容**:
1. pending 内の重複検出: 管理画面で類似タイトルペアに `⚠️ 重複候補` バッジ
2. 管理画面に「削除」ボタン追加（対象ファイルを `content/posts/_archived/` に退避）
3. 下書き生成時の重複チェック: pending 中の記事も比較対象に含める（現在は公開済み記事のみ）

**完了条件**:
- 管理画面で重複候補が識別できる
- 削除操作でファイルが archived に退避される（`content/posts/` から消える）
- `npm run build` が通る

---

### Phase 6: 検証と運用確認

**目的**: 本番事故を防ぐ最終確認

**検証手順**:
```bash
npm run validate:posts
npm run image:check
npm run build
git status --short
```

**Human Gate**:
- launchd 再登録: `npm run telegram:ops:install` / `npm run ops:mwf:install`
- git push: `git push origin main`

---

## 7. 禁止事項

- `reviewed:false` の公開禁止（絶対）
- AI による自動承認禁止
- Telegram からの承認禁止（Phase 4 移行後）
- `git push` は Human のみ
- launchd の本番変更（install/uninstall）は Human 確認後
- Telegram 本番送信は dry-run または明示許可なしに実行しない
- `.env.local` / `secrets/**` / `*.key` を読まない・出力しない

---

## 8. Human Gate まとめ

| 操作 | タイミング |
|------|----------|
| launchd 再登録 (`--install`) | Phase 1 完了後 |
| 管理画面承認 API のセキュリティ確認 | Phase 3 完了後 |
| `git push origin main` | 全フェーズ完了・build PASS 後 |

---

*このドキュメントは実装の正本です。変更が生じた場合はこのファイルを先に更新してください。*
