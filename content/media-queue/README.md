# Media Queue

全メディア投稿・返信・通知の共通queue。1 job = 1 JSONファイル (`mj-*.json`)。

- スキーマ: `schemas/media-job.schema.json`
- 検証: `npm run media:queue:validate`
- 一覧: `npm run media:queue:list`

status / approved_* / executed_at / external_result / error / retry_count 以外は生成後 immutable。
全遷移は `logs/media-automation.jsonl` に append-only で記録される。
外部公開の可否は `config/media-gate.json` の表引きで決まり、AIは判断しない。
