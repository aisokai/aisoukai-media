# 医院メディアAI自動化システム 詳細設計書

- 作成日: 2026-06-11
- 対象repo: aisoukai-media
- 状態: 設計のみ（本ドキュメントは実装を伴わない）
- 関連: [media-automation-human-gate.md](./media-automation-human-gate.md) / [gmb-review-automation-plan.md](./gmb-review-automation-plan.md)

---

## 0. 設計の最上位原則

1. **最終ゴールは完全自律型。** 先生は常時作業者ではなく、例外時の判断者。
2. **AIの担当領域は可能な限り広く取る。** 「公開後に修正・削除・撤回できるもの」は原則AIが自走してよい（事後通知＋事後修正で運用）。
3. **Human Gate必須は以下のみに絞る:**
   - git push / deploy
   - データ削除・既存データ上書き（破壊的操作）
   - 秘密情報（APIキー・認証情報）の操作
   - 課金・契約
   - 本番公開設定の変更（gate_policy自体の変更を含む）
   - 取り消し不能な重大外部送信（LINE公式一斉配信など、受信者側から消せないもの）
4. **AI推論は最小化する。** AIが自由判断するのは「文章生成」「返信案生成」のみ。投稿可否・push可否・deploy可否・Gate判定は固定ルール（enum＋表引き）で決める。
5. 医療広告・医療法務表現は**警告・レビュー対象だが開発停止ブロッカーにしない**。指摘があれば事後修正できる前提で、過剰に止めない。
6. 失敗時は全体停止せず、**該当jobのみ failed** にする。
7. 秘密値はログ・JSON・Markdownに絶対出さない。`.env.local` は読み込む設計でよいが、中身を表示・記録しない。

> **既存ルールとの整合について（重要）**
> 現行 `AGENTS.md` には「Telegram からの approve / publish 禁止」「publish API 実装禁止」等の保守的ルールがある。本設計の channel別 auto mode（後述）を有効化する段階で、先生の明示判断により `AGENTS.md` の該当条項を改訂する必要がある。**この改訂自体が「本番公開設定の変更」= Human Gate対象**であり、改訂されるまでは現行ルールが優先される。

---

## 1. システム全体像

### 1.1 何を自動化するか（AI自走領域）

- 制作指示の受付・分類（Telegram / 将来 LINE WORKS）
- 全媒体向け下書き生成（ブログ / SNS / GMB / 緊急お知らせ / 院内掲示）
- 口コミの定期取得・新規検出・分類・返信案生成
- queue管理（status遷移、validate、一覧、通知）
- Obsidian / logs への実行記録
- **段階導入後**: GMB投稿・GMB口コミ返信・X/Instagram投稿の自動実行（いずれも事後修正可能な外部送信のため。channel別 auto mode が ON の場合のみ）

### 1.2 何をHuman Gateに残すか

上記「最上位原則3」の6項目のみ。詳細は [media-automation-human-gate.md](./media-automation-human-gate.md)。

### 1.3 各コンポーネントの役割

| コンポーネント | 役割 |
|---|---|
| Mac mini | 常時稼働ノード。launchdで watcher / queue処理 / 定期チェックを実行 |
| GitHub | コード・コンテンツの正本。push/deployは先生のみ |
| aisoukai-media (このrepo) | queue・generator・validator・adapter・Telegram opsの実装本体 |
| Obsidian / mybrain | 実行ログ・投稿履歴・口コミ返信履歴・Human Gate履歴の人間可読アーカイブ |
| Telegram | 制作指示受付、承認/差し戻し、review待ち通知、緊急指示の入口 |
| LINE WORKS | 将来: 院内向け通知・制作指示受付（v0は設計のみ） |
| GMB (Google Business Profile) | 投稿・口コミの外部チャネル。API経由で読み書き |
| MitaniOS / AI司令塔 | queue状態・承認待ち・実行履歴・リスク別タスクの表示と監視 |

### 1.4 aisoukai-media が担う範囲 / 将来分離すべき範囲

- **担う範囲**: ブログ・SNSドラフト・media queue・各generator・Telegram ops・GMBドラフト生成
- **将来独立repoへ分離すべき範囲**:
  - GMB API クライアント＋review watcher（認証情報を持つ常駐プロセスのため、公開メディアrepoから分離が望ましい）
  - LINE WORKS Bot（同上）
  - MitaniOS連携層（複数repoを横断監視するため、本repoに置くと依存が逆転する）
- 分離までは `scripts/media/` 配下に閉じて実装し、importの向きを「repo本体 → media層」一方向に保つ。

---

## 2. メディア別機能

| 媒体 | 機能 | 出力先 | 外部送信 |
|---|---|---|---|
| ブログ | 既存フロー（article:manual / scheduled / auto-review）を継続利用 | content/posts | push経由（Gate） |
| SNS (Instagram/X/LINE公式) | ブログからの横展開下書き、緊急案内の媒体別文面 | content/sns-drafts | X/Instagram: 段階的にauto可。LINE公式: Gate |
| GMB投稿 | お知らせ/休診/時間変更/キャンペーン/ブログ紹介/啓発/訪問歯科 | content/gmb-drafts | 段階的にauto可（投稿は編集・削除可能） |
| GMB口コミ返信 | 1日1回チェック、新規検出、分類、返信案、段階的自動返信 | content/gmb-reviews | 段階的にauto可（返信は編集・削除可能） |
| Telegram | 指示受付・通知・承認/差し戻し | data/telegram-session.json, logs | 内部通知: auto |
| LINE WORKS | 院内通知・指示受付（将来） | content/lineworks-requests | 院内通知: auto候補 / v0は設計のみ |
| Webサイトお知らせ | 緊急案内のサイト掲載文 | content/emergency-drafts | 本番反映はpush/deploy経由（Gate） |
| 院内掲示文 | 印刷用A4文面 | content/emergency-drafts | 外部送信なし（auto） |
| Obsidian | 全履歴の記録 | mybrain vault | 外部送信なし（auto） |

---

## 3. 投稿タイプ分類（固定enum）

`type` は以下の固定enumのみ。AIによる新type発明は禁止。

```
blog_article              ブログ記事（既存フロー）
sns_repurpose             ブログ→SNS横展開下書き
gmb_update                GMB通常投稿（お知らせ・啓発・訪問歯科案内）
gmb_emergency_notice      GMB緊急投稿（休診・障害）
gmb_campaign              GMBキャンペーン投稿
temporary_closure_notice  急な休診案内（全媒体展開）
schedule_change_notice    診療時間変更案内（全媒体展開）
review_reply              GMB口コミ返信
internal_notice           院内向け通知（掲示文・LINE WORKS院内）
lineworks_instruction     LINE WORKS経由の制作指示
telegram_instruction      Telegram経由の制作指示
```

`target_channels` も固定enum: `blog | instagram | x | line_official | gmb | website_notice | internal_print | lineworks_internal | telegram_internal | obsidian`

---

## 4. Media Queue設計

### 4.1 queue item 共通フィールド（media_job.schema.json）

```jsonc
{
  "id": "mj-20260611-001",            // mj-YYYYMMDD-連番。生成後不変
  "type": "gmb_emergency_notice",     // §3の固定enum
  "source": "telegram",               // telegram | lineworks | cron | blog | manual | watcher
  "source_text": "本日午後休診",       // 元指示の原文（秘密値を含めない）
  "target_channels": ["gmb", "website_notice", "internal_print"],
  "status": "draft_generated",        // §5の固定enum
  "risk_level": "low",                // low | medium | high（ルールベース判定）
  "gate_policy": "auto_after_notify", // §6参照。表引きで決定、AIは変更不可
  "created_at": "2026-06-11T09:00:00+09:00",
  "updated_at": "2026-06-11T09:01:00+09:00",
  "approved_by": null,                // human:先生 | auto:policy名 | null
  "approved_at": null,
  "executed_at": null,
  "output_paths": ["content/emergency-drafts/2026-06-11-closure.md"],
  "external_result": null,            // 投稿ID・返信IDなど。秘密値はredact
  "error": null,
  "retry_count": 0
}
```

- 保存先: `content/media-queue/<id>.json`（1 job = 1ファイル、append-only運用）
- 既存jobファイルの**上書き更新は status / updated_at / approved_* / executed_at / external_result / error / retry_count のみ**。他フィールドはimmutable。
- 変更履歴は `logs/media-automation.jsonl` に1行1イベントで追記（編集はしない）。

### 4.2 status設計（固定enum・遷移は固定表）

```
draft_requested → draft_generated → review_pending → approved → scheduled → executed → archived
                                  ↘ rejected（→ draft_requested に差し戻し可）
                                  ↘ human_required（Gate対象 or high risk検出時）
任意状態 → failed（retry_count++ で draft_requested or scheduled に復帰可、上限3回）
```

許可される遷移以外は validator がエラーにする。AIが遷移ルールを「解釈」する余地をなくす。

- `gate_policy: auto_after_notify` の job は `draft_generated → approved(auto) → executed` を**人を待たずに**進む（実行後にTelegram通知）。
- `gate_policy: human_gate` の job は `review_pending` で必ず停止し、先生の `/approve` でのみ進む。

---

## 5. Human Gate設計（要約）

詳細表は [media-automation-human-gate.md](./media-automation-human-gate.md)。設計判断の核心のみ示す。

### 5.1 gate_policy（固定enum・表引き）

| gate_policy | 意味 |
|---|---|
| `auto` | 完全自動。通知も不要（ログのみ） |
| `auto_after_notify` | 自動実行し、実行後にTelegramへ事後通知。先生は事後修正可能 |
| `auto_when_enabled` | channel別 auto mode フラグがONなら auto_after_notify、OFFなら human_gate |
| `human_gate` | 先生承認まで実行しない |
| `forbidden` | システムから実行不可（push/deploy/削除/課金など） |

### 5.2 判定は固定表（type × channel → gate_policy）

判定表は `docs/media-automation-human-gate.md` の表が正本。コード上は定数テーブルとして実装する。**AIは表を参照するだけで、判定しない。**

### 5.3 auto mode の段階導入

- channel別フラグ `config/media-gate.json`（例: `{"gmb_post_auto": false, "gmb_reply_auto": false, "x_auto": false, ...}`）
- **このファイルの変更 = 本番公開設定変更 = Human Gate**。先生が編集し、git管理する。
- 初期値は全てOFF（= 全外部送信が human_gate）。安定運用を確認した媒体から先生がONにしていく。
- ONになった媒体は「実行→事後通知→必要なら事後修正」のループに移行し、承認待ちが消える。

---

## 6. GMB投稿設計

### 6.1 投稿タイプ（固定テンプレート）

| テンプレ | type | 文字数目安 | 備考 |
|---|---|---|---|
| お知らせ | gmb_update | 〜300字 | 汎用 |
| 休診案内 | gmb_emergency_notice | 〜200字 | 日付・時間帯・再開日を変数化 |
| 診療時間変更 | gmb_emergency_notice | 〜200字 | 変更前後を明記 |
| キャンペーン | gmb_campaign | 〜300字 | 医療広告ガイドライン警告チェック必須 |
| ブログ記事紹介 | gmb_update | 〜250字＋URL | 記事frontmatterから生成 |
| 口腔ケア啓発 | gmb_update | 〜300字 | 月次ネタはtopic候補から |
| 訪問歯科案内 | gmb_update | 〜300字 | 定型 |

テンプレートは `scripts/media/templates/gmb/*.md` に固定文＋変数プレースホルダで置く。AIは変数部分の文章補正のみ行う。

### 6.2 段階導入

- **v0**: 下書き生成のみ。`content/gmb-drafts/` にJSON+Markdown保存、Telegram通知。外部投稿なし。
- **v1**: Telegram承認後に投稿可能。実行は先生の明示コマンド（`/gmb post <id>`）。
- **v2**: 休診案内など定型文は `gmb_post_auto: true` で自動投稿（事後通知）。GMB投稿は管理画面・APIから編集・削除可能なため、自動化適性が高い。
- **v3**: 全GMB投稿タイプを auto_after_notify 化（キャンペーンのみ医療広告警告がある場合 human_required に落とす）。

---

## 7. GMB口コミ返信設計（要約）

詳細は [gmb-review-automation-plan.md](./gmb-review-automation-plan.md)。

- 1日1回launchdでwatcher実行 → 口コミ一覧取得 → 処理済みreview idと差分 → 新規をrating/text有無/NGキーワードで**ルールベース分類** → low riskは返信案生成、high riskはTelegramへ確認依頼。
- v0は返信案のみ。v1で承認後返信、v2で星5定型自動返信、v3で通常返信の自動送信（`gmb_reply_auto: true` 時、事後通知）、v4で先生承認済みルール内は完全自動。
- GMB返信は**後から編集・削除できる**ため、本設計の「公開後修正可能 = AI自走可」の典型対象。high risk（低評価・医療内容言及・個人情報らしき記述）のみ human_required に残す。

---

## 8. 緊急お知らせ設計（temporary_closure_notice / schedule_change_notice）

### 8.1 入力例

- 「本日午後休診」「台風のため本日の午後診療を休診」「電話回線不具合」「院長急用で診療時間変更」「訪問診療スケジュール変更」

### 8.2 処理フロー

1. Telegram `/notice <本文>` で受付 → queue item生成（type判定はキーワード表: 「休診」→closure、「時間変更/変更」→schedule_change、その他→gmb_emergency_notice）
2. **1入力 → 全媒体向け文面を一括生成**: Webサイトお知らせ / GMB投稿案 / LINE公式案 / Instagram・X案 / 院内掲示文（A4印刷用）/ LINE WORKS院内通知文
3. `content/emergency-drafts/<id>/` に媒体別ファイルで保存
4. Telegramに全文面をまとめて通知

### 8.3 段階導入

- **v0**: 生成・保存・Telegram通知のみ。外部投稿なし。
- **v1**: Telegram承認ボタン → 承認後、auto modeがONの媒体（GMB等）へ反映。Webサイト反映はpushが必要なためGateのまま。
- **v2**: 緊急性が高くリスクが低い定型（休診案内）は、GMB・院内系を auto_after_notify で即時展開。**緊急時こそ承認待ちが実害になる**ため、自動化優先度は高い。

---

## 9. Telegram / LINE WORKS 指示受付設計

### 9.1 Telegram（既存 telegram:ops を拡張）

既存の自然文ルーティング（telegram-request-routing.mjs）は維持し、明示コマンドを追加する。**コマンドは固定allowlist**:

```
/notice <本文>     緊急お知らせ生成
/gmb <本文>        GMB投稿下書き生成
/gmb post <id>     GMB投稿実行（v1。auto mode OFF時の明示実行）
/review            未返信口コミ一覧
/sns <slug>        ブログ記事からSNS横展開生成
/status            queue状態サマリ
/approve <id>      承認
/reject <id> <理由> 差し戻し
```

- allowlist外の入力は既存ルーティング（記事リクエスト扱い）へフォールバック。
- 承認操作は `TELEGRAM_ALLOWED_CHAT_IDS` 制限を継続。

### 9.2 LINE WORKS

- **v0**: 設計のみ。API認証情報は `.env.local` 管理（中身は読まない・記録しない）。
- **v1**: Botで指示受信 → `content/lineworks-requests/` に保存 → queue item化（受信・下書き生成は自動）。
- **v2**: 院内向け通知送信（院内限定・低害のため `auto_after_notify` 候補）。
- **v3**: 承認フロー連携（Telegramと同等の /approve 相当）。

---

## 10. 推論最小化設計

AIの自由判断を排除するための具体策:

1. job type / target_channel / status / risk_level / gate_policy は**固定enum**。validatorがenum外を拒否。
2. Gate判定は**固定表の表引き**。AIは判定に関与しない。
3. risk_level は**ルールベース**: rating値・本文有無・NGキーワード辞書・文字数・媒体で機械判定。
4. 口コミ分類は最初は rating / text有無 / keyword のみ。AI分類は導入しない。
5. 返信文・投稿文は**テンプレート＋変数**が骨格。AIは変数部の短い文章補正のみ。
6. 媒体別文字数制限は adapter 層の定数（Instagram 2200 / X 280相当 / GMB 1500 / LINE 500目安）。超過は機械的に切り詰めず failed にして再生成。
7. 失敗時対応は固定: 該当job failed → retry_count++ → 3回で human_required。
8. 実行可能アクションは **allowlist**（generate_draft / validate / notify_telegram / save_obsidian / gmb_post / gmb_reply / status_transition のみ）。
9. 生成AIの出力契約は `{ "draft_text": "..." }` のみ。投稿可否・push可否・deploy可否はAIの出力に存在しない。
10. プロンプトには「あなたは文章のみ返す。実行判断はしない」を固定で埋め込む。

---

## 11. データ構造と保存場所

```
content/media-queue/            queue item JSON（1 job 1ファイル）
content/sns-drafts/             既存。SNS横展開下書き
content/gmb-drafts/             GMB投稿下書き（JSON+Markdown）
content/gmb-reviews/            口コミスナップショット・返信案・処理済みID台帳
content/emergency-drafts/       緊急お知らせ媒体別文面
content/lineworks-requests/     LINE WORKS受信指示
config/media-gate.json          channel別 auto modeフラグ（変更はHuman Gate）
logs/media-automation.jsonl     全イベントログ（append-only）
logs/gmb-review-watcher.log     watcher実行ログ
logs/media-execution.log        外部実行ログ（投稿ID・返信ID記録）
docs/media-automation-system-plan.md
docs/media-automation-human-gate.md
docs/gmb-review-automation-plan.md
```

JSON Schema（`schemas/` 配下に作成予定）:

- `media_job.schema.json` … §4.1
- `gmb_review.schema.json` … review id / rating / text / detected_at / processed
- `gmb_reply_draft.schema.json` … review_id / template_id / draft_text / risk / gate_policy
- `gmb_post_draft.schema.json` … type / template_id / draft_text / cta / url
- `emergency_notice.schema.json` … input_text / notice_type / channel別draft / 期間

Obsidian記録: 1日1ファイル `mybrain/media-automation/YYYY-MM-DD.md` に実行ログ要約・投稿履歴・返信履歴・Gate履歴を追記（既存ファイル削除はしない）。

---

## 12. 実装Batch計画

各BatchはClaude Codeが /goal 1回で走り切れるサイズに分割。

| Batch | 内容 | 外部送信 |
|---|---|---|
| 1 | Media Queue schema + validator + status/list系npm script | なし |
| 2 | emergency notice draft generator（1入力→全媒体文面） | Telegram通知のみ（既存安全モード） |
| 3 | SNS repurpose generator + review待ち一覧 | なし |
| 4 | GMB draft generator（投稿しない） | なし |
| 5 | GMB account/location discovery（認証情報は扱わない。手順設計＋接続テストは先生承認後） | なし |
| 6 | GMB review watcher v0（取得・検出・返信案・Telegram通知。API返信なし） | 読み取りのみ |
| 7 | GMB reply apply v1（承認後返信。先生明示コマンド） | あり(Gate) |
| 8 | low risk auto reply（星5本文なし定型。dry-run→先生承認後apply） | あり(段階) |
| 9 | LINE WORKS instruction intake（受信・下書きのみ） | なし |
| 10 | MitaniOS/AI司令塔連携（queue status / 承認待ち / 実行履歴表示） | なし |
| 11 | launchd整備（1日1回watcher / 3分おきtelegram ops / ログローテ / health check） | なし |
| 12 | 運用ドキュメント（先生向けコマンド表 / 緊急停止 / rollback手順） | なし |

---

## 13. npm scripts案（設計のみ）

```
media:queue:status        queue全体のstatus別集計
media:queue:validate      schema validate（enum・遷移チェック）
media:queue:list          一覧（--status, --type フィルタ）
media:notice:draft        緊急お知らせ生成
media:sns:draft           SNS横展開生成
media:gmb:draft           GMB投稿下書き生成
media:gmb:reviews:check   口コミ取得・新規検出
media:gmb:reviews:dry-run 返信案生成（送信なし）
media:gmb:reviews:notify  Telegram確認通知
media:gmb:reply:apply     返信実行（Gate or auto mode）
media:lineworks:status    LINE WORKS連携状態
media:health              watcher/launchd/ログのhealth check
media:logs                直近イベントログ表示
```

---

## 14. Rollback / Safety

- 外部投稿前に必ず dry-run パスを通す（`--apply` なしがデフォルトで dry-run。既存telegram-opsと同じ規約）。
- GMB投稿ID・返信IDを `logs/media-execution.log` と queue item の `external_result` に保存 → 事後修正・削除の対象特定を保証。
- GMB返信の削除方法（API: `reviews.deleteReply` / 管理画面手順）を運用ドキュメントに明記。
- queue item は immutable log（`logs/media-automation.jsonl`）に全遷移を残す。applied後の編集も新イベントとして追記。
- 一時ファイルは `tmp/` に閉じ、ジョブ完了時に削除（content/配下の成果物は削除しない）。
- `.env.local` は gitignore 維持。APIレスポンス保存時に token / key / email らしき値を redact してから書き込む（redact関数を共通lib化）。
- ログ出力前に秘密値パターン（`sk-`, `AIza`, `Bearer `, 長いbase64等）をマスクする共通フィルタを通す。
- 緊急停止: `config/media-gate.json` の全フラグをOFF + launchd unload で全自動実行が停止する設計（kill switchを1箇所に集約）。

---

## 15. 実装エージェントの役割

| エージェント | 役割 |
|---|---|
| Claude Code | 実装・docs作成・validator・generator・テスト |
| Codex | read-onlyレビュー・safetyレビュー・API誤用チェック |
| AI司令塔 | queue監視・task分配・Human Gate管理・auto mode下の実行トリガ |
| Telegram ops | 先生への通知・承認/差し戻し受付・明示コマンド実行 |
| MitaniOS | 状態表示（queue / 承認待ち / 実行履歴 / リスク別タスク） |

---

## 16. 次に実装すべきBatch（1つだけ）

**推奨: Batch 1（Media Queue schema + validator）**

理由:

1. Batch 2以降のすべてのgenerator（緊急お知らせ・SNS・GMB・口コミ返信）が queue item を生成する。schemaとvalidatorが先にないと、各Batchが独自フォーマットを発明してしまい、後から統合コストが発生する。
2. 推論最小化の中核（固定enum・固定遷移表・gate_policy表引き）はすべてschema＋validatorで強制される。**ここが先にあることで、以降のBatchでAIの自由判断が構造的に入り込めなくなる。**
3. 外部送信ゼロ・既存コード変更ゼロで完結し、リスクが最も低い。既存の `validate-sns-drafts.mjs` / `lib/sns-drafts.mjs` のパターンを踏襲できるため実装も速い。

Batch 2（emergency notice generator）は実用価値が最も高いが、queue schemaの上に乗せるべきであり、2番手とする。
