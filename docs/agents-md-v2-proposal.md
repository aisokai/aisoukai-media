# AGENTS.md v2 改訂提案 (差分提示のみ・適用は先生)

- 作成日: 2026-06-11
- 状態: **提案。AGENTS.md本体は未変更。** 先生がこの差分を適用した時点で v2 が発効する。
- 背景: 完全自律型AIシステム計画 Phase 0([実装計画](../../../../.claude/plans/)承認済み)。Telegram承認(/approve)の解禁は先生確認済み。

---

## 改訂の原則

- 解禁するのは **Media Queue item の承認操作のみ**(状態遷移)。ブログ記事のpublish・push・deployは引き続きTelegramから不可。
- 解禁は二重ゲート: ①本改訂の適用(先生) + ②`config/media-gate.json` の `telegram_media_approve: true`(先生)。どちらか欠けると `/approve` は拒否される。

## 差分1: 「絶対禁止」セクション

```diff
- - Telegram からの approve / publish 禁止
+ - Telegram からのブログ記事 approve / publish 禁止
+ - Telegram からの Media Queue 承認 (/approve <mj-id>) は、以下の全条件を満たす場合のみ許可する:
+   - TELEGRAM_ALLOWED_CHAT_IDS に含まれる chat_id / from_id からの操作であること
+   - config/media-gate.json の telegram_media_approve が true であること
+   - 承認対象は content/media-queue/ の queue item の状態遷移のみ (外部実行は別コマンド・別Gate)
+   - publish / push / deploy 系コマンドは引き続き存在しない
```

## 差分2: 「review 運用」セクション

```diff
  - approve / reject は認証済み `/admin/pending-review` の Human 操作、または Human が明示実行する CLI コマンドで行う
+ - Media Queue item の approve / reject は、上記に加えて Telegram の /approve・/reject コマンド (ALLOWED_CHAT_IDS 限定・flag解禁後) でも行える
+ - Media Queue の gate 体系は docs/media-automation-human-gate.md を正本とする
```

## 差分3: 「Telegram」セクション

```diff
  - 通知は digest 優先
- - 通知から approve / publish しない
+ - ブログ記事は通知から approve / publish しない
+ - Media Queue item は /approve <mj-id> による承認を許可する (flag解禁後)。承認は状態遷移のみで、外部送信はGMB apply等の別Gateを通る
  - 件数が多い場合は要約する
```

## 適用手順 (先生)

1. 本提案をレビューし、AGENTS.md に上記差分を反映(編集は先生)
2. commit (例: `docs: AGENTS.md v2 — allow gated media-queue approval via Telegram`)
3. `config/media-gate.json` の `telegram_media_approve` を `true` に変更して commit
4. 以後、Telegramの `/approve mj-...` が有効になる

## 適用しない場合

実装済みの `/approve` はフラグOFFのまま「未解禁」応答を返すだけで、何も実行されない。現行運用に影響なし。
