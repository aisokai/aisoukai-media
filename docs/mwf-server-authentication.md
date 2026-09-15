# MWF server authentication

The Mac runner uses its existing native GitHub login for the fixed production
`/api/mwf` endpoint. Only the runtime captures `gh auth token --hostname github.com`
output, uses it as an HTTPS Bearer header, and discards it after the request. It
must never log, persist, or return that value or command diagnostics. Agents must
not execute the credential command. `ADMIN_REVIEW_COOKIE_SECRET` stays on the
production server and is never copied to the Mac.

Every endpoint method, including status and diagnostics, verifies the caller's
credential against `https://api.github.com/repos/aisokai/aisoukai-media`. Only that
exact repository with `permissions.push === true` is accepted. Missing,
read-only, invalid, redirected, or unavailable authentication fails closed before
creating the authority runtime. GitHub requests and production requests reject
redirects. Authentication grants invocation only: canonical request identity,
current signed adoption, independent article review, exact content/image/policy
binding, and deployed reflection remain mandatory.

Preparation is local evidence validation without paid AI. Its claim is scoped to
the MWF slot, so an unchanged topic that never generated can be prepared on a
later scheduled day. Reusing a completed preparation revalidates current adoption
and returns the current comparison hash. Article-review claims remain scoped to
topic/version across slots, preserving the existing single-charge behavior.

These changes are verified with synthetic credentials and mocked transports.
They do not demonstrate a production rollout, native login availability, or an
actual scheduled run. No secret replication is required.

## Minor corrections

`ops:mwf:minor -- --proposal /absolute/proposal.json` submits a body-only
correction proposal using the same native GitHub authentication. The proposal
contains exactly `schema: 1`, `artifactPath`, `baselineBlob` (SHA-256 of the exact
approved Markdown bytes), and `content` (the proposed complete Markdown body).
The CLI normalizes JSON serialization; the server rejects noncanonical bytes so
whitespace/key-order variants cannot create another paid review identity.

The original article remains untouched while the immutable proposal and bounded
request are synchronized under `data/mwf`. The production server requires a
signed `human-approved-baseline` receipt matching the original path, raw bytes,
content fingerprint, reviewer and timestamp before decoding the baseline. Only
the existing authenticated new Human approval action issues this receipt,
atomically with the approved article and review log. Merely finding legacy
`reviewed:true`, reviewer text, or a matching unsigned fingerprint never creates
provenance. Unverifiable historical baselines remain on hold; there is no blanket
reapproval or theme readoption.

Independent review receives the actual old and proposed article, current image
and comparison metadata. Only `minor` with unchanged medical meaning and all
existing checks passing can produce a signed correction. Important/unknown
changes, missing evidence, a changed baseline/proposal or comparison set retain
the original article and proposal. A final branch compare-and-swap protects the
replacement; success is reported only after exact deployed reflection.

The generated launchd plist sets the nonsecret `MWF_RUNNER_VERSION` to the same
reviewed commit as its program path. Existing environment files need no edits or
copies; Node's environment-file loading preserves the process environment value.
No job installation or live run is performed by plist generation.
