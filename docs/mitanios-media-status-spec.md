# MitaniOS / AI司令塔 連携仕様 — media-status.json

- 作成日: 2026-06-11
- 目的: mitanios-gui に「メディア運用」カードを追加するためのデータ仕様(Phase 6)
- 連携方式: **静的JSONの同期コピー**(ai-project-command-center の `projects.json` と同じパターン)。UIから実プロジェクトフォルダは読まない・実行しない(mitaniOS Blueprint v1 準拠)

## データフロー

```
aisoukai-media (Mac mini, launchd 21:00)
  └ npm run media:export:status → data/media-status.json
       └ 先生 or 同期スクリプトが mitanios-gui/data/ へコピー
            └ mitanios-gui 「メディア運用」カードが表示
```

## media-status.json スキーマ

```jsonc
{
  "generated_at": "2026-06-11T21:00:00+09:00",
  "source": "aisoukai-media/scripts/export-status-json.mjs",
  "counts": {
    "queue_total": 12, "review_pending": 7, "human_required": 3, "failed": 0,
    "sns_drafts": 0, "gmb_drafts": 2, "gmb_reply_drafts": 6,
    "emergency_drafts": 1, "lineworks_requests": 1, "by_status": { "...": 0 }
  },
  "flags": { "telegram_media_approve": false, "gmb_post_auto": false, "...": false },
  "pending": [
    { "id": "mj-...", "type": "review_reply", "status": "human_required",
      "risk_level": "high", "gate_policy": "human_gate",
      "created_at": "...", "summary": "review ... (マスク済み・80字以内)" }
  ],
  "recent_events": [ { "ts": "...", "event": "job_approved", "job_id": "mj-..." } ]
}
```

- 秘密値・口コミ原文(raw_text)は**含まれない**(summaryはマスク済み・80字制限)
- カード表示推奨項目: 承認待ち件数(review_pending + human_required) / failed件数 / 最終生成時刻(generated_at) / フラグON一覧

## mitanios-gui 側の実装方針 (別repoタスク)

1. `data/media-status.json` を bundled データとして読む(なければ「未同期」表示)
2. カード: 「🏥 メディア運用」— 承認待ちN件(human_required は赤) / failed N件 / 最終更新
3. クリックで pending 一覧をモーダル表示(表示のみ。承認操作はTelegram/CLIで行う — UIから実行しない原則を維持)
