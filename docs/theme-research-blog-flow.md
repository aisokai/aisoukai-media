# Theme Research to Blog Flow

## Ownership

- Marketing Research owns ThemeNotebook v2 and the canonical `theme-topic-csv.v1` export.
- The Blog department selects `blog` topics, creates drafts, audits them, and requests Human review through Telegram.
- Exported topics are not approved articles. Drafts remain `reviewed: false` and `publication_status: draft`.

## Runbook

Export the current research snapshot. The command is a dry-run unless `--write` is explicit.

```bash
cd ~/dmp-content-core
npm run export:theme-topic-csv -- --write
```

Inspect the next eligible Blog topic without generating or notifying.

```bash
cd ~/projects/aisoukai-media
npm run theme-blog:dry-run -- --publish-date YYYY-MM-DD
```

Generate and audit one draft. This does not notify Telegram.

```bash
npm run theme-blog:generate -- --publish-date YYYY-MM-DD
```

Request review through Telegram only when generation and audit must run together. Live notification requires explicit `--notify` and an authenticated HTTPS review URL.

```bash
npm run theme-blog:generate -- --publish-date YYYY-MM-DD --notify --review-url https://REVIEW_HOST/admin/pending-review
```

The Telegram message contains a review link only. Telegram approve/publish commands, Git operations, and publication APIs are outside this flow.
