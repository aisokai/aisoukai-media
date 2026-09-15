# MWF 独立ローカル検証 — 2026-09-15

## 対象と現在状態

worktree `02d7/aisoukai-media` の初期 HEAD `21728ac` に、後継 `1e4841a` の復旧実装47 path を所有範囲内で取り込んだ。旧 task 本文は回収していない。別系統の release `bbdc161` は古い authoring 構成を含むため全体を上書きしていない。同 release 固有の retired CLI テストも現行実装と不一致のため採用しない。

今回の追加修正:

- MWF 原稿と審査済み原稿を一行 JSON scalar の YAML で出力し、長文折り返し／apostrophe により closed envelope と metadata 読取が失敗する問題を修正。
- `date` と `publish_at` を独立判定し、どちらかが未来なら公開と minor baseline 利用を除外。
- 旧 installer の開発 checkout と `--force` を廃止し、reviewed SHA、manifest digest／各ファイル hash、clean release、Asia/Tokyo と既存 job 非実行を検証する限定 installer に更新。旧 plist は保全し、失敗時に復元。導入や即時起動は未実施。
- テストコマンドに server/minor/inventory の検証を追加し、古い未実装・環境確定の説明を訂正。

canonical main は観測時 `ahead 8, behind 6` で dirty 変更あり。canonical、旧 worktrees、content/data は変更していない。本 worktree の集約内容をそのまま remote main に push しない。別実行段階で fetched main に意図した変更だけを統合し、保全すべき既存記事・承認・却下・archived・dirty を維持した release を再レビューする。

## ローカル検証

実行コマンド（scrubbed environment、ネットワーク操作は mock/local Git fixture）:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/tmp node --test tests/mwf-*.test.mjs tests/tiered-publication.test.mjs tests/ops-mwf.test.mjs tests/scheduled-article-flow.test.mjs tests/setup-launchd-mwf-cleanup.test.mjs tests/dmp-final-flow.test.mjs tests/post-publication-status.test.mjs
```

修正後90 tests PASS。変更／追加の `.mjs`、`.ts`、`.tsx` に ESLint を実行して PASS。`git diff --check` PASS。browser は表示 markup/layout の変更がなく N/A（actions、API、共通状態判定、CLI の変更）。

build は `/tmp/mwf-02d7-build-di2ikfqk` に source/scripts/config/依存設定のみを複製し、空の content/posts・data・public/images を作成した隔離環境で実行。既存 dependencies を利用し、.env は複製・読取しない。

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/tmp NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SITE_URL=https://safe-validation.invalid node node_modules/next/dist/bin/next build --webpack
```

Next 16.2.6 webpack compile、TypeScript、25 static pages は PASS。実記事を含む本番 build の証拠ではない。ログは `/tmp/mwf-02d7-worker-tests.log`、`/tmp/mwf-02d7-worker-lint.log`、`/tmp/mwf-02d7-worker-build.log`。

## 検証中の境界逸脱と修正

初回の拡大テストで、事前に helper を確認せず `tests/dmp-final-flow.test.mjs` を実 repository cwd で実行した。旧 `currentHumanApprovedPosts()` は `content/posts/*.md` を read/parse してから approval を絞り込む実装であり、二つのテストがこれを呼んだ。これは今回の synthetic-only 宣言に反する実 editorial data の読取である。初回コマンドは上記と同じ引数だったが、修正前の helper を実行した（その回は1失敗）。

記事本文の出力、記事の変更、外部送信は確認されず、helper は .env を読まない。保護情報が原稿内にあったかは未確認であり、確認のため本文を再読しない。この履歴を「実データ読取なし」と扱わない。発見直後に manager/reviewer へ報告し、helper を合成 Human 承認 fixture に置換。以降の同コマンドは実記事を読まず90件 PASS。現在の安全な成果物と、この実行境界逸脱を区別して判定する。

## 本番復旧の残件 — 全て未実測

1. 最新 remote main に必要なコード差分を限定統合し、依存設定を含む path/hash 昇順 manifest と独立レビュー、7 gates を確定。`teacher_approved_blog_operations` の正確な operation 集合／実行 flags／manifest hash を持つ別実行段階を pre-create と completion checkpoint で検証する。
2. code push と production deploy だけの段階で remote SHA、固定 Vercel project/team、実 deployed source を確認。コード導入を記事公開・通知と混同しない。
3. 固定 runner root に同一 reviewed release を準備し、既存 `MWF_RUNNER_VERSION` は生成 plist の非秘密値で供給。`ops:mwf:install -- --commit … --manifest … --manifest-sha256 …` と `ops:mwf:job-status` で既存 MWF job の登録を確認。秘密値を取得・変更・複製しない。
4. 本番の認証済み metadata diagnostics で reviewer 設定の有無、真正な topic adoption、inventory anchor、既存 runner auth、release identity を確認する。過去に未確認だった設定を「現在なし」と断定しない。54件／8 local-only／4 quarantine の保全 anchor はコード上の必須条件であり、本 task では原本保全を再実測していない。
5. 生成・独立審査・通知・公開を含める場合、それぞれの operation と non-sensitive editorial runtime の real_data_access を正確に宣言。既存 MWF slot の一件について、生成ID → durable artifact hash → main同期SHA → canonical/deployed同一bytesとadmin mapper → 独立審査証跡 → 共通公開条件 → 通知受理を段階ごとに計測する。記事ごとの未確定・重要・不採用は保留し、一括公開しない。
6. minor は真正な署名 Human baseline と不変 proposal、医療意味不変の独立審査を要する。legacy reviewed/auto_approved や汎用 PASS で代替しない。既存署名 provenance が確認できなければ原稿を維持して Human review 対象とする。

現在確認したのはローカル実装と合成検証まで。新規生成、耐久保存、本番同期、admin反映、実独立審査、条件付き公開、通知、次の予定実行の業務成功は本 task では一件も実測していない。push/deploy/job実行/AI/通知は実行していない。
