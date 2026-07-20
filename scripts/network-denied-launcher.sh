#!/bin/sh
# Public validation entrypoint: always creates a fresh strict sandbox.
set -eu
if ! command -v sandbox-exec >/dev/null 2>&1; then
  echo 'HUMAN_GATE_REQUIRED: sandbox-exec is required for safe validation' >&2
  exit 1
fi
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$project_root"
profile="(version 1) (allow default) (deny network*) (deny file-read-data (literal \"${project_root}/.env.local\"))"
exec env NEXT_PUBLIC_SITE_URL='https://safe-validation.invalid' sandbox-exec -p "$profile" /bin/sh -c 'node scripts/validate-safe-test-path.mjs && node scripts/run-safe-tests.mjs && npm run lint && npx next build --webpack && npm run validate:posts'
