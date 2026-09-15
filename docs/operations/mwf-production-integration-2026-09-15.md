# MWF production baseline integration — 2026-09-15

This local stage uses `/private/tmp/mwf-production-02d7`, branch
`codex/mwf-production-02d7`, based on fetched production main `9492d5b`.
It selectively integrates the reviewed MWF fixes from `da51f482` instead of
replacing production with the development branch's full tree.

The production baseline already contains the delivery store, isolated draft
sync, inventory, initial three-tier policy and server authority foundation.
Only the missing authenticated endpoint/client, signed Human minor baseline,
minor proposal review, safe article serialization, independent future-date
checks, reviewed immutable runner installer and their tests/docs are added.
Authoring workspace, local-admin setup, SNS and candidate-one changes from the
other ancestry are excluded. Existing content/data, article approvals/rejections,
archived states and the canonical dirty development checkout remain untouched.

The old production-only `ops-mwf-checkout.test.mjs` is retained and updated to
exercise the real restored CLI parser against synthetic effect modules. It
checks unsupported legacy flags fail, unbound runtime returns stopped rather
than false success, status/import avoid effects, and the import/network guard
rejects unintended effects. Package scripts retain this regression alongside
the expanded MWF tests. No runtime business logic differs from the previous
reviewed repair artifact; the extra integration changes are this test and script
wiring.

## Verification

Helpers were inspected before execution. The targeted tests use synthetic
fixtures, injected HTTP/provider/filesystem/launchctl effects and local temporary
Git repositories; no real article inventory is read in this stage.

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/tmp node --test tests/mwf-*.test.mjs tests/tiered-publication.test.mjs tests/ops-mwf*.test.mjs tests/scheduled-article-flow.test.mjs tests/setup-launchd-mwf-cleanup.test.mjs tests/dmp-final-flow.test.mjs tests/post-publication-status.test.mjs
```

97 tests PASS. ESLint on changed/new JavaScript and TypeScript paths PASS, with
zero diagnostics. `git diff --check` PASS. Browser verification is N/A because
this stage changes no visual markup or layout.

The source-only build at `/tmp/mwf-production-02d7-build-86xuldkj` contains empty
content/posts, data and image directories and no copied environment file. It
reuses installed dependencies without network installation.

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/tmp NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SITE_URL=https://safe-validation.invalid node node_modules/next/dist/bin/next build --webpack
```

Next 16.2.6 webpack compilation, TypeScript and static generation PASS. Logs:
`/tmp/mwf-production-02d7-tests.log`, `/tmp/mwf-production-02d7-lint.log`,
`/tmp/mwf-production-02d7-build.log`.

The earlier local stage's real-editorial-read incident is retained in
[mwf-local-verification-2026-09-15.md](mwf-local-verification-2026-09-15.md).
Its subsequent synthetic-only remediation does not erase that history.

## Execution handoff

The sorted source/configuration/dependency manifest for this exact production
integration is `/tmp/mwf-production-02d7-release-manifest.json`. Its hash is
reported separately for independent review. The previous development manifest
cannot stand in for this different baseline.

This worker performed no commit, remote write, deployment, runner installation,
AI request, article review/publication or notification. The Manager must use a
separately validated closed blog execution stage, exact manifest and current
remote/deployed identities. Genuine topic adoption, reviewer availability and
per-article business delivery remain runtime checks, never implied by these
synthetic results. Missing genuine adoption must stay on hold; do not manufacture
approval or weaken prepare to make generation proceed.
