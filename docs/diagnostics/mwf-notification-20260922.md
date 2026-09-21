# 2026-09-21 MWF notification interruption

## Observed failure

The existing launchd job ran at 2026-09-21 08:30 JST and exited 1. Its latest result was `intakeError: candidate-holds`; adopted topics 003 and 023 were held with `canonical_evidence_unavailable`. The prior September 18 `lastSuccessAt` did not establish success on September 21. No new September 21 article event was present in the metadata inspection.

A comparison-list check at source `0670ad2` found six current article Git blobs absent from the historical inventory/claim versions. Four were the image edits from commit `23f0808`: two August 1 whitening drafts without Human approval receipts, and the September 14 gum/September 16 caries articles with older Human receipts. The other two were ordinary Human approvals (floss and dental-anxiety articles).

The previous `approvedComparisonUpdates` required every changed known article to have a current exact Human approval receipt. The first whitening draft therefore threw `approval_current_unproven`. The server converted the exception into `canonical_evidence_unavailable` for every candidate. Image-only draft editing unintentionally stopped unrelated generation before an article review notification could exist. The delivery coordinator exposed an intake error in its local result but had no intake-stop notification path.

## Bounded repair

- All historical comparison records remain present. Unknown paths, unverifiable receipts, ambiguous public metadata, changed bodies and unrelated metadata edits remain blocked.
- Changed known files use an explicit `comparisonOnly` projection, bound to their current Git blob and known public metadata. Its digest is not a content hash or approval record. The Mac constructs metadata candidates without reading article bodies; the server authenticates and checks the exact current bytes before returning a matching prepared comparison hash.
- The existing exact Human receipt path remains valid. For an unreviewed image edit, the server compares opaque bytes against authenticated historical bytes and requires an unchanged body, unchanged non-image metadata, and explicit `draft:true`, `reviewed:false`, `auto_approved:false`. Human-approved baselines are located in at most 20 commits for that exact known article path at the pinned branch head, and accepted only when their SHA-256 matches the authenticated receipt. Other drafts use the authenticated inventory/claim Git blob and SHA-256. Human audit fields remain byte-for-byte unchanged; no inferred audit-field equivalence is allowed. This establishes only duplicate-comparison metadata, never image approval or publication eligibility.
- An intake stop now produces one metadata-only notice per scheduled slot through the existing teacher notification adapter. Durable `sending` is written under the existing run lock before the call. Sent, definite failure and unknown are all retained without a second attempt for that slot; a crash after starting a call is treated as unknown. No article title/body, provider error text or secret is included. A stop notice cannot update article `lastSuccessAt` or turn an intake error into success.

## Local verification

- `node --test tests/mwf-human-comparisons.test.mjs tests/mwf-production.test.mjs tests/mwf-delivery.test.mjs`: 41 tests passed.
- Targeted ESLint for the eight changed implementation/test files passed.
- `git diff --check` passed.
- Synthetic regressions cover opaque body non-decoding, server/Mac comparison identity, image hash fields, protected approval boundaries, changed body/metadata, forged baselines, exact Human receipts, bounded history and wrong-baseline rejection, notification restart/timeout behavior, and preservation of failed intake status.
- This document records local repair evidence. It does not claim production deployment, a live generation, a Telegram send, or verified recovery of the next scheduled run. The Manager records exact-live-artifact validation, independent review, build and any separately authorized rollout.

No existing article, image, adoption, signature or Human approval record was changed by this code repair. No credential values, private messages or patient data were read. No live business operation was invoked by the worker.
