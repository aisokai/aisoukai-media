# MWF 本番 authority

先生承認: teacher_20260914_explicit_server_side_blog_authority_no_secret_replication。

Mac は既存 gh 内部認証で固定 repository/main に閉じた request artifact と、レビュー済み固定 hash の metadata inventory だけを作成できる。`/api/mwf` は request ID の wake/status 用で、本文・URL・PASS 判定・署名を入力にしない。公開 caller の情報から publish しない。

POST は JSON content type、最大256文字、requestId 一項目。Origin がある場合は固定本番 origin のみ、cross-site は拒否する。固定 canonical の request schema/path/slot/topic version/原稿 hash/保全 anchor を検証した後、server 乱数 owner を含む署名 claim を GitHub CAS で保存する。同じ semantic operation/topic version の別 ID replay も再課金しない。started/unknown/done は自動再課金しない。設定が将来追加されても旧 unavailable claim を自動再実行しない。

本番は既存 GITHUB_REVIEW_TOKEN と ADMIN_REVIEW_COOKIE_SECRET を内部利用する。Mac はこの鍵を保持しない。OPENAI_API_KEY が本番に存在するときだけ実際の独立 reviewer が動く。Mac が作った review PASS を署名材料にしない。provider 前後で現行採用、比較集合、原稿 version、claim owner を検証し、原稿変更と結果 claim を一括 CAS する。

旧54記事は Buffer のまま opaque hash を検証し、明示 allowlist の title/excerpt/category/source_topic_id だけ抽出する。保全済み anchor は固定値で、8 local-only と4 quarantine を任意 request から省略できない。現行追加と署名済み比較履歴を合成し、削除された比較根拠も残す。新生成原稿だけ deterministic slot/topic path と closed frontmatter を先に検証し、hash が違う bytes を YAML decode しない。review は検証済み bytes snapshot を使う。

本番 reflection は exact canonical bytes と deployed bytes を照合する。pending 原稿は同じ admin 一件 mapper に通し、slug/contentVersion/非 reject を確認する。公開通知は JST 日付、画像、採用、実 path を含む共通公開条件に従う。旧全記事を admin helper で読み直して反映証明を作らない。

GET diagnostics は adoption 件数、reviewer 設定の有無、anchor、状態のみを返し、秘密値・記事本文・題名を返さない。過去に未確認だった本番 AI 設定と真正な新方式採用証跡について、2026-09-15 のローカル検証では現在状態を実測していない。コード配線の完成と実運用の公開成功を区別する。

テストは合成 Git/API/provider、ローカル file protocol の bare Git のみ。実 API、記事読取、secret 設定、push/deploy/job 更新は worker 検証に含めない。
