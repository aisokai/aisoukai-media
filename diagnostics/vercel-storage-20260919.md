# Vercel Functions Storage 診断・ローカル最適化（2026-09-19）

## ローカル最適化の実装（追加承認後）

先生の最適化指示を受け、同じ可視タスク内で最新source `6ab843997ff8ebdc0972a32508dc5fc781634e43` から `codex/function-storage-optimization-20260919` に移行して修正した。fetch後は当初本番 `d1a6874f4350d1696670e44bf17dafaefcd976ad` がancestorであることをManagerが確認した。以下の初回診断の「object不在」は当時の調査記録であり、現在のsource取得状況とは区別する。本番traceのprovenance/bytesは未確認のまま。

- 新helper `src/lib/deployedPostFile.mjs` は許可済み記事path形式を確認し、静的 `content/posts` prefixとfilenameからdeployed articleを読む。
- `src/lib/mwfServerRuntime.ts` のrestore-reflectと通常reflect、および `src/app/admin/pending-review/mwf-receipt/route.ts` をhelperへ接続。元のhash一致、canonical source、署名、server authority、認証、公開gateは維持。
- **public画像の一律除外は実施しない。** 最新 `src/lib/tieredPublication.mjs:81` は実画像bytesのhashを署名証拠と照合しており、画像をなくすと公開gateを壊す。next.configのtracing除外も追加していない。
- state-only deployment抑制は別ownership workerが `vercel.json` と `scripts/vercel-ignore-state-only.mjs` に実装。production/mainに限り、最後の成功deployment SHAからHEADまでの実際のtree差分が通常ファイル100644の `data/mwf/{requests,claims}/<64hex>.json` の追加・変更だけならskipする。履歴不明・初回・rollback・削除・mixed・記事・policy/adoption/inventory/proposal変更はbuildする。7件の合成GitテストPASS。署名・CAS・状態commitは維持し、コードがデプロイされるまでは有効にならない。Managerが統合レビューする。レポート本文の過去の未実装案と現在の実装を混同しない。

新規のexact deployed bytes / missing file / traversal等の拒否テストとtrace retentionテストは2/2 PASS。`scripts/measure-function-trace.mjs` は外部通信・runtime実行なしに `/tmp/aisoukai-trace-synthetic-*` へ合成fixtureだけを作成し、既存Nextのcompiled NFTを使う。beforeは削除した動的root-relative read式、afterは実helper sourceで、双方同じ合成article/public/tmp/dataを持つ。

**NFT単体は過大包含を再現しなかった。** beforeは記事を含むfixtureを1件も追跡できず、afterは必要な合成記事18bytesのみを追跡し、無関係なpublic/tmp/dataを含まなかった。これは必要記事のtrace保持の証拠であり、削減量の証拠ではない。ManagerのTurbopack before/after合成Next buildでは過大包含を再現し、必要記事を残した削減を確認した（後述）。実記事・環境値・既存compiled bundle本文をbuildに渡していない。

実行済みworker検証:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node --test tests/deployed-post-file.test.mjs tests/function-trace.test.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node scripts/measure-function-trace.mjs /Users/caelus/projects/aisoukai-media/node_modules/next/dist/compiled/@vercel/nft/index.js
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node node_modules/eslint/bin/eslint.js src/lib/deployedPostFile.mjs src/lib/deployedPostFile.d.mts src/lib/mwfServerRuntime.ts src/app/admin/pending-review/mwf-receipt/route.ts scripts/measure-function-trace.mjs tests/deployed-post-file.test.mjs tests/function-trace.test.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node --check scripts/measure-function-trace.mjs
git diff --check
```

すべてPASS（NFT測定の解釈は上記限定）。Managerは既存合成テスト `mwf-server-authority`, `mwf-admin-receipt`, `mwf-restoration`, `mwf-backfill` を明示envで実行し24/24 PASSと報告した。worker検証時点では実環境のbuild、commit/push/deploy、runner、外部AI・通知の実行はしていない。最終commitはManager終端報告を参照。Managerの追加テスト20件（tiered-publication 11、helper/trace 2、skip 7）もPASSし、既存24件と合わせ44件PASS。worktree全体のTypeScript検証は既存testの `.ts` extension設定で通常 `--noEmit --incremental false` が失敗し、`--allowImportingTsExtensions` を付けた検証はPASS（既存設定問題として区別）。実装段階ではtest/lint/buildは適用対象に変更され、後段の初回診断時N/A gate案は最終gate結果として使用しない。

---

## Turbopack合成buildの再現と測定

Managerが実際の未変更 `tieredPublication.mjs` / `reviewContentFingerprint.mjs` / `csv-parser.mjs` も含む合成fixtureで比較した。主たる測定は画像検証readerをtraceに残したこの比較である。before `/tmp/aisoukai-storage-policy-before-k8palxx9`、after `/tmp/aisoukai-storage-policy-after-jy6ae1ri`。双方Next16.2.6 Turbopack buildとTypeScript検証に成功。beforeにだけwhole-project trace警告が出た。

| 画像検証を含む合成/api/post trace | before | after |
| --- | ---: | ---: |
| bytes | 2,903,516 | 2,615,945 |
| file数 | 114 | 99 |
| missing | 0 | 0 |
| 必要なpublic画像bytes | 1,048,576 | 1,048,576 |
| 必要なcontent bytes | 32 | 32 |
| dependency bytes | 1,443,804 | 1,443,804 |
| data bytes | 1,206 | 182 |

差は **287,571 bytes（9.90%）**。画像・記事・必要dataを保持し、tmp262,144、logs4,096、tests4,096 bytesと無関係data等のroot包含がなくなった。これは同一の合成入力でのtrace参照先サイズ比較であり、本番のサイズや請求額削減率を示さない。image verifierを単に除去して得た値でもない。追加の実FS検証でも、after fixtureの実 `assessTieredPublication` に `{path}` だけを渡し、imageHash/asset/topicを注入せず、元の合成画像は承認、同じpathの1byte差し替えは拒否、元bytesへ復元すると承認となることをManagerが確認した。画像hash・image-library・topicファイルの読み取りが保持されている。復元後の画像サイズ/件数は同一。両fixtureのtrace metadata集計は `/tmp/aisoukai-storage-policy-measurements.json` に保存されている。

ManagerがNext16.2.6のdefault build（Turbopack）で実際の新helperと旧式を比較した。helperのみのfixtureは `/tmp/aisoukai-storage-turbo-contained-before-02l0gt9a` と `/tmp/aisoukai-storage-turbo-contained-after-puvdlnly`。どちらも同じ合成入力、`experimental.cpus:1`、同じinstalled dependencyのローカルCOW copyを使用。beforeだけrepo全体tracingの警告があり、afterにはなかった。manifestのみ解析し、参照先はstatでサイズ確認、compiled bundle本文は読んでいない。

| helperのみの合成/api/post trace | before | after |
| --- | ---: | ---: |
| bytes | 2,883,418 | 1,562,059 |
| file数 | 109 | 96 |
| missing | 0 | 0 |
| 必要なcontent bytes | 32 | 32 |
| dependency bytes | 1,443,804 | 1,443,804 |

差は1,321,359 bytes（45.83%）。synthetic public1,048,576、tmp262,144、logs4,096、tests4,096、data1,024 bytesの不要包含を除去できた。ただしこの最小fixtureにはimage hash verifierが含まれないため、**本番public全体が不要/削減可能であることは示さない**。本番ストレージや請求額の削減率でもない。

build実行コマンド（各fixtureをcwdとして実行）:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin TMPDIR=/tmp NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build
```

最初のdependency symlink方式はTurbopackのroot制約で失敗したため、Managerは既存installed depsだけを合成root内へCOW copyして再実行した。実repo build・環境値読取・外部installは行っていない。

### 合成比較の再実行手順

下記は保存済み**合成fixtureの明示ファイルだけ**から新しい2つの `/tmp` rootを作る再現用recipe。実repoのdata/content/env、既存build出力はコピーしない。dependenciesは既にinstalledの同一ローカルcopyをCOW複製するだけで、install/networkはない。旧fixtureも新fixtureも削除しない。afterだけ実helperを使用し、その他source/合成入力は同一にする。計測はmanifestのfilesとstatのみでcompiled bundle本文は開かない。

```python
from pathlib import Path
import tempfile, shutil, subprocess, json, collections
source = Path('/tmp/aisoukai-storage-policy-before-k8palxx9')
workspace = Path('/Users/caelus/.codex/worktrees/d5f9/aisoukai-media')
files = [
    'package.json', 'next.config.mjs', 'tsconfig.json',
    'app/layout.tsx', 'app/page.tsx', 'app/api/post/route.ts',
    'lib/deployedPostFile.mjs', 'lib/deployedPostFile.d.mts',
    'src/lib/tieredPublication.mjs', 'src/lib/reviewContentFingerprint.mjs',
    'scripts/csv-parser.mjs', 'content/posts/2026-09-19-synthetic.md',
    'public/images/synthetic.bin', 'tmp/synthetic.bin',
    'logs/synthetic.log', 'tests/synthetic.txt', 'data/synthetic.json',
    'data/image-library.json', 'data/article-topics.sample.csv',
]
env = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'TMPDIR': '/tmp',
       'NEXT_TELEMETRY_DISABLED': '1'}
for variant in ['before', 'after']:
    root = Path(tempfile.mkdtemp(prefix='aisoukai-policy-repeat-' + variant + '-', dir='/tmp')).resolve()
    for name in files:
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / name, target)
    if variant == 'after':
        shutil.copyfile(workspace / 'src/lib/deployedPostFile.mjs',
                        root / 'lib/deployedPostFile.mjs')
    subprocess.run(['/bin/cp', '-cR', str(source / 'node_modules'),
                    str(root / 'node_modules')], check=True, env=env)
    subprocess.run(['/opt/homebrew/bin/node', 'node_modules/next/dist/bin/next',
                    'build'], cwd=root, env=env, check=True)
    trace = root / '.next/server/app/api/post/route.js.nft.json'
    paths = {(trace.parent / name).resolve()
             for name in json.loads(trace.read_text())['files']}
    groups = collections.Counter()
    for path in paths:
        groups[path.relative_to(root).parts[0]] += path.stat().st_size
    print(variant, root, len(paths), sum(groups.values()), dict(groups))
```

現時点で実行したのは上記に記録したfixture buildであり、この文書recipeそのものの再実行は不要のため行っていない。将来のdependency/helper変更では同じ数値を保証せず、before/after同一条件と必要ファイル保持を判定する。

統合変更ファイルはruntime、receipt route、新helper/type、新helper/trace testsと測定script、skip用3ファイル、本レポート。`next.config.ts` は未変更。worker検証時点ではcommit未作成。最終commitはManager終端報告を参照。worker検証時のstatusは `codex/function-storage-optimization-20260919...origin/main`、runtime/routeの2 tracked modifications、その他はuntracked。独立reviewと最終gate判定はManagerが行う。

## 初回診断：結論と到達範囲

追加調査で、保存元checkoutの既存Next traceに **public画像128.75 MBとtmp17.01 MBを含む、約152 MBのadmin trace 4件**を確認した。repo全体に及ぶ過大包含がローカルで実在する。さらに9月15日のorigin/mainソースでは、MWF prepare成功経路がrequest・claimed・doneの3回main更新を行い得る。過大なローカルtraceとdeployment増加につながり得るmain更新経路の両方に具体的証拠が得られた。ただしtraceは9月4日の古いローカル成果物で本番SHAとは結び付かず、本番148 MBの正確な内訳・13.33 GBへの寄与率は未確定。一律除外や削除は提案しない。

調査した HEAD は `21728ac7f715378c13ec49ca2147b9457d2bf6d5`（2026-09-05、detached）。先生提供の本番 SHA `d1a6874f4350d1696670e44bf17dafaefcd976ad` はローカル object store に存在しない（`git cat-file -t` が失敗）。本番との差分は未検証。隔離checkout自体は9月5日時点だが、追加調査で9月14〜15日のローカルrefのソースを確認した。この checkout には `/api/mwf` 自体も存在しない。別タスクのcheckoutは調査・変更していない。継続指示に基づき保存元 `/Users/caelus/projects/aisoukai-media` は読み取り専用で追加調査した（詳細は追加調査節）。

この checkout の policy は `aisoukai-media-standard-non-stop-2026-08-18`、AGENTS.md SHA-256 は `03b258fb04b23f451d60c861ea0c792882e14e410c2c53719fc1c2d72b48f588`。起票時の tiered-blog policy と不一致であり、Manager はローカル診断用契約を現物に合わせて検証した。修正・実行権限の拡大はしていない。追加調査で保存元のAGENTS.mdが起票時digestと一致することをManagerが確認し、同一契約のpolicy参照を起票時の正本に戻した。

以下のbaseline節は隔離checkoutを対象にした初回調査であり、保存元・origin/mainの追加証拠は後段に区別して記録する。

## 先生提供の本番メタデータ（独立再取得なし）

- Functions Storage: aisoukai-media 13.33 GB、recruit 7.92 MB、guide-app 0 B。
- Current Production READY: `9YtwTF9wHzWXcZ1DvDK37FFYkrJ7`、上記本番 SHA。
- Resources は82行、多くの blog/admin/error は148 MB、DMP APIは147 MB、`/api/mwf` は130 MB。
- 9月14日以降に増加。9月18日08:31–08:35 JSTに Production deployment 5件。
- UI上の「18」は deployment 件数と確認されていない。DDoS・障害の有無もこの証拠から判定できない。

## 測定できたファイルサイズとソース

`git ls-tree -rl HEAD` の blob サイズだけを集計した。ファイル本文・画像・編集実データは読んでいない。以下は圧縮前 Git blob の論理バイト数であり、本番 bundle サイズでも課金量でもない。

| 対象 | bytes | 補足 |
| --- | ---: | --- |
| public/ | 128,745,698 | 185ファイル、約128.75 MB（122.78 MiB） |
| public/images/library/ | 110,707,159 | 上記の内数、168ファイル |
| content/ | 342,684 | 本文未読 |
| data/ | 798,851 | 内容未読 |
| scripts/ | 886,941 | sourceサイズ集計 |
| その他 | 1,737,777 | 上記以外の tracked blob |

最大の画像 blob は `public/images/library/prevention/bright-clean-studio-product-photography-scene-a.png` の2,139,912 bytes。次は `public/images/library/general/ai-topic-20260511-029-general-b.png` の2,041,773 bytes。public画像履歴の最新は `8ad0b22`（8月27日）；大きな画像群は本調査 baseline では9月14日以前から存在する。後日の tracing 変更で既存画像が混入した可能性は残るが、時系列の因果関係は未検証。

行番号はすべて上記 HEAD に対するもの。

| ソース | 確認事項 | 診断上の意味 |
| --- | --- | --- |
| next.config.ts:3–13 | production は空の設定を返す。専用distDirはdevだけ | baseline に明示的な tracing include/exclude はない。本番設定は未確認 |
| package.json dependencies | Next 16.2.6、OpenAI・Anthropic SDK、remark等を宣言 | インストール済み依存サイズ・bundleへの包含量は未測定。宣言だけでSDKを原因にしない |
| src/lib/posts.ts:9,49–62,152–158,202–204 | cwd/content/posts配下を列挙・読み取り | ローカル記事fallbackに必要なファイル。contentの一律除外は危険 |
| src/lib/adminPosts.ts:27,71–75,91–106 | 同じ記事ディレクトリを管理画面で利用 | admin動作も除外前の検証対象 |
| src/lib/articleTopics.ts:62,157,182 | topic CSVをlocal fallbackで読み取り | data全体の一律除外は避ける |
| src/app/ai-content-authoring/actions.ts:11,57 | local generation moduleをserver actionから呼ぶ | ローカル用途のFS処理がserver graphに入る具体的な接続 |
| src/lib/ai-content-authoring/local-ai-generation.mjs:102–119 | root・可変parts・template.relativePathでFS操作 | 広いtracing候補。ただし実際のtrace範囲は未測定 |
| src/app/admin/pending-review/local/page.tsx:3,8,15 | dynamic routeからcwdをlocal reviewへ渡す | ローカル専用の意図だけではserver graphから外れない |
| src/lib/ai-content-authoring/local-review.mjs:16–40,46–54 | rootとpartsでディレクトリ・ファイルを解決 | 可変path由来の過大包含を確認する候補 |
| src/app/api/dmp-core/v1/actions/[id]/route.ts:2–3 | 共通dmp-action transportとstoreをimport | baseline storeはsrc/lib/dmpActionStore.ts:7–23のfail-closed facade。147 MBの原因とは立証できない |
| src/app/layout.tsx:1–5 | seo/CSS/Header/Footerをimport | layoutから画像ディレクトリ全体を読む接続は確認できない |

この checkout には `node_modules/`、`.next/`、`.vercel/` がない。ローカル Next guide、依存実サイズ、`.nft.json`、実際の生成Function一覧や共有IDは確認不能。通常buildは実記事や環境を読み込むため実施しなかった。旧ソースの合成fixtureでも本番SHAの不在を補えないため、今回それを本番再現として使用していない。

## Storage と route 行の読み方

Vercel公式資料では Function bundle の保存量は配置された各regionについて計上され、残存deployment・出力サイズ・保持期間が使用量を左右する。GB-monthの計測はprojectごとの日次最大保存量に基づく。13.33 GBだけから請求額は計算できない。圧縮や重複排除の具体的な計算式は今回確認した資料にはない。[Deployment Storage](https://vercel.com/docs/deployment-storage)

Next.js等では動的コードを可能な限り少数のFunctionsにまとめると説明されている。従って82 route行が82個の独立物理bundleであるとは限らず、`82 × 148 MB` を課金storageとして扱わない。同じサイズの繰り返しは共有と整合するが、本deploymentの共有を証明してはいない。[Runtimes](https://vercel.com/docs/functions/runtimes)

Usageのproject合計から原因deployment・file・functionは特定できない。可変pathはディレクトリ全体のtraceにつながり得る。Next.jsの `outputFileTracingIncludes` / `outputFileTracingExcludes` は制御手段だが、必要ファイルを残して動作検証する必要がある。[Optimizing Deployment Storage](https://vercel.com/docs/deployment-storage/optimize)

以上はManagerが2026-09-19に公式資料で独立確認した内容。deploymentの多発と大きなbundleの組み合わせは増加の説明候補であり、保持期間・region数・物理bundleの件数が未測定のため寄与率は未計算。

## MWF → commit/push → deployment の証拠範囲

baselineの `scripts/ops-mwf.mjs:230–241` は生成済みdraftをledgerに記録して `syncOwnedGeneratedDraft` に渡す。`scripts/lib/scheduled-draft-commit.mjs:343–366` はmain、fetch、ahead/behind、staged状態を確認し、439–458で検証と対象pathの一致、464でdraft commit、476–483でcommit内容、493–498で通常pushとremote SHA一致を確認する。これらはソース閲覧のみで実行していない。

同helperの243–275,322–324ではledgerの保持・更新処理があるが、439–498のcommit対象は検証済みdraft pathに限定される。baselineソースだけから「MWF state-only commitが5回deployを起こした」とは言えない。本番のbounded request/server authority transition実装とGit連携設定は未取得。`vercel.json` と `/api/mwf` はこのbaselineにはない。Git pushがdeploymentを起こすかは実際のproject設定とイベント照合が必要である。

## 最小修復案（未実装）

1. **先に本番traceを特定する。** 本番SHAの非機微source/configと既存の安全なbuild metadata（route→Function ID、region、圧縮有無を明記したbytes、`.nft.json` のpath一覧とサイズ集計）を取得し、blog/admin/DMP/MWF各1例と直前正常deploymentを比較する。compiled bundle本文、環境値、記事本文は不要。現状の根因確定を妨げる不足証拠はこれである。
2. **過大包含が確認されたpathだけを縮小する。** 画像混入なら、その読み取りimport/pathを狭める修正を第一候補とし、実際に不要と確認したpathだけroute別にtracing除外する。public画像の通常配信を維持し、記事・topic・承認policy・server起動に必要なdataは残す。ローカル専用FSヘルパーをserver graphから分離できるかも検討する。128,745,698 bytesは画像群の測定値であり、削減見込みや課金削減保証ではない。
3. **不要なstate-only deployは実態を確認後に抑える。** 本番の各commitが変更するpath、runtimeがstartup時/都度読む状態、deployment receiptが参照するSHAを対応づける。状態を都度GitHub等から読む設計で、コード・公開成果物・起動必須状態を変えないと立証できるものだけ、既存書き込みの集約/no-op更新抑制や狭いbuild-skip対象を候補にする。全data/logsを無条件skipしない。teacher adoption、承認/公開gate、server authority、exact deployment receipt確認、再送・復旧可能性を維持する。頻度と保持数が不明なので削減率は未提示。

修復時の合成データ検証は、blog一覧/詳細/カテゴリ/sitemapの公開一致、adminの未審査表示とreview、topic fallback、MWFの状態遷移・失敗再開・receipt一致、必要画像の配信を対象にする。本調査では修復・build・運用実行・保持設定変更・deployment削除をしていない。

## 再現可能な安全な確認

repo rootで次を実行。`ls-tree`はobject metadataだけを取得する。source閲覧は上表の明示pathだけを対象にし、data/content本文や認証・環境ファイルは開かない。

```sh
git rev-parse HEAD
git status --short --branch
git cat-file -t d1a6874f4350d1696670e44bf17dafaefcd976ad
git ls-tree -rl HEAD public
git ls-tree -rl HEAD | awk '{size[$5 ~ /^public\// ? "public" : $5 ~ /^content\// ? "content" : $5 ~ /^data\// ? "data" : $5 ~ /^scripts\// ? "scripts" : "other"] += $4} END {for(k in size) print k,size[k]}'
git log --format='%h %ad %s' --date=short -- next.config.ts
git log --format='%h %ad %s' --date=short -- public/images
git ls-files 'src/app/api/*' 'vercel*' '.github/workflows/*'
ls -d node_modules .next .vercel
git diff --check
git diff --no-index --check /dev/null diagnostics/vercel-storage-20260919.md
```

期待する不在確認エラー: production SHAの `cat-file`、未導入3ディレクトリの `ls`。最後のno-indexチェックで新規レポートの空白不備も確認する（新規差分ありを示すexit 1と空白不備の診断を区別する）。

変更ファイルは `diagnostics/vercel-storage-20260919.md` だけ。実装・commit・push・deploy・外部AI・通知・runner実行なし。build未実施（診断文書のみ、実データを読み込まない）。commit hashは新規なし、調査HEADは冒頭記載。

7 gateの適用案: targeted_tests/lint/build/browserはそれぞれ `PASS: N/A report_only_no_behavior_change`、`PASS: N/A markdown_no_configured_linter`、`PASS: N/A report_only_no_build_surface_no_real_data_ingestion`、`PASS: N/A non_ui_change`。git_diff_checkは上記2コマンド、secret_and_boundary_auditとdestructive_operation_auditは変更・実行履歴を独立reviewで確認する。これらはManager/reviewerの最終判定を先取りする記述ではない。

レポート作成後の期待statusは `## HEAD (no branch)` と `?? diagnostics/`（untracked directory集約表示）。最終実測statusと独立review/contractの結果はManagerの終端報告に記録する。本番への厳密な原因帰属は不足証拠のため未完了として扱う。


## 保存元・最新ローカルrefの追加調査

保存元 `/Users/caelus/projects/aisoukai-media` はHEADが同じSep5 commitでも、sourceに未commit変更があり、node_modulesと.nextが存在した。保存元は一切変更していない。refsをcheckout/fetchせず `git show origin/main:<明示source path>` で閲覧した。`origin/main` は `72439cd8bcc09ae685ef5a7a1603a3f101128e9f`（Sep15）、本番d1a6874は依然不在。従って最新refも本番そのものではない。

ローカルの `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` を確認した。Nextはimport/require/fsを静的解析し、nft内のpathはmanifest所在ディレクトリ基準。route単位でinclude/excludeを制御できるが、必要ファイルを保持すること、repo rootの広いglobを避けることが重要。standalone出力でもpublicは既定コピー対象ではなく、本件public包含を当然のNext動作として扱わない。

### 既存traceの実測（本文はmanifestのみ閲覧）

`.next/**/*.nft.json` は32件、mtimeはUTC 2026-09-04 05:50:56.140704〜.159510。本番buildのprovenanceは未検証。各manifestのfilesを解決・重複排除して現在の `stat().st_size` を加算した。compiled bundle・data・article・log本文は開いていない。**以下は古いtrace membership × 現在のファイルサイズであり、当時のbuild bytesや本番の圧縮bundleサイズではない。**

| trace（.next/server/app/相対） | 現存参照ファイル合計bytes | public bytes | tmp bytes |
| --- | ---: | ---: | ---: |
| admin/pending-review/page.js.nft.json | 152,665,376 | 128,745,698 | 17,005,790 |
| admin/posts/page.js.nft.json | 152,469,445 | 128,745,698 | 17,005,790 |
| admin/posts/[slug]/edit/page.js.nft.json | 152,461,355 | 128,745,698 | 17,005,790 |
| admin/article-topics/page.js.nft.json | 152,281,194 | 128,745,698 | 17,005,790 |
| admin/page.js.nft.json | 2,635,543 | 0 | 0 |
| blog/[slug]/page.js.nft.json | 22,388,805 | 0 | 0 |
| api/dmp-core/v1/actions/route.js.nft.json | 1,668,320 | 0 | 0 |

上表の参照ファイル欠落は0。Managerも大きい4traceでoutside-project pathが0と独立確認した。大きい4件は各175 public paths（合計サイズはGit側185件と一致）・12 tmp paths・53 logs paths・62 docs paths・62 tests pathsを含み、ほかにscripts/src/config等も含む。public内訳はlibrary110,707,159 bytes、campaign17,924,584 bytes、その他113,955 bytes。大きい4件でpublic+tmpが145,751,488 bytesを占めることは実測できた。4件を合算して課金量にしない。

小さいblog traceの最大要素はMac用 `node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips-cpp.8.17.3.dylib` 16,076,984 bytes。Mac環境の証拠をLinux本番の依存サイズとして流用できない。32traceのunique参照pathは1,540、現在の現存サイズ合計180,160,741 bytes。これはtrace内でpathを重複排除したローカル参考値であって、Vercelのbundle共有・課金dedupを再現した値ではない。/api/mwf traceは存在しない。

この証拠により「public混入は単なる候補」から「古いローカルadmin traceでは混入を確認」へ診断が進んだ。過大trace自体は9月14日より前から存在した可能性を示すが、mtimeは作成commitの証明ではない。現在のsourceとtraceの対応も断定しない。保存元のnext.config.tsにはHEADとの差分がなく、未commit差分はops-mwf.mjsが9追加/250削除、local-ai-generation.mjsが59追加/15削除、local-review.mjsが3追加/1削除、package.jsonが1追加。これらの新sourceを古いtraceの原因と決め付けない。

### Sep15 refで確認したstate commit経路

以下の行番号は `72439cd8bcc09ae685ef5a7a1603a3f101128e9f` のソース。

- `next.config.ts:3–7`: 空のNext設定。tracingの絞り込みなし。
- `scripts/lib/mwf-server-client.mjs:19–26`: 同一requestが既にあれば再commitせず、なければbounded request/inventory等をcommitしてmain refをforce:falseで更新する。
- `src/lib/mwfServerAuthority.mjs:21–26`: requestの検証後に署名claimをcommit。30行のprepareでは記事変更を伴わずready resultを生成し、34–42行で入力を再検証してdone claimをcommit。
- `src/lib/mwfServerRuntime.ts:93–95`: 上記commitは `commitGitHubFiles('MWF server authority transition', files, {expectedHeadSha:head})` に接続。署名とCASの排他・改変検知を保持する必要がある。
- 同runtimeの126行のreflect内には `readFile(join(process.cwd(),request.artifactPath!))` がある。可変repo相対pathは広いtracing候補だが、/api/mwf既存traceがないため因果は未立証。

したがってfresh prepare成功経路だけでもmain更新が3回起き得る。これは本番画面の「MWF bounded request」「MWF server authority transition」と整合する具体的説明だが、全3回がdeployされたことや9月18日の5件と同一イベントであることは未検証。実行もしていない。

### 修復提案の優先度更新

1. root-relative可変FS pathを使うserver依存を正確な用途別ディレクトリに絞ることを第一候補にする。例えばMWFの読み取りは既存のartifact path検証・hash比較を保持し、静的な `content/posts` prefixと検証済みbasenameから組み立てる案を検証する。既存admin traceで不要混入したpublic/tmp/tests/docs等を、起動と各routeの必要性を調べたうえで限定除外する。特にpublic+tmpの測定145.75 MBが調査優先度の根拠になるが、本番削減予測ではない。source変更前に本番sourceの同一pathと安全なtraceで照合する。
2. state-only main更新がdeploymentを起こす設定なら、request/claimのCAS・署名・状態保存は維持しつつ、**状態だけの変更をbuild-triggerから狭く分離**する。prepare/statusが最新stateをGitHubから読むか、実際の本番receiptが何を検証するかを確認する。article変更が同居するdone commitはskip不可。adoption/policy変更や公開記事、server起動依存もskip不可。claim commitを単に削除・統合すると排他/再検証を壊すため採用しない。
3. source/trace/deployment ID対応を得た後、同じ合成入力・同じruntimeで修正前後のtrace bytesを比較する。Storageの削減見込みはunique Functions・region・保持deploymentと圧縮定義を確認後に算出する。

再現手順は保存元の明示 `.nft.json` の `files` だけをJSON解析し、`manifest.parent / file` をresolve、setで重複排除、statサイズを合計する。環境/認証/data本文やcompiled JSは読まない。source参照例: `git show 72439cd8bcc09ae685ef5a7a1603a3f101128e9f:src/lib/mwfServerAuthority.mjs`。本調査ではref変更・source変更・dependency install・build・運用実行を行っていない。
