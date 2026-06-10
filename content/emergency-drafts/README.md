# Emergency Drafts

急な休診・診療時間変更などの緊急お知らせ下書き。1件 = 1ディレクトリ (`mj-*/`)。

- 生成: `npm run media:notice:draft -- --input "本日午後休診"`
- 検証: `npm run media:notice:validate`

各ディレクトリには媒体別文面 (`website_notice.md` / `gmb.md` / `line_official.md` /
`instagram.md` / `x.md` / `internal_print.md`) と `notice.json` が入る。
外部投稿はHuman Gate。ここにあるのは下書きのみ。
