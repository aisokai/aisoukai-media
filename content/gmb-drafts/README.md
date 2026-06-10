# GMB Drafts

Google Business Profile 投稿の下書き置き場 (JSON + Markdown)。

- 生成: `npm run media:gmb:draft -- --type update --input "本文"`
- 検証: `npm run media:gmb:validate`

GMB APIは呼ばない。external_result は常に null (投稿は別Batch・Human Gate)。
