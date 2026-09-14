# MWF delivery repair — local implementation, not deployed

Teacher evidence: `teacher_20260914_explicit_blog_three_levels_and_scoped_validator_execution_amendment`. Policy: `aisoukai-media-tiered-blog-2026-09-14`.
Only this blog’s Mon/Wed/Fri 08:30 JST workflow uses the three publication levels below. The current task changes isolated source and synthetic tests only. Existing live checkout and launchd remain untouched.

## Durable stages and recovery

Selected → generating → saved → pending-reflection → reviewable → sending → notified.
Every transition is appended and fsynced. The article is fsynced to a temporary file then renamed to its deterministic identity before saved state; a restart recovers that article without generation. A torn journal fails closed. Retained temporary files and lock database are not deleted by this workflow.

SQLite `BEGIN IMMEDIATE` supplies the process-exclusive lock; OS process death releases it without stale timeout or rename takeover. Node runtime must support built-in `node:sqlite` (validated on installed Node 26). Do not migrate runtime by overwriting an active journal.

Each sync attempt starts from fetched main in a fresh bare repository, writes exactly one validated draft or independently certified artifact and pushes without force. A concurrent main update retries from its latest parent (at most three attempts). Exact existing artifact recovers an interrupted push. Same-path differences remain conflict except a certified minor edit with the exact existing Human-approved blob; other queued articles continue. Development checkout status and unrelated commits are never copied or staged.

Only exact authenticated production admin reflection allows a review notification. A push/remote SHA, HTTP 200 or local source is insufficient. Retry-only mode never invokes generation; it retries saved sync/reflection and definite notification failures. A conflict or unknown outcome remains visible rather than being reported as success.

`npm run ops:mwf:status -- --state-root /absolute/dedicated/state` reports not-run, item stages, last success and next schedule. This command reads status only. Invocation without bound adapters exits 2; incomplete delivery exits 1. `--status` exit 0 only means the status read succeeded, and its payload must be used for business outcome.

## Validation and rollout remaining

`npm run test:mwf-delivery` uses synthetic temporary stores, local bare Git repos, injected transports, actual CLI/coordinator, real process lock contention and restart recovery. No test removes files or sends network requests.

Do not run the old launchd installer/status as the new health check. The old installer still targets the historical `--force` entrypoint. Reviewed introduction must replace that job target with a dedicated runtime, never the development checkout. Production receipt route deployment, source version/job-target comparison and one scheduled slot's same-article draft/reflection/notification evidence remain required before calling operations restored. Existing drafts/review history must be preserved and accounted for before any migration; this task did not read or migrate them.

## Production executable

Production wiring is implemented in `scripts/lib/mwf-production.mjs`, invoked by `node scripts/ops-mwf.mjs --production`. No application callback remains for the operator to implement. Default transports are native fetch and absolute `/usr/bin/git`; tests replace those at the factory boundary. Runtime reads environment references only at explicit production invocation; it never loads `.env` files.

Existing environment names consumed: `OPENAI_API_KEY`, `GITHUB_REVIEW_TOKEN`, `ADMIN_REVIEW_COOKIE_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Values must be supplied by the existing approved host environment provisioning; never paste them into CLI arguments, source, plist, journal or reports. Additional non-secret configuration:

- `MWF_STATE_ROOT=/Users/caelus/Library/Application Support/AisoukaiMWF/state`
- `MWF_TOPICS_PATH=/Users/caelus/Library/Application Support/AisoukaiMWF/input/article-topics.csv`
- `MWF_INVENTORY_PATH=/Users/caelus/Library/Application Support/AisoukaiMWF/input/reconciled-inventory.json`
- `MWF_RUNNER_VERSION`: exact reviewed 40-character commit deployed in the release directory.

The factory checks actual HEAD and absence of changed/untracked runner code against that version. State must be outside the code release. Git transport is pinned to `https://github.com/aisokai/aisoukai-media.git` and main. Auth is supplied only in child environment, with global/system Git config disabled; stderr is never returned or logged. The admin session uses the existing cookie/HMAC scheme and receipt client. Telegram target is only the configured teacher chat. Provider and Telegram failures never print responses or URLs containing tokens.

Automatic selection fetches the fixed canonical GitHub `data/article-topics.sample.csv` under the coordinator lock and snapshots the row before generation. Fetch failure stops new intake while saved deliveries retry. MWF_TOPICS_PATH is historical input metadata, not a stale automatic fallback. Supported input is the existing article-topic CSV (`id`/`topic_id`, `title`/`title_candidate`, category and existing optional prompt fields), not the distinct theme-topic CSV. Empty titles and duplicate IDs reject intake while saved articles continue retrying. Existing used topics and blocked/rejected/archived row statuses are excluded. Like the former `--publish-today` MWF mode, candidates may have future planned dates; the draft date is this scheduled slot. Once selected, CSV edits cannot change the persisted generation input. The scheduler uses the current JST M/W/F slot after 08:30; outside that window it retries saved work only and never backfills generation automatically.

The OpenAI request reuses the existing article prompt and generator settings (`gpt-5-nano`, 4000 completion tokens, minimal reasoning). There are no SDK retries. A request correlation ID is not a provider idempotency guarantee; ambiguous completion still holds `generation-unknown`. A verified licensed canonical library image is selected when available. The separate reviewer inspects the actual image bytes; absent image evidence leaves a draft. Full per-article validation precedes sync.

## Historical preservation and introduction commands — NOT EXECUTED

Run preservation only in the later authorized introduction stage, against the declared non-sensitive editorial directory. It copies exact bytes, rejects symlinks/hardlinks/nonregular files and overlapping directories, never rewrites originals and never syncs or approves them:

```sh
/opt/homebrew/bin/node scripts/mwf-preserve-drafts.mjs --source /Users/caelus/projects/aisoukai-media/content/posts --destination '/Users/caelus/Library/Application Support/AisoukaiMWF/preservation/2026-09-14'
```

The generated immutable inventory lists path/hash/topic IDs and unresolved IDs, with `reconciled:false`. Before introduction, compare each preserved unreviewed artifact against the existing authenticated admin source; account for already synced, local-only and conflicting articles individually. Preserve local-only originals, do not automatically rename them into the new deterministic namespace or silently discard backlog. Resolve unknown topic IDs and prepare a separate `input/reconciled-inventory.json` with all used/blocked IDs, `unidentifiedTopics:[]`, and `reconciled:true` only after the account is complete. The production factory refuses an unreconciled inventory. This is configuration/data reconciliation, not missing adapter code.

Dedicated immutable release directory: `/Users/caelus/Library/Application Support/AisoukaiMWF/releases/<reviewed-commit>`. Deploy the reviewed repository there using the normal reviewed non-force code delivery procedure, install its locked dependencies there, and deploy the admin receipt route through the normal application deployment. Do not point the job at the development checkout.

Production job entry (after environment provisioning and integration authorization):

```sh
/opt/homebrew/bin/node '/Users/caelus/Library/Application Support/AisoukaiMWF/releases/<reviewed-commit>/scripts/ops-mwf.mjs' --production
```

The reviewed job plist is `/Users/caelus/Library/LaunchAgents/com.mitani.aisoukai-media-ops-mwf.plist`. Its `ProgramArguments` must be exactly the Node path, release script path above, and `--production`; its calendar remains weekdays 1/3/5 at 08:30 with the host timezone verified as JST. `WorkingDirectory` must be that immutable release directory. Do not run the old installer, which still generates `--force`. Status command:

```sh
/opt/homebrew/bin/node '/Users/caelus/Library/Application Support/AisoukaiMWF/releases/<reviewed-commit>/scripts/ops-mwf.mjs' --status --state-root '/Users/caelus/Library/Application Support/AisoukaiMWF/state'
```

The scoped governance amendment now represents this blog’s reviewed runtime operations. This worker phase still performed local synthetic validation only. Actual introduction, deployment, job replacement and one scheduled-slot verification require the manager’s matching execution contract and independent review; no additional adapter coding is required.

Launchd does not inherit interactive shell variables. If the established installation uses the existing `.env.local`, the future authorized runtime can use Node's env-file facility without copying its contents. The exact future invocation is:

```sh
/opt/homebrew/bin/node --env-file=/Users/caelus/projects/aisoukai-media/.env.local --env-file='/Users/caelus/Library/Application Support/AisoukaiMWF/runtime-metadata.env' '/Users/caelus/Library/Application Support/AisoukaiMWF/releases/<reviewed-commit>/scripts/ops-mwf.mjs' --production
```

`runtime-metadata.env` contains only the four non-secret MWF path/version settings above. Plist ProgramArguments must include those two env-file arguments before the release script. The actual protected env file was not opened, copied, printed or validated in this task; use of it is a future authorized runtime operation, not permission for an agent to inspect it. If the host instead already provisions the launchd environment, retain that established mechanism; do not assume shell exports propagate. Deployed admin must use the same `aisokai/aisoukai-media` repository and `main`; conflicting runtime overrides fail before work.

Missing provider/transport credentials affect their own stage rather than blocking the whole queue. Unreconciled or malformed inventory blocks new topic intake; already saved artifacts still retry sync/reflection/notification. No-unused-topic and intake failures are visible in structured status and are not reported as a newly completed scheduled delivery.


## Three publication levels

Normal automatic publication requires a fresh authenticated teacher topic action, a purpose-bound signed adoption receipt for that exact canonical row, and independent content/image/duplication/medical/validation review. Old CSV `approved` and old `auto_approved` flags alone are insufficient. The reviewer is a separate actual provider call whose response identity differs from generation. It signs the final content hash using the existing server secret reference; all public surfaces require the actual article path, current adopted topic version, current image bytes and license metadata. Revocation, edits, protected inputs, ambiguous results or important treatment/effect/safety/cost changes fail closed. Existing Human-approved articles retain exact-hash approval, except rejected/archived/future/protected states.

Minor edits are explicitly invoked against an existing canonical Human-approved article. The runtime fetches the actual baseline, independently reviews the concrete difference, and synchronizes with an exact baseline blob compare-and-swap. An arbitrary local baseline or model assertion is insufficient:

```sh
/opt/homebrew/bin/node --env-file=/Users/caelus/projects/aisoukai-media/.env.local --env-file='/Users/caelus/Library/Application Support/AisoukaiMWF/runtime-metadata.env' '/Users/caelus/Library/Application Support/AisoukaiMWF/releases/<reviewed-commit>/scripts/mwf-minor-edit.mjs' --production --path content/posts/<existing-slug>.md --proposal /absolute/non-sensitive-proposal.md
```

Important changes remain drafts until the existing authenticated Human review action. Historic stock is preserved; the new policy never retroactively approves it. Normal published notification requires both canonical source and exact deployed bytes; otherwise the queue remains pending reflection. Telegram never provides approval controls.

## Existing job replacement — commands prepared, not run

After deployment, inventory reconciliation, immutable release/dependencies, non-secret runtime metadata and manager execution gates are complete, substitute the reviewed full commit. These commands preserve the existing plist and calendar; generated configuration has no RunAtLoad or KeepAlive, and does not kickstart a run:

```sh
/opt/homebrew/bin/node scripts/mwf-runner-plist.mjs <reviewed-commit> > /tmp/mwf-reviewed-runner.plist
/usr/bin/plutil -lint /tmp/mwf-reviewed-runner.plist
/bin/cp -n /Users/caelus/Library/LaunchAgents/com.mitani.aisoukai-media-ops-mwf.plist /Users/caelus/Library/LaunchAgents/com.mitani.aisoukai-media-ops-mwf.plist.pre-tiered-20260914
/bin/launchctl bootout gui/$(id -u)/com.mitani.aisoukai-media-ops-mwf
/bin/cp /tmp/mwf-reviewed-runner.plist /Users/caelus/Library/LaunchAgents/com.mitani.aisoukai-media-ops-mwf.plist
/bin/launchctl bootstrap gui/$(id -u) /Users/caelus/Library/LaunchAgents/com.mitani.aisoukai-media-ops-mwf.plist
```

Verify host timezone JST and no in-flight run before bootout. If backup already exists, stop and preserve it rather than overwrite. Rollback uses bootout of this same label, copies that preserved plist back, then bootstrap of that same path; never unload other jobs. No protected environment contents are copied, printed or inspected. Observe the next ordinary scheduled slot through structured stage metadata and the expected teacher notification before reporting operational restoration.
